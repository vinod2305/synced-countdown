import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTicker } from '../src/core/ticker.js';

describe('createTicker — rAF throttling', () => {
  it('throttles onTick to ~intervalMs using an injected rAF + monotonic', () => {
    // Manual rAF: collect the callback so we can drive frames by hand.
    let pending: ((t: number) => void) | null = null;
    let nextId = 1;
    const raf = {
      request: (cb: (t: number) => void) => {
        pending = cb;
        return nextId++;
      },
      cancel: () => {
        pending = null;
      },
    };

    let t = 0;
    const monotonic = () => t;
    const onTick = vi.fn();

    const ticker = createTicker({ onTick, intervalMs: 1000, raf, monotonic });
    ticker.start();
    // start() fires immediately once.
    expect(onTick).toHaveBeenCalledTimes(1);

    const frame = (time: number) => {
      t = time;
      const cb = pending;
      pending = null;
      cb?.(time);
    };

    // 500ms later: below threshold, no new tick.
    frame(500);
    expect(onTick).toHaveBeenCalledTimes(1);
    // 1000ms: threshold reached, tick.
    frame(1000);
    expect(onTick).toHaveBeenCalledTimes(2);
    // 1500ms: below threshold from last tick, no tick.
    frame(1500);
    expect(onTick).toHaveBeenCalledTimes(2);
    // 2000ms: tick.
    frame(2000);
    expect(onTick).toHaveBeenCalledTimes(3);

    ticker.stop();
    // No more frames scheduled after stop.
    expect(pending).toBeNull();
  });

  it('stop() prevents further ticks', () => {
    const holder: { cb: ((t: number) => void) | null } = { cb: null };
    const raf = {
      request: (cb: (t: number) => void) => {
        holder.cb = cb;
        return 1;
      },
      cancel: () => {
        holder.cb = null;
      },
    };
    let t = 0;
    const onTick = vi.fn();
    const ticker = createTicker({ onTick, intervalMs: 100, raf, monotonic: () => t });
    ticker.start();
    ticker.stop();
    t = 1000;
    // Even if a stale frame fired, running is false so nothing happens.
    holder.cb?.(1000);
    expect(onTick).toHaveBeenCalledTimes(1); // only the immediate start tick
  });
});

describe('createTicker — setInterval fallback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('falls back to setInterval when raf is null', () => {
    const onTick = vi.fn();
    const ticker = createTicker({ onTick, intervalMs: 1000, raf: null });
    ticker.start();
    expect(onTick).toHaveBeenCalledTimes(1); // immediate
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(2000);
    expect(onTick).toHaveBeenCalledTimes(4);
    ticker.stop();
    vi.advanceTimersByTime(5000);
    expect(onTick).toHaveBeenCalledTimes(4);
  });
});
