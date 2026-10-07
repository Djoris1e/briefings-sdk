# Getting started

Use Node 22.12+ (CI runs 22.23.1) and the npm version recorded in `package.json`.
This repository is the Briefings SDK plus a local preview shell. There
is no deployment target; everything below runs on your machine.

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run dev
```

Open [localhost:4300](http://localhost:4300) for the preview page, or
[localhost:4300/embed](http://localhost:4300/embed) for the component on its own.
`/templates` shows the video scene templates with sample data and makes no
provider calls. `?format=text` or `?format=podcast` on `/embed` changes the
default tab.

`npm run dev` (`scripts/dev.mjs`) starts two processes and stops both on
Ctrl-C: Vite with HMR on port 4300, and the Cloudflare reference API
(`wrangler pages dev`) bound to loopback on port 8888. Vite proxies
`/api/*` to it. Before the API starts, the script applies the D1 migrations to a
local database under `.wrangler/local`, writes a persistent local quota salt
there, and enables paid providers for this process only
(`VIDEO_CHAT_LOCAL=enabled`, `VIDEO_CHAT_PAID_PROVIDERS=enabled`). `APP_PORT`
and `APP_API_PORT` override the ports.

## Provider keys

Keys go in ignored `.dev.vars`, never in `briefing.config.ts`, browser code or
`VITE_` variables. Restart `npm run dev` after changing them. Every key below
calls a paid cloud API; a single briefing makes one Anthropic structured-output
call, one streamed Anthropic planning call, several speech calls and up to
five fal clips on localhost. Tests never use these keys.

| Key | Used for |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required. Briefing preparation (text, podcast script, article) and video shot planning |
| `XAI_API_KEY` | Narrator voice and the two podcast voices, with word timings for captions |
| `FAL_KEY` | Generated footage (MiniMax H3 Max Turbo) and, when enabled, screenshot animation |
| `PEXELS_API_KEY` | Stock footage for scenes that are not generated |

Models and voices are chosen in root `briefing.config.ts`
(`defineBriefingConfig`). Trusted server overrides exist as environment
variables (`BRIEFING_PLANNER_MODEL`, `BRIEFING_HOST_VOICE`, …; see
`.dev.vars.example`). Request bodies cannot select models, voices or keys.

## What happens with missing keys

The behaviour comes from `configurationStatus` in `functions/api/video-chat.mjs`.

- Without `ANTHROPIC_API_KEY`, nothing works. Every `/api/video-chat` operation
  returns `503 setup_required` naming the missing binding, and the component
  shows a generic "could not prepare" error. There is no offline or mocked mode
  in the running app.
- Without `XAI_API_KEY`, the status reports `speech: "silent"` and the speech
  action answers `204`. Video plays without narration over its music bed, and
  the podcast has no audio: Play steps through the transcript with estimated
  durations and no sound. (A speech provider that fails, rather than one that
  is absent, shows "Podcast speech is unavailable" instead.) The text tab is
  unaffected.
- Without `FAL_KEY` but with `PEXELS_API_KEY`, the route switches the video to
  Pexels mode before planning; scenes use templates plus stock footage.
- Without `FAL_KEY` and without `PEXELS_API_KEY`, video uses the authored
  templates only (chapter, key figure, comparison, quote, timeline,
  screenshot). No footage callback is registered, so nothing is searched or
  generated.
- With `FAL_KEY`, localhost takes the owner path (`local` in the route): up to
  five generated clips per answer, each submitted once. Failed or late clips
  fall back to the authored template; they do not trigger a stock search.

The quota database and salt are local only. The IP-keyed admission in
`functions/_video-chat/quota.mjs` still applies on localhost (20 requests per
actor per minute, 4 concurrent per actor, 12 concurrent in total), so parallel
test runs or a busy HMR session can hit `429 request_throttled`.

## What to try first

Pick an example on the start screen. The opening chapter appears at once, the
video starts planning from the supplied text, and the text/podcast briefing
prepares in parallel. Switch tabs: text and podcast reuse the prepared
briefing, and the video keeps playing where it was. Press Play on the podcast
(it never autoplays). Ask a follow-up; it carries the original brief and recent
turns. Then try `cancel` mid-generation and the retry controls after a failure.

## Where to go next

- [Architecture](architecture.md) traces one generation through the code.
- [Development](development.md) is the everyday check loop.
- [SDK guide](SDK.md) covers packaging the component for a host.
- [Security](security.md) lists the controls a host must keep around the handler.
