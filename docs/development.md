# Development

[Getting started](getting-started.md) covers Node, `npm ci`, `.dev.vars` and the
first run. This page is the everyday loop.

```bash
npm run dev
```

`npm run dev` starts the preview at [localhost:4300](http://localhost:4300) with
source HMR and the loopback Cloudflare reference API on port 8888. It creates
an isolated local D1 quota database and salt under `.wrangler/local` and stops
both processes on exit. Missing provider keys return a setup error; there is no
fake answer path in the running app.

On localhost with your own `FAL_KEY`, a video answer may use up to five
generated clips through the owner ledger path (`local` in
`functions/api/video-chat.mjs`): the first clip is five seconds, later clips
eight. Request admission and per-answer bounds stay active.

## Checks

| Command | What it does |
| --- | --- |
| `npm run check:quick` | ESLint and TypeScript. Run after every edit. |
| `npm run test:formats` | Briefing preparation, handler, component and API tests for text/podcast. |
| `npm run test:engine` | Hybrid planner, duration budget and editorial template tests. |
| `npm run test:embed` | The real component in Chromium with recorded media (`tests/app-browser/`). |
| `npm run check` | Lint, types, Knip unused-code scan, all unit tests and API tests. No browsers or builds. |
| `node scripts/check-docs.mjs` | Offline Markdown structure, local links and anchors for tracked files. |
| `npm run build:sdk` | Bundles `sdk-dist`; run for changes to exported modules, CSS or packaging. |
| `npm run verify` | Milestone check: `check`, docs, app and functions builds, preview check and the app browser journey. |

Before a first browser run, install browsers with `npm run browser:install`
(on Linux `npx playwright install --with-deps` adds OS libraries). Playback and
UI changes also need the relevant `npm run browser:test` scenarios in
`tests/browser/`; keep the checkout unchanged while browser suites run, because
the test server freezes the checkout identity at start.

`npm run check:unused` runs Knip without a baseline. Keep its entrypoints
(`knip.ts`) limited to real runtime boundaries that static imports cannot see,
such as Cloudflare routes and modules loaded by HTML fixtures.

## CI

`.github/workflows/ci.yml` runs two jobs on every pull request and on `main`:

- `verify`: `npm run check` (lint, types, example type-check, unused code,
  unit and API tests), the docs link check, the demo and SDK builds, and an
  audit of production dependencies.
- `embed`: the SDK component specs under `tests/app-browser` in Chromium with
  recorded media and a virtual audio output.

The inherited cross-browser media matrix (`npm run verify`, `npm run
browser:test`) is not part of CI; run it locally before a release that changes
the player. Firefox fullscreen bounds in headless mode and some WebKit timing
probes are known to be unstable there.

## Rules of thumb

Keep test media and recorded provider doubles: they exercise real decoder,
readiness and speech-clock boundaries. Doubles belong in tests only. Manual
provider checks use the same app with your keys and an explicitly authorized
spending bound. Do not label sample input as fetched content.
