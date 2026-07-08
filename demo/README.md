# synced-countdown — live demo

A tiny Vite + React + TypeScript app that showcases
[`synced-countdown`](../). It runs two countdowns to the **same** target time,
side by side:

- **Device clock** — trusts `Date.now()`, no server sync.
- **Synced clock** — corrects for the device skew using an NTP-style offset from
  a (mocked) server.

Drag the **skew slider** to simulate a wrong device clock and watch the device
countdown drift and lie, while the synced one stays correct after a **Resync**.
It also shows the live `status` and measured `offset` from `useServerTime`.

## Run locally

This demo depends on the parent package via a relative `file:..` link, so build
the library first, then install and run the demo:

```bash
# from the repo root
npm install
npm run build          # produces the library's dist/ that the demo imports

# then the demo
cd demo
npm install
npm run dev            # http://localhost:5173
```

Production build:

```bash
cd demo
npm run build          # type-checks, then emits demo/dist/
npm run preview        # serve the built app
```

## Deploying

Because the demo consumes the library through a workspace-relative `file:` link,
the simplest hosted options are:

- **StackBlitz / CodeSandbox** — import the repo; both understand the local
  `file:..` dependency.
- **Vercel / Netlify** — set the project root to `demo/`, or run the library
  build (`npm run build` at the repo root) as a pre-build step so `../dist`
  exists, then build the demo. For a fully standalone deploy you can instead
  point the demo's `synced-countdown` dependency at the published npm version.

The app is entirely static once built (`demo/dist/`), so any static host works.
