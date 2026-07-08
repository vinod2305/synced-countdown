import { useEffect, useRef, useState } from 'react';
import { createServerClock } from '../core/clock.js';
import type { ClockStatus, ServerClock } from '../core/types.js';

export interface ServerTimeResult {
  /** Server-corrected epoch ms, sampled at the last status/offset change. */
  now: number;
  /** Current offset in ms. */
  offset: number;
  /** Clock lifecycle status. */
  status: ClockStatus;
}

/**
 * Subscribes to a {@link ServerClock}'s status/offset changes. This hook does
 * NOT re-render every tick — only when the clock's status or offset changes.
 *
 * If no clock is passed, a default device clock (offset 0) is created and
 * disposed with the component.
 */
export function useServerTime(clock?: ServerClock): ServerTimeResult {
  // Hold a stable clock instance. If the caller supplies one, use it as-is and
  // never dispose it (they own it). Otherwise create a default device clock.
  const ownedRef = useRef<ServerClock | null>(null);
  if (!clock && ownedRef.current === null) {
    ownedRef.current = createServerClock();
  }
  const activeClock = clock ?? ownedRef.current;

  const [state, setState] = useState<ServerTimeResult>(() => ({
    now: activeClock ? activeClock.now() : Date.now(),
    offset: activeClock ? activeClock.getOffset() : 0,
    status: activeClock ? activeClock.getStatus() : 'idle',
  }));

  useEffect(() => {
    if (!activeClock) return;
    const update = (): void =>
      setState({
        now: activeClock.now(),
        offset: activeClock.getOffset(),
        status: activeClock.getStatus(),
      });
    // Sync current value on mount, then subscribe.
    update();
    const unsubscribe = activeClock.subscribe(update);
    return unsubscribe;
  }, [activeClock]);

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
