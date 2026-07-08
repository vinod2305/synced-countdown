# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — Initial release

- Framework-agnostic core (`synced-countdown`):
  - `createServerClock` — NTP-style server clock sync (lowest-RTT sample wins),
    degrades to device time when no `fetchTime` is provided, auto-resync on
    `visibilitychange` / `online` / optional interval, SSR-safe.
  - `createTicker` — rAF-throttled ticker that pauses in backgrounded tabs and
    falls back to `setInterval` in non-DOM environments.
  - `computeCountdown` — pure remaining-time recomputation (no decrementing).
  - `fetchTimeFromDateHeader` / `fetchTimeFromJson` helpers.
- React adapter (`synced-countdown/react`):
  - `useServerTime` — re-renders only on status/offset changes.
  - `useServerCountdown` — recomputes from the synced clock every throttled tick.
- Dual ESM + CJS output with `.d.ts` types, built with tsup.
