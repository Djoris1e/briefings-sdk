# Briefings SDK

An embeddable React component and a provider-neutral server handler. The host
supplies one prompt (customer goals, product adoption, interests and release
material); the SDK turns it into three outputs that share the same facts:

- a streaming video built from editorial templates, supplied screenshots,
  optional stock or generated footage, narration and music (subtitles off by default),
- a two-speaker podcast with transport controls and an audio-reactive waveform,
- a longer, scrollable article.

The SDK is provider-neutral. The customer-facing publisher is configured by the host;
the local demo shows Microsoft communicating its product updates to Microsoft
customers. Source collection, tenant access, personalization engines, saving and
export are outside this component.

**Status: review candidate.** See [the readiness assessment](docs/HANDOVER.md)
for what was verified, with what, and what remains before production use.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/briefing/` | The SDK: `PromptOutput` component, podcast/text client, `prepareBriefing`, `createBriefingHandler`, configuration |
| `src/video-chat/`, `src/player/`, `src/server/`, `src/visual-system/` | The streaming video engine the SDK builds on |
| `functions/` | Reference Cloudflare adapter: provider calls, IP-keyed admission, spend limits (demo policy, not a tenant policy) |
| `app/` | Local preview shell with example prompts; not part of the package |
| `examples/minimal-host/` | Type-checked minimal host integration (React + server) |
| `docs/` | [SDK integration guide](docs/SDK.md), [architecture](docs/architecture.md), [security](docs/security.md), [testing](docs/testing.md) |
| `tests/` | Vitest unit tests, Node API tests (`tests/app-api`), Playwright browser specs |

## Run the local preview

Requires Node 22.12+ and the npm version pinned in `package.json`.

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run dev
```

Open [localhost:4300](http://localhost:4300). Put server-side credentials in the
ignored `.dev.vars`: `ANTHROPIC_API_KEY` (briefing and video planning),
`XAI_API_KEY` (narrator and two podcast voices), `PEXELS_API_KEY` (optional stock
footage), `FAL_KEY` (optional generated video). Provider calls cost money; the
local runner enables them, hosted configuration keeps them disabled until a host
opts in. No key belongs in browser code or `VITE_` variables. Models and voices
are chosen in `briefing.config.ts`. See [getting started](docs/getting-started.md).

## Use the SDK

```bash
npm run build:sdk
npm pack
```

Install the resulting `djoris-briefings-0.1.0.tgz` in a React 19 host. Import
`PromptOutput` from `@djoris/briefings/react` and the CSS from
`@djoris/briefings/styles.css`; mount `createBriefingHandler` from
`@djoris/briefings/server` at the component's `endpoint`; serve the packaged
`sdk-dist/audio-library` at `/audio-library`. The complete wiring, provider
callback contracts, limits and security responsibilities are in
[docs/SDK.md](docs/SDK.md); `examples/minimal-host` shows the smallest working
pair of files. The package is private; nothing is published by building it.

## Checks

| Command | What it covers |
| --- | --- |
| `npm run check:quick` | ESLint and TypeScript |
| `npm run test:formats` | Briefing preparation, podcast/text client, component, API |
| `npm run test:engine` | Video planning and templates |
| `npm run test:embed` | Component in Chromium with recorded media (needs `npx playwright install chromium`) |
| `npm run check` | Lint, types, example type-check, unused code, all unit and API tests (CI) |
| `npm run verify` | Full release gate including builds and browser matrix |

Tests use recorded provider doubles and never call paid APIs. Live provider
behaviour (latency, factual fidelity, voice continuity) needs an explicitly
budgeted run; see the readiness assessment.

Working conventions for people and agents are in [AGENTS.md](AGENTS.md);
security reporting in [SECURITY.md](SECURITY.md). Licensed under Apache-2.0;
see [LICENSE](LICENSE) and the licensing notes in the readiness assessment.
