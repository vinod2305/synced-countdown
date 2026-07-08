import { defaultMonotonic, getRaf } from './env.js';

export interface TickerOptions {
  /** Called at most once per `intervalMs`. */
  onTick: () => void;
  /** Minimum time between ticks, in ms. Default `1000`. */
  intervalMs?: number;
  /**
   * Injectable rAF pair (for tests). If omitted, the real
   * `requestAnimationFrame` is used when available, otherwise `setInterval`.
   * Pass `null` to force the `setInterval` fallback.
   */
  raf?: {
    request: (cb: (t: number) => void) => number;
    cancel: (id: number) => void;
  } | null;
  /** Injectable monotonic clock (for tests). */
  monotonic?: () => number;
}

export interface Ticker {
  start(): void;
  stop(): void;
}

/**
 * A throttled ticker. When rAF is available it drives ticks off animation
 * frames — so it naturally pauses in backgrounded tabs — but only invokes
 * `onTick` once roughly every `intervalMs`. In non-DOM environments it falls
 * back to `setInterval`.
 */
export function createTicker(options: TickerOptions): Ticker {
  const {
    onTick,
    intervalMs = 1000,
    raf = getRaf(),
    monotonic = defaultMonotonic(),
  } = options;

  let running = false;
  let rafId: number | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let lastTick = 0;

  function frame(): void {
    if (!running || !raf) return;
    const t = monotonic();
    if (t - lastTick >= intervalMs) {
      lastTick = t;
      onTick();
    }
    rafId = raf.request(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTick = monotonic();
      // Fire immediately so consumers get a fresh value on start.
      onTick();
      if (raf) {
        rafId = raf.request(frame);
      } else {
        intervalId = setInterval(onTick, intervalMs);
      }
    },
    stop() {
      running = false;
      if (rafId !== null && raf) {
        raf.cancel(rafId);
        rafId = null;
      }
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
