# Changelog

This repository holds the `@djoris/briefings` SDK, a personal project. It is
not published to a registry; entries describe the reviewed state of the code.

## Unreleased (October 2026)

### Product

- One prompt (customer context plus release material) produces a streaming
  video, a two-speaker podcast with transport controls and an audio-reactive
  waveform, and a longer scrollable article. Subtitles are optional and off.
- Shared factual briefing: one structured provider call authors summary,
  article, facts with exact source evidence, priorities and fixed podcast
  slots (opening, detail, closing). Server validation rejects invented
  evidence, missing fact references, speaker-order errors and oversized output.
- Video plans directly from the supplied source in parallel with the briefing;
  a failed or slow briefing cannot stop or interrupt the video.
- Restrained editorial design with light/dark switch, responsive portrait and
  landscape layouts, contextual follow-ups and immediate example launch.

### Reliability

- Unusable model output is re-authored once inside the original deadline;
  timeouts, cancellation and provider failures surface immediately.
- The text/podcast request is bounded client-side and ends in a visible error
  with retry; raw internal error text never reaches users.
- Narration failures offer a discreet retry that keeps completed video and
  successful audio.

### Security

- Portable handlers reject cross-site writes (foreign `Origin`) unless the host
  allows them and require `application/json` for write actions.
- Credentials stay server-side; request bodies cannot choose providers, models
  or voices; screenshot URLs are validated (HTTPS, public hosts, no credentials).
- The reference Cloudflare adapter keeps IP-keyed admission, bounded generated
  video spend and paid providers disabled by default.

### Repository

- Inherited deployment workflows, release scripts, answer-cache recording and
  site metadata removed. Documentation rewritten for the SDK. A type-checked
  minimal host example lives in `examples/minimal-host`. CI runs lint, types,
  tests, builds and the Chromium embed specs; the cross-browser media matrix
  remains a local release check.
