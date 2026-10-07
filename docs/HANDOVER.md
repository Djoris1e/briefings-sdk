# Readiness assessment

Prepared 7 October 2026 after an independent audit of the briefings SDK.
Verdict: **review candidate, not production-ready.** Everything below was verified with recorded provider
doubles and fixtures unless a line says "live".

## What the SDK does

One prompt (customer goals, adoption, interests and release material) produces
a streaming video, a two-speaker podcast and an article that share one validated
factual briefing. The SDK is provider-neutral; the host names the customer-facing
publisher (Microsoft in the demo) and supplies all content. See
[the SDK guide](SDK.md) and [architecture](architecture.md).

## Audit summary

Three independent read-only audits (server/security, client/playback, repository
hygiene) ran against the code before any change. Findings were split into
production blockers, which were implemented, and optional improvements, which
are listed under "Known limitations".

### Blockers fixed in this review

| Area | Problem found | Fix |
| --- | --- | --- |
| Podcast/text preparation | A model response failing the content contract (for example an analyst turn without a cited fact) failed the whole request on the first attempt; only a manual retry remained. | `prepareBriefing` re-authors once by default inside the same deadline with only the validator's classification fed back. Timeouts, cancellation and provider failures are never retried. Reported via `onDiagnostic` as `unusable_output`. |
| Client reliability | No client-side deadline on the briefing request: a stalled connection left "Preparing…" forever. Raw internal error text (for example JSON parse errors) could reach users. | 130-second client deadline that ends in a visible error with retry; fixed user-facing messages; 429 distinguished. |
| Cross-site spend | Portable handlers accepted any `Origin` when `allowedOrigins` was omitted and parsed bodies without a content-type check, so a cookie-authenticated host could be billed for forged text/plain POSTs. | Foreign `Origin` is rejected unless allowed; JSON write actions require `application/json`. Documented for hosts behind URL-rewriting proxies. |
| Hidden paid work | The embed fetched Briefings welcome cards on mount and requested paid follow-up suggestions (a planner call plus media lookups) after every video, rendering neither. | `useVideoChatSession` takes `prompts: { welcome, suggestions }`; the embed disables both. |
| Browser audio | A browser autoplay refusal (`NotAllowedError`) was recorded as "speech unavailable" for the rest of the run. | The line stays cached; the user can retry after a gesture. Hosts must call `generate()` from a user gesture for audible playback. |
| Dead ends | "Stop generation" left an empty player with no message or retry; "Retry video" after frames had been shown could render a black box because the player key repeated. | Stopped state shows "Generation stopped." with a retry; retry resets the presented-frame marker so the opening chapter shows again. |
| Host page safety | The fullscreen stylesheet matched any element with `data-fullscreen` on the host page. | Selectors are scoped to containers owned by a fullscreen controller. |
| Factual attribution | Two example release paragraphs had grown past the 600-character evidence window, separating features from their availability caveats and source links. | Release blocks restructured so each stays in one evidence chunk; the attribution test now checks the real example prompts. |
| Repository | Deployment workflows, release scripts, answer-cache recording, site metadata and Briefings-specific documentation shipped with the SDK; ten stale tests failed; knip did not know the SDK entrypoints. | Removed or rewritten; tests repaired against current behaviour; `npm run check` is green; a type-checked minimal host example was added. |

A parallel working session on the same tree added narration
retry (a discreet control that replays the finished video and retries failed
speech), speech request retries for short admission rejections, an accurate
`retry-after` header, and per-process local development files so test servers
no longer rebuild a running worker.

## Verification evidence

Fixture-based, no paid calls:

- `npm run check` (ESLint, TypeScript, example type-check, knip, Vitest, Node
  API tests), `npm run check:docs`, `npm run build`, `npm run build:sdk`: see
  the CI run on the pull request for the authoritative result; the last local
  run before pushing is recorded in the pull request description.
- Browser (Chromium, recorded media, paid providers disabled):
  `npm run test:embed` plus the podcast player, article view, mobile embed and
  narration recovery specs.
- Focused new tests: bounded re-authoring, client deadline and message mapping,
  cross-site and content-type rejection, disabled optional prompts, Stop
  recovery, autoplay refusal, example attribution chunks.

Not verified live. These need an explicitly budgeted run against real providers
and are the main gap before calling the SDK production-ready:

- Structured-output reliability of the configured model for the briefing
  grammar over many real prompts, including how often the single retry is used.
- Time to first useful scene, narration fit and voice continuity.
- Factual fidelity of generated text against supplied sources (the validator
  proves provenance of evidence, not entailment of every paraphrase).
- Screenshot animation fidelity when enabled.
- Physical iOS audio behaviour for podcast and narration.

Suggested bounded live plan (requires an approved budget before running): ten
prompts (the three shipped examples plus seven varied customer contexts), each
generated once per format on localhost with keys in `.dev.vars`, recording
retry counts, latency to first scene, and a manual fidelity review of every
fact against its evidence. Expected cost is a few dollars at current model
prices; confirm the figure before starting.

## Security responsibilities split

The SDK validates requests and model output, keeps credentials out of the
browser and logs only fixed classifications. The host must:

- authenticate callers (`authorize`) and key quotas on a tenant or user id, not
  an IP address;
- set `allowedOrigins` when the handler is served behind a proxy;
- enforce spending ceilings per tenant and globally before calling providers
  (the reference Cloudflare adapter's IP-keyed ledger is a public-demo policy
  with lifetime fal caps that a corporate NAT would exhaust for a whole company);
- serve host screenshots over public HTTPS and keep `animate` off unless the
  trusted configuration enables it.

## Known limitations and follow-ups

- The reference Cloudflare adapter still contains inherited paths: Cloudflare
  Access owner verification, the R2 answer cache, welcome and suggestion media,
  the pre-briefing `compose` action, and `x-briefings-*` header and storage
  names. They are unreachable from the embed but reachable by any same-origin
  caller; remove them or rename deliberately with their tests.
- Without an `XAI_API_KEY` the podcast steps through the transcript silently
  rather than reporting that speech is unavailable.
- Tabs lack arrow-key navigation; the seek slider step is 0.1 seconds; a few
  secondary controls are under 44 pixels; the follow-up field relies on a
  Chrome-only auto-sizing property.
- Audio preferences persist under a `briefings.audio` localStorage key on
  every mount; a host-visible, opt-in key would be cleaner.
- Scene media URLs from the server are not re-validated on the client; trust
  rests on the server-side sanitizer and the provider adapters' pinned hosts.
- `npm audit` reports high and critical advisories in development dependencies
  only (vitest, miniflare/wrangler, transitive utilities). The published SDK has
  one runtime dependency (`jose`, used only by the inherited owner path). CI
  audits production dependencies; upgrading the dev toolchain is a follow-up.
- CI is deliberately small: lint, types, tests, builds and the Chromium embed
  specs. The inherited cross-browser media matrix still exists for local runs
  (`npm run verify`); in it, the Firefox mobile-embed fullscreen bounds and two
  WebKit timing probes fail in headless mode and need attention before anyone
  relies on that matrix again.
- The hosting policy in `public/_headers` (`frame-ancestors 'none'`) blocks
  iframe embedding of the demo; hosts embed the component, not the demo page.

## Decisions that need a human

- **Licensing.** The repository is Apache-2.0, Copyright 2026 Joris Dieben, with
  a fresh history. Add a NOTICE file if third-party attributions accumulate.
- **Adapted prompt vocabulary.** `docs/maintainers/two-visual-styles-evaluation.md`
  records MIT-licensed vocabulary adapted from gokayfem/h3-max-education. Check
  whether any survives in `src/server/video-chat-prompts.ts` and keep the
  attribution in a NOTICE file if so.
- **Third-party test media.** Pexels footage and CC0 music sit in tracked test
  fixtures and the packaged audio library; both licenses permit redistribution
  with the included attribution.
- **Microsoft imagery.** Example prompts hot-link public Microsoft release-note
  images as sample input; replace them if the demo is shown commercially.
