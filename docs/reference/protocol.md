# Wire contract

Two request shapes share one endpoint (default `/api/video-chat`), selected by
the `action` query parameter. Both are versioned so component and handler stay
in sync and are validated on arrival. They are an internal contract between
`PromptOutput` and `createBriefingHandler`, not a public API.

## Briefing (`action=briefing`)

`POST` JSON `{ prompt, screenshots? }` → `200` JSON `PreparedBriefing`
(`version: 1`), or `400 invalid_request`, `401 unauthorized`, `429
request_throttled` (with `retry-after`), `499 aborted`, `502
briefing_unavailable`. The client re-validates the body and checks that
`prompt` equals the request. Shape and bounds are in [SDK.md](../SDK.md#canonical-content-and-limits).

## Speech (`action=speech`)

`POST` JSON `{ text, speaker? }` (`speaker` is `"host"` or `"analyst"` for the
podcast, absent for narration; text at most 1,000 characters) → audio bytes
with `content-type`, or JSON `{ audio, mediaType, wordTimings }` when timings
are available, or `204` when no voice is configured, or `502 speech_failed`.

## Video response protocol 0.6 (`action=response`)

### Transport

UTF-8 Server-Sent Events from a `POST`. Headers: `Content-Type:
text/event-stream`, `x-briefings-video-stream: 0.6`, `Cache-Control:
no-cache, no-transform`, `X-Accel-Buffering: no`. Each block has an SSE `id`,
event name `video` and one JSON envelope in `data`. `data: [DONE]` closes the
transport after a terminal event. Comment heartbeats carry no state.

The `x-briefings-*` header names are legacy names from the inherited engine
and remain the wire contract; the client reads them by that exact spelling.

### Envelope

```ts
type VideoEvent<T extends string, D> = {
  protocolVersion: "0.6";
  runId: string;
  sequence: number;
  eventId: string;        // exactly `${runId}:${sequence}`
  type: T;
  data: D;
};
```

Sequences start at zero and increase by one. Unknown fields are rejected.
Replaying an `eventId` with identical content is idempotent; different content
is an error. The run ID cannot change midstream and nothing follows a terminal
event.

### Lifecycle

1. `response.start`: request ID, orientation, style, negotiated
   templates/extensions.
2. Optional `audio.set`, at most once, before the first scene.
3. `scene.add`: one complete, immutable scene from a trusted template.
4. Exactly one terminal event: `response.complete`, terminal `response.error`
   or `response.abort`.

`response.complete` carries the full replayable `Video`
(`schemaVersion: "0.2"`, independent of the protocol version), a finish reason
and a deterministic checksum. The reducer checks the snapshot against the state
built from prior events; the checksum detects drift, not tampering.
Recoverable `response.error` events may be followed by more events; terminal
errors carry a safe public message only.

`maxDurationSec` is a ceiling. A final scene may be shortened to fit; a scene
that would start at the ceiling ends the run with `finishReason: "length"`,
which is normal completion.

### Extensions

Extension events use a namespaced `data.*` type and are accepted only when the
exact name was negotiated in `response.start.capabilities.extensions`. They
cannot change core video state.

### Planning boundary

Models never emit envelopes. The planner produces an answer brief and shot
descriptions; the runtime assigns scene IDs, resolves media, validates scenes
and completes the run. The ending is reserved early and committed after the
body; a missing ending yields a safe incomplete-plan warning. Generated HTML,
React, JavaScript, CSS, envelopes and unknown parts are rejected.

### Resume

A resume request repeats the original input with
`{"resume":{"runId":"run-123","afterSequence":7}}` and `Last-Event-ID:
run-123:7`. The server validates both cursors and calls replay storage if a
host provides one; nothing here ships a persistence service.

### Narration groups

`VideoScene.narrationGroup` optionally joins adjacent shots into one prepared
spoken paragraph with server-supplied `id`, `text`, measured `totalSeconds`
and per-segment offsets; fragments must exactly cover the paragraph. The
planner cannot emit it. Grouped playback requires prepared speech with
`supportsOffsets: true`; the client prepares and validates the whole group
before showing its first scene. The voice must call `onStart` when audio
actually begins; a missing onset or a clock that stops for eight active seconds
fails playback explicitly. Default planner responses prepare narration per
scene.

### Resolved footage mode

On a successful stream the reference route adds
`x-briefings-resolved-video-mode: pexels | cinematic` and, when the AI-video
allowance ran out, `x-briefings-video-fallback: credits`. The client records
them for the turn and its metrics; unknown values are ignored. The headers never
grant access or change a spending limit.
