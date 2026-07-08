/** A function that returns the current server time as epoch milliseconds. */
export type FetchTime = () => Promise<number>;

/** Lifecycle status of a {@link ServerClock}. */
export type ClockStatus = 'idle' | 'syncing' | 'ready' | 'error';

export interface ServerClockOptions {
  /**
   * Fetches the authoritative server time (epoch ms). If omitted, the clock
   * degrades gracefully to the local device time (offset stays 0).
   */
  fetchTime?: FetchTime;
  /** Number of samples to take per sync. Default `5`. */
  samples?: number;
  /** If `> 0`, resync automatically on this interval (ms). Default `0` (off). */
  resyncIntervalMs?: number;
  /** Resync when the document becomes visible again. Default `true`. */
  resyncOnVisible?: boolean;
  /** Resync when the browser comes back online. Default `true`. */
  resyncOnOnline?: boolean;
  /** Injectable wall clock. Default `Date.now`. Useful for tests. */
  now?: () => number;
  /**
   * Injectable monotonic clock. Defaults to `performance.now` when available,
   * falling back to `Date.now`. Useful for tests.
   */
  monotonic?: () => number;
}

export interface ServerClock {
  /** Server-corrected current time in epoch ms (`deviceNow + offset`). */
  now(): number;
  /** Take `samples` measurements of {@link ServerClockOptions.fetchTime} and recompute the offset. */
  sync(): Promise<void>;
  /** The current offset in ms (server time minus device time). */
  getOffset(): number;
  /** The current lifecycle status. */
  getStatus(): ClockStatus;
  /**
   * Subscribe to status/offset changes. The callback fires whenever the status
   * changes or a new offset is computed. Returns an unsubscribe function.
   */
  subscribe(cb: (status: ClockStatus) => void): () => void;
  /** Remove all listeners and timers. The clock should not be used afterwards. */
  dispose(): void;
}

export interface CountdownBreakdown {
  /** Remaining time in ms, clamped to `>= 0`. */
  remaining: number;
  /** The full duration originally requested, in ms (`target - startNow`). */
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** `true` once `remaining` reaches 0. */
  isComplete: boolean;
}
