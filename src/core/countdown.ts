import type { CountdownBreakdown } from './types.js';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Normalizes a target that may be a number (epoch ms) or a `Date`. */
export function toEpochMs(target: number | Date): number {
  return target instanceof Date ? target.getTime() : target;
}

/**
 * Computes a countdown breakdown purely from the current time. This is a pure
 * function: given `targetMs` and `currentMs` it never depends on stored,
 * decremented state, so it stays correct across clock corrections.
 *
 * @param targetMs  The target time in epoch ms.
 * @param currentMs The current (ideally server-corrected) time in epoch ms.
 * @param totalMs   Optional full duration for reporting `total`; defaults to `remaining`.
 */
export function computeCountdown(
  targetMs: number,
  currentMs: number,
  totalMs?: number,
): CountdownBreakdown {
  const remaining = Math.max(0, targetMs - currentMs);
  const days = Math.floor(remaining / MS_PER_DAY);
  const hours = Math.floor((remaining % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((remaining % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((remaining % MS_PER_MINUTE) / MS_PER_SECOND);

  return {
    remaining,
    total: totalMs ?? remaining,
    days,
    hours,
    minutes,
    seconds,
    isComplete: remaining <= 0,
  };
}
