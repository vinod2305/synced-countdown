import { hasDocument, hasWindow } from './env.js';
import type {
  ClockStatus,
  FetchTime,
  ServerClock,
  ServerClockOptions,
} from './types.js';

interface Sample {
  offset: number;
  rtt: number;
}

/**
 * Creates a server-synced clock.
 *
 * The offset is derived NTP-style: for each sample we record `t0` (device time
 * before the request), the returned `serverTime`, and `t3` (device time after).
 * With `rtt = t3 - t0`, the estimated offset is
 * `serverTime + rtt / 2 - t3`. The sample with the smallest round-trip time
 * (least jitter) wins.
 *
 * If no `fetchTime` is supplied the clock degrades to device time (offset 0)
 * and `sync()` becomes a no-op. All DOM access is guarded so the clock is
 * safe to construct and use in Node / during SSR.
 */
export function createServerClock(opts: ServerClockOptions = {}): ServerClock {
  const {
    fetchTime,
    samples = 5,
    resyncIntervalMs = 0,
    resyncOnVisible = true,
    resyncOnOnline = true,
    now = () => Date.now(),
  } = opts;

  let offset = 0;
  let status: ClockStatus = 'idle';
  let disposed = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const listeners = new Set<(s: ClockStatus) => void>();

  function emit(): void {
    for (const cb of listeners) cb(status);
  }

  function setStatus(next: ClockStatus): void {
    status = next;
    emit();
  }

  async function takeSample(fn: FetchTime): Promise<Sample> {
    const t0 = now();
    const serverTime = await fn();
    const t3 = now();
    const rtt = t3 - t0;
    return { offset: serverTime + rtt / 2 - t3, rtt };
  }

  async function sync(): Promise<void> {
    if (disposed) return;
    if (!fetchTime) {
      // Degrade to device time: offset stays 0, but signal readiness.
      setStatus('ready');
      return;
    }

    setStatus('syncing');
    try {
      let best: Sample | null = null;
      const count = Math.max(1, samples);
      for (let i = 0; i < count; i++) {
        const sample = await takeSample(fetchTime);
        if (disposed) return;
        if (best === null || sample.rtt < best.rtt) best = sample;
      }
      if (best) offset = best.offset;
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  // --- Auto-resync wiring (DOM-guarded) ---

  const onVisibility = (): void => {
    if (hasDocument() && document.visibilityState === 'visible') void sync();
  };
  const onOnline = (): void => {
    void sync();
  };

  if (hasDocument() && resyncOnVisible) {
    document.addEventListener('visibilitychange', onVisibility);
  }
  if (hasWindow() && resyncOnOnline) {
    window.addEventListener('online', onOnline);
  }
  if (resyncIntervalMs > 0) {
    intervalId = setInterval(() => void sync(), resyncIntervalMs);
  }

  return {
    now: () => now() + offset,
    sync,
    getOffset: () => offset,
    getStatus: () => status,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      disposed = true;
      listeners.clear();
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (hasDocument() && resyncOnVisible) {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (hasWindow() && resyncOnOnline) {
        window.removeEventListener('online', onOnline);
      }
    },
  };
}
