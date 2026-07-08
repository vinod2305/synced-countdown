# synced-countdown

**Your countdown is lying.** Two things quietly corrupt every naive timer:

1. **Device clocks are wrong.** A user whose system clock is off by ten minutes
   sees your "sale ends in 5:00" as "ends in 15:00" — or as already over. You
   can't trust `Date.now()`.
2. **Background tabs throttle timers.** Browsers clamp `setInterval` /
   `setTimeout` to once per minute (or freeze them entirely) in backgrounded
   tabs. Come back after lunch and a decrement-based timer is wildly behind.

`synced-countdown` fixes both. It syncs to your **server's** clock with an
NTP-style offset (correcting for network latency), then **recomputes** the
remaining time from that synced clock on every tick — it never decrements a
stored value. It ticks off `requestAnimationFrame` (so it naturally pauses when
the tab is hidden) and hard-resyncs on `visibilitychange` and `online`. Elapsed
time is measured with a **monotonic** clock (`performance.now`), so a mid-session
wall-clock jump doesn't make the timer lurch.

It's a tiny, dependency-free, **framework-agnostic** core with an optional thin
**React** adapter.

## Install

```bash
npm install synced-countdown
```

React is an **optional peer dependency** — you only need it for the
`synced-countdown/react` entry point.

## Quick start — core (no framework)

```ts
import {
  createServerClock,
  createTicker,
  computeCountdown,
  fetchTimeFromJson,
} from 'synced-countdown';

// Your server exposes { "serverTime": <epoch ms> } at /api/time.
const clock = createServerClock({
  fetchTime: fetchTimeFromJson('/api/time'),
  samples: 5,
  resyncIntervalMs: 60_000,
});

await clock.sync(); // measure the offset

const target = Date.now() + 5 * 60_000; // 5 minutes from *now*
const ticker = createTicker({
  intervalMs: 1000,
  onTick() {
    const { minutes, seconds, isComplete } = computeCountdown(target, clock.now());
    console.log(`${minutes}:${String(seconds).padStart(2, '0')}`);
    if (isComplete) ticker.stop();
  },
});
ticker.start();
```

### Using the HTTP `Date` header (no endpoint required)

Every HTTP response already carries the server's time in its `Date` header. If
you'd rather not build a `/api/time` route:

```ts
import { createServerClock, fetchTimeFromDateHeader } from 'synced-countdown';

const clock = createServerClock({
  // HEAD request; reads the `Date` response header.
  fetchTime: fetchTimeFromDateHeader('/'),
});
await clock.sync();
```

## Quick start — React

```tsx
import { createServerClock, fetchTimeFromJson } from 'synced-countdown';
import { useServerCountdown } from 'synced-countdown/react';

// Create the clock once, outside render (or in a context/provider).
const clock = createServerClock({
  fetchTime: fetchTimeFromJson('/api/time'),
  resyncIntervalMs: 60_000,
});
clock.sync();

function SaleTimer({ endsAt }: { endsAt: number }) {
  const { days, hours, minutes, seconds, isComplete, status } =
    useServerCountdown(endsAt, {
      clock,
      onComplete: () => console.log('done!'),
    });

  if (isComplete) return <span>Sale over</span>;
  return (
    <span data-status={status}>
      {days}d {hours}h {minutes}m {seconds}s
    </span>
  );
}
```

Just need the corrected time, not a countdown? `useServerTime` re-renders only
when the clock's **status or offset** changes (not every tick):

```tsx
import { useServerTime } from 'synced-countdown/react';

function Status({ clock }) {
  const { offset, status } = useServerTime(clock);
  return <span>clock {status}, offset {offset} ms</span>;
}
```

## Works without a server

If you don't pass `fetchTime`, the clock **degrades gracefully to device time**
(offset stays `0`) and `sync()` becomes a no-op. Everything else — the ticker,
the countdown math, the React hooks — works exactly the same. You lose the
wrong-clock correction but keep the background-tab correctness. Both React hooks
create a default device clock internally if you don't pass one.

## Why rAF + resync-on-visible?

- **`requestAnimationFrame` instead of `setInterval`.** rAF doesn't fire in a
  hidden tab, so a backgrounded countdown simply stops re-rendering instead of
  firing a burst of throttled catch-up ticks. Because we recompute from the
  clock (never decrement), the displayed value is instantly correct again on the
  first frame after the tab is shown. The ticker is throttled so `onTick` still
  runs about once per `intervalMs`. In non-DOM environments it falls back to
  `setInterval`.
- **Resync on `visibilitychange` / `online`.** A tab that's been asleep for an
  hour, or a device that just regained connectivity, may have drifted. We
  re-measure the offset at exactly those moments so the timer is trustworthy the
  instant the user looks at it again.
- **Monotonic elapsed time.** Elapsed measurement uses `performance.now`, which
  can't be moved by the user or NTP daemons mid-session, so a wall-clock jump
  never makes the timer leap.

## API

### Core (`synced-countdown`)

| Export | Description |
| --- | --- |
| `createServerClock(opts?)` | Creates a `ServerClock` that syncs to server time via `fetchTime`. |
| `createTicker({ onTick, intervalMs?, raf?, monotonic? })` | rAF-throttled ticker with `start()` / `stop()`; falls back to `setInterval`. |
| `computeCountdown(targetMs, currentMs, totalMs?)` | Pure remaining-time breakdown (`remaining`, `days`, `hours`, `minutes`, `seconds`, `isComplete`, `total`). |
| `toEpochMs(target)` | Normalizes `number | Date` to epoch ms. |
| `fetchTimeFromDateHeader(url, requestInit?)` | `FetchTime` that reads the HTTP `Date` response header. |
| `fetchTimeFromJson(url, pick?)` | `FetchTime` that reads `json[pick]` (default `serverTime`). |

**`ServerClockOptions`**: `fetchTime?`, `samples?` (default `5`),
`resyncIntervalMs?` (default `0` = off), `resyncOnVisible?` (default `true`),
`resyncOnOnline?` (default `true`), `now?` (default `Date.now`), `monotonic?`
(default `performance.now`).

**`ServerClock`**: `now()`, `sync()`, `getOffset()`, `getStatus()`,
`subscribe(cb)` → unsubscribe, `dispose()`. Status is one of
`'idle' | 'syncing' | 'ready' | 'error'`.

**Offset algorithm.** For each sample: `t0 = now()`,
`serverTime = await fetchTime()`, `t3 = now()`, `rtt = t3 - t0`,
`offset = serverTime + rtt / 2 - t3`. The sample with the **smallest RTT** (least
jitter) wins. `now()` returns `deviceNow + offset`.

### React (`synced-countdown/react`)

| Hook | Description |
| --- | --- |
| `useServerTime(clock?)` | `{ now, offset, status }`; re-renders on status/offset changes only. |
| `useServerCountdown(target, opts?)` | `{ remaining, total, days, hours, minutes, seconds, isComplete, status }`. |

`useServerCountdown` options: `clock?`, `intervalMs?` (default `1000`),
`onComplete?` (fires once when it crosses to 0). If no `clock` is supplied, a
default device clock (offset 0) is created and disposed with the component.

## SSR-safe

All DOM/`window` access is guarded, so the core imports and runs in Node and
during server rendering. The React hooks never touch `window`/rAF during render
— the ticker starts in an effect, which doesn't run on the server.

## Testing note

Every time source is injectable — `now`, `monotonic`, `fetchTime`, and the
ticker's `raf` — so you can drive the whole library deterministically with
Vitest fake timers, without touching the real wall clock or `performance.now`.
This package's own test suite does exactly that.

## License

MIT © Vinod S.
