# Provider callback reference

These are the callbacks `createBriefingHandler` (and the `createVideoChatHandler`
it wraps) accepts. `functions/_video-chat/` implements them for the local
preview. Types live in `src/server/video-chat-options.ts` and
`src/briefing/handler.ts`.

## Briefing

`prepareText(request)` receives `task: "briefing"`, `systemPrompt`,
`userPrompt` (JSON with numbered source chunks and screenshot IDs/alt text),
`maxOutputTokens` (6,144), `outputSchema` (JSON Schema) and `signal`. Return one
JSON string. The server validates it; output that fails the content contract is
re-authored once under the same deadline (`briefingTimeoutMs`, default 90,000,
maximum 120,000 ms). Timeouts and cancellation are not retried.

## Planning

`streamText({ systemPrompt, userPrompt, signal, … })` returns an
`AsyncIterable<string>` or `{ textStream, … }`. The stream contains NDJSON
answer and shot records; chunks are buffered only until a complete record
parses. Keep this incremental so early scenes prepare before the plan ends.

`generateText` returns a string for `narration`, `narration-rewrite` and
`suggestions`. Honour `maxOutputTokens` and `signal`. Provider metadata stays
server-side through completion observers and never enters the browser stream.
Do not log prompts or deltas.

## Generated video

`maxGeneratedVideos` is a per-response attempt budget including failures; zero
skips generation. Never copy an untrusted request value into it.

`generateVideo(query, context)` receives `requestedDurationSec`,
`shotDirection`, `generatedLook`, `orientation`, `scene` (with screenshot
variables when the shot uses a host asset), absolute epoch-millisecond
`deadlineAt` and `signal`. Return approved media with `durationSec` when known,
or `null`.

Keep `generatedClipDurationSec` (2–20 s), `firstGeneratedClipDurationSec`,
`mediaConcurrency` and `generateVideoTimeoutMs` (1–600,000 ms; internal default
15,000, reference configuration 45,000) aligned with the model. Reserve quota
before submission, submit once, poll until deadline or cancellation, cancel
best-effort. Never assume a timed-out request cost nothing.

## Stock

`searchMedia(query, context)` runs under its own short deadline, independent of
the generated allowance. Return approved browser URLs and `durationSec` when
known, or `null`. A failed clip does not authorize switching providers; the
reference route separately falls back to configured Pexels when the AI-video
allowance is exhausted.

## Speech

`generateSpeech({ text, signal, speaker? })` is optional. Return
`{ audio, mediaType?, wordTimings? }`. `speaker` is `"host"` or `"analyst"` for
podcast turns and absent for video narration. Without the callback the speech
action answers `204` and playback is silent. `transcribe` is a separate optional
callback for microphone input; the component does not use it.

## Admission and observers

`authorize` is required: a function returning whether the request may proceed,
or the explicit `"none"` opt-out. `allowedOrigins`, `allowCredentials`,
`maxBodyBytes` and `maxAudioBytes` bound the HTTP surface. `onError`,
`onWarning`, `onComplete` and `onDiagnostic` receive server-side diagnostics
only; their failures never affect a response.

## Existing answers

`resolveAnswer({ prompt, conversation, signal })` supplies a completed answer
(32,000 characters, 30 seconds) as the planner's factual source. Keep retrieval,
tools and authorization inside it. See
[provider integration](../provider-integration.md#existing-assistant-answer).
