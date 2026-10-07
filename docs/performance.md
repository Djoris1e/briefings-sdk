# Performance

## Two parallel paths

A generation starts two requests at once. The video stream shows the opening
chapter immediately and streams scenes as they are planned; the briefing
request returns one JSON document when the structured provider call completes
and validates. Neither waits for the other. Switching tabs never makes a new
request.

Provider time and prompt-to-playback time measure different things. For video,
planning, narration preparation, footage generation, transfer and decoding can
all leave the viewer waiting after the opening. For the briefing, one model call
of several thousand output tokens dominates; a validation rejection adds a
second full call. Measure first audible speech, first moving footage, briefing
arrival and gaps between scenes separately. A provider benchmark alone does not
establish smooth playback.

## Generating ahead of playback

The engine assumes a clip can be generated in less time than it takes to watch
the scenes before it. Templates need no assets and play first; stock and
generated footage prepare for later scenes while earlier ones play. Generated
footage and narration shortening run concurrently. The fal adapter reads
completion from its status stream with watchdog status checks on the same job
and never resubmits. Progressive delivery cannot remove a vendor's generation
delay: a slow job stays slow even when the next scene is prepared early.

## Observing the video path

`useVideoChat` accepts `onPlaybackMetric(metric)` and `onFirstFrame(metric)`;
`PromptOutput` uses the hook internally, so attach these in a custom host built
on `useVideoChat`/`VideoPlayer` or in tests. Events carry an opaque turn ID,
mode, relative timing and fixed categories; nothing is sent anywhere.

- `first-frame`: the first committed active scene reaching an animation frame.
  It excludes the opening chapter and is not proof of decoded footage.
- `first-media-frame`: the first decoded footage frame presented.
- `first-speech`: actual utterance start from generated audio, not request
  completion. Muted playback produces none.
- `stall`: a completed wait with `durationMs` and a reason:
  `scene-generation`, `speech` or `media-decoding`. Deliberate pauses excluded.
- `scene-duration`, `media-playback`, `buffer`: prepared versus actual seconds,
  repeat counts and buffered seconds across the active and next media elements.

Elapsed times start at submission and can include user pauses. Treat missing
speech observations as missing data.

The handler's `onDiagnostic(event)` observes accepted requests, authored
openings and shots, and media start/end/skip timings on the server with fixed
reasons (allowance, deadline, timeout, provider error, empty, cancelled, not
configured). The planner summary includes `provider.firstTextMs` and
`provider.durationMs`, measured from the provider request, with stream duration
including consumer backpressure. `narration-rewrite.durationMs` isolates repair
time. The reference route logs `video-chat.fal-timing` per clip with the
answer-admission wait.

## Observing the briefing path

`prepareBriefing` reports `unusable_output` with `attempt`, `reason` and
`recovery` through `onDiagnostic`; the reference route logs it as
`video-chat.briefing-recovery` and failures as `video-chat.briefing-failure`
with a fixed reason. Time the request from the client with the request ID; the
hook exposes `status` transitions (`writing` → `preparing` → `ready`) for
instrumentation. The podcast prepares two turns before `ready`, so measure
briefing arrival (`onPrepared`) and first podcast audio separately.

## Reproducible checks

`npm run browser:test -- tests/browser/video-chat-performance.spec.ts` runs
controlled scenarios that delay scene delivery, report speech onset from a mock
voice and verify pause exclusion. They detect sequencing regressions, not
provider latency. The recorded-media application check in `tests/app-browser/`
delays the renderer download and holds scene delivery to verify overlap,
complete speech and moving footage.

Fallback limits are 15 s for the first generated scene (45 s in the reference
configuration), 3 s for stock, 10/12 s for speech and 90 s for the briefing.
Validate them against an authorized live run before treating them as tuned.
Compare first-frame, first-speech, briefing arrival, stalled time and quality
together; a faster fallback alone proves nothing.
