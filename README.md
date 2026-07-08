# synced-countdown

[![npm version](https://img.shields.io/npm/v/synced-countdown.svg)](https://www.npmjs.com/package/synced-countdown)
[![minzipped size](https://img.shields.io/bundlephobia/minzip/synced-countdown.svg)](https://bundlephobia.com/package/synced-countdown)
[![types](https://img.shields.io/npm/types/synced-countdown.svg)](https://www.npmjs.com/package/synced-countdown)
[![license](https://img.shields.io/npm/l/synced-countdown.svg)](./LICENSE)

**[npm](https://www.npmjs.com/package/synced-countdown)** ·
**[Live demo](https://synced-countdown-demo.vercel.app)** ·
**[API](#api)** ·
**[Changelog](./CHANGELOG.md)** ·
**[Issues](https://github.com/vinod2305/synced-countdown/issues)**

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
stored value. It ticks off `requestAnimationFrame` (browsers suspend or heavily
throttle `requestAnimationFrame` in a hidden tab, so it does essentially no work
while hidden) and hard-resyncs on `visibilitychange` and `online`. The
round-trip latency during each sync is measured with a **monotonic** clock
(`performance.now()`) — measured from the browser's own monotonic time origin,
so it's unaffected by clock changes, timezone, DST, or NTP corrections and never
jumps backward or forward — which means a wall-clock jump landing mid-measurement
can't corrupt the offset. (A jump *between* syncs still moves the display; the
resync on `visibilitychange` / `online` is what keeps the display honest.)

It's a tiny, dependency-free, **framework-agnostic** core with an optional thin
**React** adapter.

## Install

```bash
npm install synced-countdown
```

React is an **optional peer dependency** — you only need it for the
`synced-countdown/react` entry point.

## Live demo

A runnable Vite + React demo lives in [`demo/`](./demo). It shows a **device
clock** and a **synced clock** counting down to the same instant side by side —
drag a skew slider to make the device clock wrong and watch the naive countdown
drift while the synced one recovers on **Resync**.

- **Run it locally:** `npm install && npm run build` at the repo root, then
  `cd demo && npm install && npm run dev`.
- **Hosted demo:** **[synced-countdown-demo.vercel.app](https://synced-countdown-demo.vercel.app)** — drag the skew slider and watch the device-clock countdown drift while the synced one stays correct.

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

The `Date` header is only as trustworthy as the infrastructure that sets it — a
CDN, reverse proxy, or cache can rewrite or serve a stale `Date` — so point it at
an origin whose clock you trust, or use a dedicated `/time` endpoint when you need
certainty.

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

- **`requestAnimationFrame` instead of `setInterval`.** Browsers suspend or
  heavily throttle `requestAnimationFrame` in a hidden tab, so it does
  essentially no work while hidden — a backgrounded countdown simply stops
  re-rendering instead of firing a burst of throttled catch-up ticks. Because we recompute from the
  clock (never decrement), the displayed value is instantly correct again on the
  first frame after the tab is shown. The ticker is throttled so `onTick` still
  runs about once per `intervalMs`. In non-DOM environments it falls back to
  `setInterval`.
- **Resync on `visibilitychange` / `online`.** A tab that's been asleep for an
  hour, or a device that just regained connectivity, may have drifted. We
  re-measure the offset at exactly those moments so the timer is trustworthy the
  instant the user looks at it again.
- **Monotonic latency measurement.** The round-trip time of each sync sample is
  measured with `performance.now()`, which is measured from the browser's own
  monotonic time origin — unaffected by clock changes, timezone, DST, or NTP
  corrections, so it never jumps backward or forward. This protects the
  round-trip measurement *during a sync*: a wall-clock jump landing mid-sample
  can't produce a bogus (or negative) RTT, so it can't poison the offset or the
  smallest-RTT selection. It does **not** stabilize the displayed countdown — a
  wall-clock jump *between* syncs still moves the display, and the
  resync-on-visible / online / interval passes are what correct that.

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

**Offset algorithm.** For each sample: `m0 = monotonic()`,
`serverTime = await fetchTime()`, then, back-to-back, `t3 = now()` (device wall
time) and `rtt = monotonic() - m0`. The offset is `serverTime + rtt / 2 - t3`.
The sample with the **smallest RTT** (least jitter) wins. `now()` returns
`deviceNow + offset`.

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
