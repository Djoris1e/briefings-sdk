# Errors and recovery

`PromptOutput` keeps whatever output exists when one part fails. The video and
the text/podcast briefing fail independently: a failed briefing shows
"Retry text and podcast" and the video keeps playing; a failed video shows
"Retry video" and the briefing stays readable. A fatal message appears only
when a format has nothing to show. Provider details and stack traces never
reach the interface.

## Briefing request

| Failure | Result |
| --- | --- |
| Prompt empty or over 12,000 characters, bad screenshots | `400 invalid_request`; the component shows a validation message before sending |
| Quota rejected | `429 request_throttled` with `retry-after`; "Too many requests right now" |
| Model output fails the content contract | One re-author attempt under the same deadline, then `502 briefing_unavailable` |
| Timeout (server default 90 s, client 130 s) or provider error | `502`/`503`; "Could not prepare the briefing" with a retry control |
| Client abort | `499 aborted`; nothing shown |
| Response prompt differs from the request | Rejected client-side; "The briefing did not match this request" |

The server reports only fixed classifications (`unusable_output`,
`priority_*_bounds`, `invalid_output`, `timeout`, `provider_failure`) through
`onDiagnostic`/`onError`; it never logs source text or provider output. An
unusable optional priority is dropped whole; facts, summary and dialogue stay
strictly validated.

## Podcast playback

The first two turns prepare when the briefing arrives; during playback the next turn prepares one ahead. A `204` from the speech action (no voice
configured) plays the transcript silently with estimated durations. A failing
speech provider raises "Podcast speech is unavailable. Your briefing is still
available to read or watch." Short admission rejections retry automatically up
to twice; other failures wait for the user. Seeking only reaches measured audio.

## Video stream

| Failure | Result |
| --- | --- |
| Invalid planner scene | Skip the part and accept later valid scenes |
| Generated footage late or failed | Use the authored template; never silently switch to stock |
| Stock lookup failed | Try another candidate or use the template |
| Scene renderer error | Isolate the failed scene with a safe visual |
| Generated speech failed | Continue silently, keep captions and transcript; "Retry narration" appears after the turn completes |
| Late stream failure | Keep the opening and completed scenes |
| Unauthorized or invalid request with no playable output | Safe error message |

Non-fatal warnings stay on `chat.warnings` and the turn's `warnings`;
`chat.error` is set only when nothing can play. Check `turn.completed` before
treating a turn as finished conversation context.

`VideoError` exposes `code`, `message`, optional HTTP `status`, `requestId`,
`runId` and `recoverable`. Log safe codes and IDs from the client. The server's
`onError` observer receives internal diagnostics; redact credentials, source
data, provider payloads and signed URLs before storing them. Observer failures
are isolated from the response.

## Cancellation and retries

`cancel()` on the component ref aborts both requests, stops speech and resets
the result. Replacing a prompt aborts the previous providers. Hosts must forward
`signal` to every provider callback and own deadlines, quotas and retry budgets.
The video client retries once only before playback starts; nothing restarts
generation after the viewer has begun watching, and paid generation requests
are never replayed without an explicit idempotency and spend policy.

The server drops invalid generated parts by default; `invalidPartBehavior:
"fail"` is an explicit strict policy. `onComplete` runs after
`response.complete`, including recovered responses; fatal errors, disconnects
and aborts do not call it.

## Deadlines

Briefing preparation: 90 s default, 120 s maximum (`briefingTimeoutMs`).
Generated video: 45 s in the reference configuration (`video.timeoutMs`,
maximum 60 s); later scenes are further bounded by their playback deadline.
Stock lookup: 3 s. Generated speech: 10 s on the server, 12 s in the browser
including transfer and decoding. A deadline uses the same fallback as a failed
provider; late results are ignored even if the provider does not cooperate.
These values bound waiting; they are not measurements of provider performance.
