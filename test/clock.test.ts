import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerClock } from '../src/core/clock.js';
import type { FetchTime } from '../src/core/types.js';

/**
 * A controllable device clock. `now()` returns whatever `t` is, and each call
 * can be made to advance by a fixed step to simulate elapsed time across
 * `t0`/`t3` measurements.
 */
function makeNow(start = 1_000_000, step = 0) {
  let t = start;
  const now = () => {
    const v = t;
    t += step;
    return v;
  };
  return {
    now,
    set: (v: number) => {
      t = v;
    },
    get: () => t,
  };
}

describe('createServerClock — offset math', () => {
  it('computes offset = serverTime + rtt/2 - t3', async () => {
    // RTT is measured with the monotonic clock; t3 with the wall clock.
    const mono = makeNow(1000, 10); // m0=1000, m1=1010 => rtt=10
    // server is 5000 ahead of the device midpoint.
    const serverTime = 6000;
    const fetchTime: FetchTime = async () => serverTime;

    const clock = createServerClock({
      fetchTime,
      samples: 1,
      now: () => 1010, // t3 = 1010
      monotonic: mono.now,
    });

    await clock.sync();
    // t3=1010, rtt=10 => offset = 6000 + 5 - 1010 = 4995
    expect(clock.getOffset()).toBe(4995);
    clock.dispose();
  });

  it('now() returns deviceNow + offset', async () => {
    let device = 1000;
    const fetchTime: FetchTime = async () => 2000;
    const clock = createServerClock({
      fetchTime,
      samples: 1,
      now: () => device,
      monotonic: () => 0, // rtt = 0
    });
    await clock.sync();
    // rtt = 0 => offset = 2000 + 0 - 1000 = 1000
    expect(clock.getOffset()).toBe(1000);
    device = 5000;
    expect(clock.now()).toBe(6000);
    clock.dispose();
  });

  it('keeps the sample with the smallest rtt (least jitter)', async () => {
    // rtt per sample comes from the monotonic clock ([m0, m1] pairs); t3 from
    // the wall clock (one reading per sample).
    const monoReadings = [
      1000, 1100, // sample 0: rtt = 100
      2000, 2010, // sample 1: rtt = 10  <-- lowest
      3000, 3050, // sample 2: rtt = 50
    ];
    const t3Readings = [1100, 2010, 3050];
    let mi = 0;
    let ni = 0;
    const monotonic = () => monoReadings[mi++]!;
    const now = () => t3Readings[ni++]!;

    // server returns a value tied to which sample; we want to confirm the
    // low-rtt sample's offset wins. server = 10000 constant.
    const fetchTime: FetchTime = async () => 10000;

    const clock = createServerClock({ fetchTime, samples: 3, now, monotonic });
    await clock.sync();

    // Best sample is sample 1: t3=2010, rtt=10 => 10000 + 5 - 2010 = 7995
    expect(clock.getOffset()).toBe(7995);
    clock.dispose();
  });

  it('a wall-clock jump during a sample does not corrupt the RTT/offset', async () => {
    // The device wall clock leaps +1_000_000ms *during* the fetch. Because RTT
    // is measured monotonically, the jump can't produce a bogus (or negative)
    // RTT — t3 simply reflects the post-jump device time, which is exactly what
    // the offset must cancel.
    const mono = makeNow(500, 20); // m0=500, m1=520 => rtt=20 (clean)
    let device = 1_000;
    const fetchTime: FetchTime = async () => {
      device += 1_000_000; // wall clock jumps mid-request
      return 2_000; // true server time
    };
    const clock = createServerClock({
      fetchTime,
      samples: 1,
      now: () => device, // t3 reads the post-jump wall time: 1_001_000
      monotonic: mono.now,
    });

    await clock.sync();
    // t3 = 1_001_000, rtt = 20 => offset = 2000 + 10 - 1_001_000 = -998_990
    expect(clock.getOffset()).toBe(-998_990);
    // now() = deviceNow + offset = 1_001_000 + (-998_990) = 2_010 ≈ true server time
    expect(clock.now()).toBe(2_010);
    clock.dispose();
  });
});

describe('createServerClock — status transitions', () => {
  it('goes idle -> syncing -> ready on success', async () => {
    const statuses: string[] = [];
    const clock = createServerClock({
      fetchTime: async () => 1000,
      samples: 1,
      now: () => 1000,
    });
    expect(clock.getStatus()).toBe('idle');
    clock.subscribe((s) => statuses.push(s));
    await clock.sync();
    expect(statuses).toEqual(['syncing', 'ready']);
    expect(clock.getStatus()).toBe('ready');
    clock.dispose();
  });

  it('goes syncing -> error when fetchTime rejects', async () => {
    const statuses: string[] = [];
    const clock = createServerClock({
      fetchTime: async () => {
        throw new Error('network down');
      },
      samples: 2,
      now: () => 1000,
    });
    clock.subscribe((s) => statuses.push(s));
    await clock.sync();
    expect(statuses).toEqual(['syncing', 'error']);
    expect(clock.getStatus()).toBe('error');
    expect(clock.getOffset()).toBe(0);
    clock.dispose();
  });
});

describe('createServerClock — degrade to device time', () => {
  it('sync() is a no-op with offset 0 and no fetchTime', async () => {
    const clock = createServerClock({ now: () => 4242 });
    await clock.sync();
    expect(clock.getOffset()).toBe(0);
    expect(clock.getStatus()).toBe('ready');
    expect(clock.now()).toBe(4242);
    clock.dispose();
  });
});

describe('createServerClock — auto resync', () => {
  beforeEach(() => {
    // Ensure a clean visibility state.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  it('resyncs on visibilitychange when visible', async () => {
    const fetchTime = vi.fn(async () => 1000);
    const clock = createServerClock({
      fetchTime,
      samples: 1,
      now: () => 1000,
      resyncOnVisible: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    // allow the async sync to run
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchTime).toHaveBeenCalled();
    clock.dispose();
  });

  it('resyncs on online event', async () => {
    const fetchTime = vi.fn(async () => 1000);
    const clock = createServerClock({
      fetchTime,
      samples: 1,
      now: () => 1000,
      resyncOnOnline: true,
    });
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchTime).toHaveBeenCalled();
    clock.dispose();
  });

  it('does NOT resync when resyncOnVisible is false', async () => {
    const fetchTime = vi.fn(async () => 1000);
    const clock = createServerClock({
      fetchTime,
      samples: 1,
      now: () => 1000,
      resyncOnVisible: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchTime).not.toHaveBeenCalled();
    clock.dispose();
  });
});

describe('createServerClock — periodic resync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires sync on the interval', async () => {
    const fetchTime = vi.fn(async () => 1000);
    const clock = createServerClock({
      fetchTime,
      samples: 1,
      now: () => 1000,
      resyncIntervalMs: 5000,
    });
    expect(fetchTime).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchTime).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchTime).toHaveBeenCalledTimes(2);
    clock.dispose();
  });
});

describe('createServerClock — dispose', () => {
  it('removes listeners so no resync happens after dispose', async () => {
    const fetchTime = vi.fn(async () => 1000);
    const clock = createServerClock({
      fetchTime,
      samples: 1,
      now: () => 1000,
    });
    clock.dispose();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchTime).not.toHaveBeenCalled();
  });

  it('clears the periodic interval on dispose', async () => {
    vi.useFakeTimers();
    const fetchTime = vi.fn(async () => 1000);
    const clock = createServerClock({
      fetchTime,
      samples: 1,
      now: () => 1000,
      resyncIntervalMs: 1000,
    });
    clock.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchTime).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('subscribe returns an unsubscribe that stops notifications', async () => {
    const clock = createServerClock({
      fetchTime: async () => 1000,
      samples: 1,
      now: () => 1000,
    });
    const cb = vi.fn();
    const unsub = clock.subscribe(cb);
    unsub();
    await clock.sync();
    expect(cb).not.toHaveBeenCalled();
    clock.dispose();
  });
});
