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
    // Each now() call advances by 10ms: t0=1000, t3=1010, rtt=10.
    const clockNow = makeNow(1000, 10);
    // server is 5000 ahead of the device midpoint.
    const serverTime = 6000;
    const fetchTime: FetchTime = async () => serverTime;

    const clock = createServerClock({
      fetchTime,
      samples: 1,
      now: clockNow.now,
    });

    await clock.sync();
    // t0=1000, t3=1010, rtt=10 => offset = 6000 + 5 - 1010 = 4995
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
    });
    await clock.sync();
    // rtt = 0 (device static) => offset = 2000 + 0 - 1000 = 1000
    expect(clock.getOffset()).toBe(1000);
    device = 5000;
    expect(clock.now()).toBe(6000);
    clock.dispose();
  });

  it('keeps the sample with the smallest rtt (least jitter)', async () => {
    // Drive rtt per sample by controlling the now() step between t0 and t3.
    // We use a queue of "now" readings: [t0, t3] pairs.
    const readings = [
      1000, 1100, // sample 0: rtt = 100
      2000, 2010, // sample 1: rtt = 10  <-- lowest
      3000, 3050, // sample 2: rtt = 50
    ];
    let i = 0;
    const now = () => readings[i++]!;

    // server returns a value tied to which sample; we want to confirm the
    // low-rtt sample's offset wins. server = 10000 constant.
    const fetchTime: FetchTime = async () => 10000;

    const clock = createServerClock({ fetchTime, samples: 3, now });
    await clock.sync();

    // Best sample is sample 1: t0=2000,t3=2010,rtt=10 => 10000 + 5 - 2010 = 7995
    expect(clock.getOffset()).toBe(7995);
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
