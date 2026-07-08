import { useEffect, useRef, useState } from 'react';
import { createServerClock } from '../core/clock.js';
import { computeCountdown, toEpochMs } from '../core/countdown.js';
import { createTicker } from '../core/ticker.js';
import type { ClockStatus, ServerClock } from '../core/types.js';

export interface CountdownResult {
  /** Remaining time in ms, clamped `>= 0`. */
  remaining: number;
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isComplete: boolean;
  status: ClockStatus;
}

export interface UseServerCountdownOptions {
  /** A server clock to read time from. If omitted, a default device clock is used. */
  clock?: ServerClock;
  /** Tick cadence in ms. Default `1000`. */
  intervalMs?: number;
  /** Called once when the countdown crosses to 0. */
  onComplete?: () => void;
}

/**
 * Counts down to `target`, recomputing the remaining time from the (server
 * corrected) clock on every throttled tick — never decrementing a stored
 * value. SSR-safe: no window/rAF access during render; the ticker starts in an
 * effect.
 */
export function useServerCountdown(
  target: number | Date,
  opts: UseServerCountdownOptions = {},
): CountdownResult {
  const { clock, intervalMs = 1000, onComplete } = opts;

  const targetMs = toEpochMs(target);

  // Owned default clock (only created when the caller doesn't supply one).
  const ownedRef = useRef<ServerClock | null>(null);
  if (!clock && ownedRef.current === null) {
    ownedRef.current = createServerClock();
  }
  const activeClock = clock ?? ownedRef.current;

  const readNow = (): number => (activeClock ? activeClock.now() : Date.now());

  const [state, setState] = useState<CountdownResult>(() => ({
    ...computeCountdown(targetMs, readNow()),
    status: activeClock ? activeClock.getStatus() : 'idle',
  }));

  // Keep the latest onComplete without re-subscribing the ticker.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const completedRef = useRef(false);

  // Reset the "completed" latch whenever the target changes.
  useEffect(() => {
    completedRef.current = false;
  }, [targetMs]);

  useEffect(() => {
    if (!activeClock) return;

    const tick = (): void => {
      const breakdown = computeCountdown(targetMs, activeClock.now());
      setState({ ...breakdown, status: activeClock.getStatus() });
      if (breakdown.isComplete && !completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
    };

    const ticker = createTicker({ onTick: tick, intervalMs });
    ticker.start();

    // Re-render on status/offset changes too (e.g. after a resync).
    const unsubscribe = activeClock.subscribe(tick);

    return () => {
      ticker.stop();
      unsubscribe();
    };
  }, [activeClock, targetMs, intervalMs]);

  // Dispose only the clock we created ourselves.
  useEffect(() => {
    return () => {
      if (ownedRef.current) {
        ownedRef.current.dispose();
        ownedRef.current = null;
      }
    };
  }, []);

  return state;
}
