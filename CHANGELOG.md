# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

- Docs: spec-safe rAF wording (browsers suspend/throttle rAF in hidden tabs),
  precise performance.now framing (monotonic time origin), and a Date-header
  trust caveat (CDN/proxy/cache can rewrite it).
- Docs: add npm/downloads/bundle-size/types/license badges and a quick-links row
  (npm, live demo, API, changelog, issues) to the top of the README.

## 0.1.1

- Fix: `createServerClock` now actually uses the injectable `monotonic` clock to
  measure round-trip latency during a sync (previously the documented option was
  ignored and RTT was measured off the wall clock). A wall-clock jump landing
  mid-sample can no longer produce a bogus/negative RTT and poison the offset.
- Docs: correct the README's "monotonic" claims to describe what the monotonic
  clock actually protects (latency measurement during sync), rather than
  implying the displayed countdown never moves on a wall-clock jump.
- Fix repository / homepage URLs (correct GitHub username).
- Add `bugs` URL.
- Add hosted demo link (https://synced-countdown-demo.vercel.app) to the README.

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
