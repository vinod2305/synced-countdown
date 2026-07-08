import { act, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServerClock } from '../src/core/clock.js';
import type { ServerClock } from '../src/core/types.js';
import { useServerCountdown } from '../src/react/useServerCountdown.js';
import { useServerTime } from '../src/react/useServerTime.js';

/** A minimal controllable clock stand-in for deterministic hook tests. */
function makeControllableClock(): ServerClock & {
  advance: (ms: number) => void;
  setStatus: (s: 'idle' | 'syncing' | 'ready' | 'error') => void;
} {
  let t = 0;
  let offset = 0;
  let status: 'idle' | 'syncing' | 'ready' | 'error' = 'ready';
  const listeners = new Set<(s: typeof status) => void>();
  return {
    now: () => t + offset,
    sync: async () => {},
    getOffset: () => offset,
    getStatus: () => status,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      listeners.clear();
    },
    advance(ms: number) {
      t += ms;
    },
    setStatus(s) {
      status = s;
      for (const cb of listeners) cb(s);
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useServerCountdown', () => {
  it('recomputes remaining from the clock (setInterval fallback via fake timers)', () => {
    vi.useFakeTimers();
    // Force setInterval path by removing rAF for this test.
    const rafBackup = globalThis.requestAnimationFrame;
    // @ts-expect-error force fallback
    globalThis.requestAnimationFrame = undefined;

    const clock = makeControllableClock();
    const target = 10_000;
    const { result } = renderHook(() =>
      useServerCountdown(target, { clock, intervalMs: 1000 }),
    );

    expect(result.current.remaining).toBe(10_000);

    act(() => {
      clock.advance(4000);
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remaining).toBe(6000);
    expect(result.current.seconds).toBe(6);

    globalThis.requestAnimationFrame = rafBackup;
  });

  it('clamps at 0, sets isComplete, and calls onComplete once', () => {
    vi.useFakeTimers();
    const rafBackup = globalThis.requestAnimationFrame;
    // @ts-expect-error force fallback
    globalThis.requestAnimationFrame = undefined;

    const clock = makeControllableClock();
    const onComplete = vi.fn();
    const target = 3000;
    const { result } = renderHook(() =>
      useServerCountdown(target, { clock, intervalMs: 1000, onComplete }),
    );

    act(() => {
      clock.advance(5000);
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remaining).toBe(0);
    expect(result.current.isComplete).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Further ticks should not re-fire onComplete.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    globalThis.requestAnimationFrame = rafBackup;
  });

  it('re-derives when the target changes', () => {
    vi.useFakeTimers();
    const rafBackup = globalThis.requestAnimationFrame;
    // @ts-expect-error force fallback
    globalThis.requestAnimationFrame = undefined;

    const clock = makeControllableClock();
    const { result, rerender } = renderHook(
      ({ target }) => useServerCountdown(target, { clock, intervalMs: 1000 }),
      { initialProps: { target: 5000 } },
    );
    expect(result.current.remaining).toBe(5000);

    act(() => {
      rerender({ target: 20_000 });
    });
    expect(result.current.remaining).toBe(20_000);

    globalThis.requestAnimationFrame = rafBackup;
  });
});

describe('useServerTime', () => {
  it('re-renders on status/offset changes, exposing status', () => {
    const clock = makeControllableClock();
    const { result } = renderHook(() => useServerTime(clock));
    expect(result.current.status).toBe('ready');

    act(() => {
      clock.setStatus('syncing');
    });
    expect(result.current.status).toBe('syncing');
  });

  it('works with a default internal clock when none is passed', () => {
    const { result } = renderHook(() => useServerTime());
    expect(typeof result.current.now).toBe('number');
    expect(result.current.offset).toBe(0);
  });
});

describe('React components render', () => {
  it('renders a countdown component without crashing', () => {
    const clock = createServerClock({ now: () => 0 });
    function Cmp() {
      const { seconds } = useServerCountdown(5000, { clock });
      return <span>{seconds}</span>;
    }
    const { container } = render(<Cmp />);
    expect(container.textContent).toBe('5');
    clock.dispose();
  });
});
