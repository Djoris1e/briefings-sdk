# Provider integration

`createBriefingHandler` (`@djoris/briefings/server`) takes host-owned
callbacks and returns a `Request → Promise<Response>` handler. The callbacks
are the only place provider SDKs, credentials, models and spending policy
live; planning, validation and playback are provider-neutral. The local
preview wires them in `functions/api/video-chat.mjs` using the adapters in
`functions/_video-chat/`.

## Reference adapters

- `provider.mjs`: OpenAI Responses API. `providerText` handles bounded tasks
  and the structured `briefing` task (schema sent as `text.format` with `strict: true`);
  `providerStream` streams the video plan. Model and token ceilings come from
  `briefing.config.ts` through `config.mjs`. Requests use `store: false`;
  incomplete, refused and failed responses are rejected. The default planner is
  `gpt-6-luna` with reasoning disabled to preserve incremental startup.
- `speech.mjs`: OpenAI text-to-speech (`gpt-4o-mini-tts`), returning MP3 audio
  without word timestamps. The player uses estimated caption timing. `speaker` absent selects the narrator voice; `host`/`analyst` select
  the two podcast voices. All three are server configuration.
- `fal.mjs`: MiniMax H3 Max Turbo text-to-video (and image-to-video for
  explicitly enabled screenshot animation) at 768P, with a per-answer clip
  ledger in D1 and status polling that never resubmits a paid job.
- `stock.mjs`: Pexels video search with orientation-aware renditions.
- `quota.mjs`, `provider-admission.mjs`: IP-hash admission and the guard that
  stops paid callbacks after release or abort.

Set `OPENAI_API_KEY`, `FAL_KEY` and `PEXELS_API_KEY` in
ignored `.dev.vars` locally. The committed `wrangler.jsonc` sets
`VIDEO_CHAT_FAL_PREVIEW=enabled`, which fal requires in addition to its key.

## Text callbacks

`prepareText({ task: "briefing", systemPrompt, userPrompt, maxOutputTokens, outputSchema, signal })`
returns one complete JSON string. Enforce `outputSchema` when the provider
supports it; otherwise instruct the model with it and expect the validator to
reject and re-author once. Honour `signal`; the server deadline covers the
whole call.

`streamText({ systemPrompt, userPrompt, signal, … })` returns an
`AsyncIterable<string>` or an object with `textStream`. The planner reads a
complete answer brief followed by shot records as NDJSON. Keep incremental
delivery: do not buffer the whole plan before returning.

`generateText` handles bounded helper tasks: `narration`, `narration-rewrite`
and `suggestions`. Honour `systemPrompt`, `userPrompt`, `maxOutputTokens` and
`signal`. A narration rewrite is one short attempt to fit a spoken beat, not
another planning run.

Pass both prompt strings unchanged. Credentials and media URLs never belong in
either. See the [callback reference](reference/provider-adapters.md).

Existing archived speech is never replayed by the reference route: those recordings
do not identify the provider/model/voice. Each live client still caches audio for
its current session.

## Speech

`generateSpeech({ text, signal, speaker? })` returns
`{ audio: Uint8Array | ArrayBuffer, mediaType?, wordTimings? }`. Word timings
are `{ text, start, end }` in seconds on that audio's clock, one per
whitespace-delimited word; omit them rather than estimate. Map `host` and
`analyst` to two distinct voices and absent `speaker` to the narrator. The
server allows 10 seconds per line; the browser 12 including transfer and
decoding. Without this callback the speech action returns `204` and playback is
silent.

## Footage

`generateVideo(query, { requestedDurationSec, shotDirection, generatedLook,
orientation, scene, deadlineAt, signal })` returns
`{ type: "video", url, durationSec, posterUrl? }` or `null`. Reserve quota
before submission, submit once, keep the job ID, poll only until `deadlineAt`
or cancellation, and cancel accepted work best-effort. A browser-playable URL
needs no extra storage; private or short-lived assets do. The reference
configuration requests five seconds for the first clip and eight for later
clips (`firstGeneratedClipDurationSec`, `generatedClipDurationSec`), with a
45-second `generateVideoTimeoutMs`.

`searchMedia(query, { purpose, orientation, preferredType, scene, signal })`
returns an approved image or video object or `null` within its own short
deadline. Stock has no generated-duration cap; return `durationSec` when known.
Neither mode requests extra footage to extend narration; the player repeats
healthy footage while speech finishes.

For screenshot scenes, the adapter receives the host asset by ID and must use
that image; it must not derive an image URL from the prompt. Animation requires
both the asset's `animate: true` and the trusted configuration's
`video.animateScreenshots: true`.

## Existing assistant answer

`resolveAnswer({ prompt, conversation, signal })` is an optional handler option
that supplies a completed answer (at most 32,000 characters, 30-second bound)
as the planner's sole factual source. The component does not use it; a host
that already has an assistant can. A failed or oversized answer returns
`answer_unavailable`, never a substitute.

## Rules for every callback

Submit each paid job once. Preserve the job identifier and the uncertain quota
reservation when a response is ambiguous. Cancellation is best effort and does
not prove accepted work was free. Return safe errors; never expose provider
payloads or credentials to the browser. `onComplete` fires for successful
completion only. Deterministic tests prove callback behaviour, not live
quality, cost or latency.
