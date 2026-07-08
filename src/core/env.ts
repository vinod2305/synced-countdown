/** SSR-safe environment probes. All DOM access must go through these. */

export function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

export function hasDocument(): boolean {
  return typeof document !== 'undefined';
}

/**
 * Returns a monotonic-clock reader. Prefers `performance.now` (immune to
 * wall-clock jumps); falls back to `Date.now` in environments without it.
 */
export function defaultMonotonic(): () => number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return () => performance.now();
  }
  return () => Date.now();
}

/** Returns a requestAnimationFrame pair if available, else `null`. */
export function getRaf(): {
  request: (cb: (t: number) => void) => number;
  cancel: (id: number) => void;
} | null {
  if (
    typeof requestAnimationFrame === 'function' &&
    typeof cancelAnimationFrame === 'function'
  ) {
    return {
      request: (cb) => requestAnimationFrame(cb),
      cancel: (id) => cancelAnimationFrame(id),
    };
  }
  return null;
}
