# Architecture

The SDK turns one supplied text (plus optional host screenshots) into three
outputs: a streaming video, a two-speaker podcast and a readable article. The
video is planned directly from the supplied text by the inherited video engine.
The podcast and article come from one separately prepared, validated
`PreparedBriefing`. Both start at the same time and neither waits for the other.
There is no persistence, export, source ingestion or tenant access; the host
supplies the text and owns the publisher label.

## One generation, step by step

```text
PromptOutput.generate(prompt, format, { screenshots })      src/briefing/PromptOutput.tsx
  ├─ video.ask(prompt, { screenshots })                     src/video-chat/use-video-chat.ts
  │    POST /api/video-chat?action=response  → SSE stream   src/server/create-video-chat-handler.ts
  │      createChatShotPlanner: answer brief → ordered shots src/server/chat-shot-planner.ts
  │      per shot: template or stock/generated media, narration rewrite if oversized
  │    browser: scene preparation + speech per line         src/video-chat/scene-preparation.ts, src/video-chat/voice.ts
  │      POST ?action=speech (narrator voice, word timings)
  │    VideoPlayer plays ordered scenes                      src/player/
  └─ output.generate(prompt, "podcast", { screenshots })    src/briefing/use-prompt-output.ts
       POST /api/video-chat?action=briefing → JSON          src/briefing/handler.ts → src/briefing/prepare.ts
         prepareBriefing: one structured provider call, server validation,
         at most one re-author retry under the same deadline
       article + summary render at once; podcast turns prepare speech lazily
         POST ?action=speech with speaker: "host" | "analyst"
```

1. `PromptOutput` (`src/briefing/PromptOutput.tsx`) owns the tabs, composer,
   follow-up field and playback controls. `generate` records the original
   brief, then calls `runPrompt`, which fires the video request and the
   briefing request together and reveals the result area. The opening chapter
   is shown immediately while the first scene streams.
2. Video: `useVideoChatSession` (`src/video-chat/use-video-chat.ts`) posts
   `action=response` with the prompt, bounded conversation, orientation and
   validated screenshots. `createVideoChatHandler`
   (`src/server/create-video-chat-handler.ts`) validates the request
   (`src/server/video-chat-input.ts`), opens the SSE stream
   (`src/server/video-chat-stream.ts`) and runs `createChatShotPlanner`
   (`src/server/chat-shot-planner.ts`) over the host's `streamText`. The
   planner emits a compact answer brief, then shots as NDJSON; each shot gets a
   template (chapter, key figure, comparison, quote, timeline, screenshot) and,
   in `hybrid`/`mediaLed` mode, optional full-frame stock or generated footage
   through `searchMedia`/`generateVideo`. Oversized narration gets one bounded
   `generateText` rewrite. Scenes are validated (`src/server/compose-video.ts`,
   `src/protocol/`) before they are sent; the stream ends with a complete
   replayable `Video`. In the browser, `src/video-chat/scene-preparation.ts`
   warms media and prepares speech ahead (at most two lines at a time) through `createVideoChatVoice`
   (`src/video-chat/voice.ts`), which posts `action=speech` per line and plays
   the returned audio with word timings for captions. `src/player/` plays the
   ordered scenes and holds for late media rather than skipping narration.
3. Briefing: `usePromptOutput` (`src/briefing/use-prompt-output.ts`) posts
   `action=briefing` with `{prompt, screenshots}` under a 130-second client
   deadline and caches up to eight results per endpoint/prompt/screenshots key.
   `createBriefingHandler` (`src/briefing/handler.ts`) routes that action to
   `prepareBriefing` and everything else to `createVideoChatHandler`.
   `prepareBriefing` (`src/briefing/prepare.ts`) splits the prompt into
   numbered source chunks, builds one system prompt, and makes one
   `prepareText` call with `task: "briefing"`, a 6,144-token bound and a JSON
   schema (`src/briefing/authored-schema.ts`). The model returns `summary`,
   `article`, up to six `facts` that cite a source chunk ID, up to three
   `priorities`, and a podcast with fixed `opening`/`detail`/`closing` slots
   (opening required, later slots nullable). The server attaches the exact
   source text as evidence, expands the slots into alternating host/analyst
   turns, and runs `validatePreparedBriefing`. Output that fails that contract
   is re-authored once (default `retries: 1`, maximum 2) inside the same
   deadline (default 90 s, maximum 120 s); timeouts, cancellation and provider
   failures are never retried.
4. Podcast playback: when the briefing arrives, the hook renders the summary
   and article at once, creates one voice per speaker, and prepares the first
   two turns. Play is always an explicit user action. During playback the next
   turn prepares one ahead; seeking works across measured audio only, and
   switching tabs pauses whichever format was playing. Follow-ups rebuild the
   prompt from the original brief, the last eight turns' summaries and the new
   question (`src/briefing/context.ts`) and run the same two requests again.

Both requests share the same endpoint, admission and cancellation. A failed
briefing shows a "Retry text and podcast" control and leaves the video alone;
a failed video shows "Retry video" and leaves the briefing alone.

## Reference server adapter

`functions/api/video-chat.mjs` is the Cloudflare Pages route used by the local
preview. It is a reference, not part of the packaged `@djoris/briefings/server`
entry. It:

- rejects cross-origin requests and non-JSON bodies before reading them, and
  returns `503 setup_required` when `configurationStatus` finds a missing key or
  binding;
- hashes the client IP with a server salt (`functions/_video-chat/quota.mjs`)
  and reserves an atomic D1 quota row before any paid action (20 per actor per
  minute, 4 concurrent per actor, 12 concurrent overall); releases it when the
  response finishes, fails or is cancelled;
- wraps every provider callback in `guardPaidProvider` so a released or aborted
  request cannot start new paid work;
- for `action=briefing`, calls `prepareBriefing` with the OpenAI adapter's
  `providerText` (structured output via `output_config.format`); for everything
  else, builds `createVideoChatHandler({ hybrid: true, mediaLed: true, … })`
  with OpenAI planning (`provider.mjs`), OpenAI speech (`speech.mjs`, narrator
  plus host/analyst voices from `briefing.config.ts`), fal generated footage
  with its own per-answer clip ledger (`fal.mjs`) and Pexels stock (`stock.mjs`);
- adds `x-briefings-resolved-video-mode` (and `x-briefings-video-fallback`
  when the AI-video allowance ran out) to the response. These header names are
  legacy and still the wire contract.

Hosts outside Cloudflare mount `createBriefingHandler` with their own
callbacks and admission; see [SDK integration](SDK.md).

## Package

`scripts/build-sdk.mjs` bundles three entry points with esbuild into `sdk-dist`
(`src/briefing/index.ts` → types and config, `src/briefing/react.ts` →
`PromptOutput` and `usePromptOutput`, `src/briefing/server.ts` →
`createBriefingHandler`, `prepareBriefing` and the video server exports), emits
declarations through `tsconfig.sdk.json`, and copies `public/audio-library`
into the package. React is a peer dependency; nothing from `functions/` or
`app/` is included. `npm pack` produces a private tarball; nothing is published.

## Where to work

| Change | Source |
| --- | --- |
| Component, tabs, follow-ups, playback controls | `src/briefing/PromptOutput.tsx`, `src/briefing/prompt-output.css` |
| Text and podcast client, caching, seeking | `src/briefing/use-prompt-output.ts` |
| Article reader and podcast transport UI | `src/briefing/ArticleView.tsx`, `src/briefing/PodcastPlayer.tsx` |
| Briefing preparation, validation, `toVideoPrompt` | `src/briefing/prepare.ts`, `src/briefing/authored-schema.ts` |
| Editorial guidance shared by prompts | `src/briefing/editorial.ts` |
| Portable endpoint | `src/briefing/handler.ts` |
| Provider configuration helper | `src/briefing/config.ts` |
| Follow-up prompt construction | `src/briefing/context.ts` |
| Video request lifecycle, cancellation, playback handoff | `src/video-chat/use-video-chat.ts` |
| Browser SSE consumption and concurrent preparation | `src/video-chat/response-stream.ts`, `src/video-chat/scene-preparation.ts` |
| Speech requests, decoding, captions clock | `src/video-chat/voice.ts` |
| HTTP admission, methods, CORS, bounded body | `src/server/video-chat-http.ts` |
| Video orchestration and provider callbacks | `src/server/create-video-chat-handler.ts`, `src/server/video-chat-options.ts` |
| Request validation and bounded conversation | `src/server/video-chat-input.ts` |
| Stream ordering, opening and preparation events | `src/server/video-chat-stream.ts` |
| Planning prompts | `src/server/video-chat-prompts.ts` |
| Answer brief and shot planning | `src/server/chat-shot-planner.ts` |
| Validated composition and completion | `src/server/compose-video.ts` |
| Wire contract, reduction, speech/clip budgets | `src/protocol/` |
| Media readiness, timeline, narration, player | `src/player/` |
| Scene templates | `src/visual-system/scene-templates/` |
| Music catalog | `src/music-catalog.ts`, `public/audio-library/` |
| Reference API route and provider adapters | `functions/api/video-chat.mjs`, `functions/_video-chat/` |
| Local preview shell and example inputs | `app/`, `index.html`, `scripts/dev.mjs` |
| Package build | `scripts/build-sdk.mjs`, `tsconfig.sdk.json` |
| Player and component styles | `styles/`, `src/briefing/prompt-output.css` |

Server modules must not import React; browser modules must not import Node or
provider libraries. `tests/isolation.test.ts` checks those boundaries.

## Boundaries worth knowing

- The model never sees or returns media URLs. Screenshot assets are validated
  host objects; the briefing model only sees their IDs and `alt` text, and the
  video planner selects them by ID.
- Evidence is exact text from the supplied prompt, restored by the server. It
  proves provenance, not that a paraphrase follows logically.
- `createBriefingHandler` requires an explicit `authorize` option. `"none"` is
  only for in-process tests or a host that enforces admission in front of it,
  as the reference route does.
- The podcast script and article never feed the video planner; `toVideoPrompt`
  exists for hosts that want to plan video from a prepared briefing instead of
  the raw text, and the component does not use it.
- Deadlines bound waiting, not quality: 90 s briefing, 45 s generated video
  (`video.timeoutMs`), 10 s server speech, 12 s browser speech. Real latency
  and factual fidelity need a budgeted live run.

See [development](development.md) for the check loop, [testing](testing.md)
for the deterministic fixtures, and [SDK integration](SDK.md) for the host
contract.
