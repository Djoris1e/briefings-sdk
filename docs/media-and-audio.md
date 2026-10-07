# Media, voice and audio

Provider choice lives in the host's callbacks (`functions/_video-chat/` in the
preview). The engine advertises only configured capabilities and keeps every
credential out of the browser bundle.

## Captions and word timings

The video shows live phrase subtitles when the viewer turns on the CC control
in the composer; the choice persists for the mounted component across
follow-ups and format switches. Highlighting follows provider word timings on
the actual audio clock, including pauses and replay. Audio without usable
alignment uses estimated pacing. The xAI adapter requests character timestamps
and converts them to validated word intervals; because that includes an
alignment pass, speech generation gets 10 seconds on the server and 12 in the
browser. The podcast player shows the transcript with the active turn.

## Footage sources

Each shot carries authored content (title, narration, visual metadata). In
`hybrid`/`mediaLed` mode the planner also chooses a footage source: a supplied
screenshot, stock, generated video or none. Failed or late footage keeps the
authored template with complete narration; it never triggers a cross-provider
search. The reference route switches an answer to Pexels mode before planning
when fal is not configured, or when the actor's AI-video allowance is exhausted
and Pexels is configured. Pexels mode never generates video.

Screenshot scenes show the supplied image at its own aspect ratio with a source
label; a focus rectangle, when supplied, drives a detail move. Generated
illustration from a screenshot is separate and off by default.

### Stock

Replace `searchMedia` to use a different licensed catalog:

```js
createBriefingHandler({
  // ...prepareText, streamText, generateText, authorize
  searchMedia: async (query, { purpose, orientation, preferredType, signal }) => {
    const asset = await searchApprovedCatalog({ query, purpose, orientation, preferredType, signal });
    return asset ? { type: asset.type, url: asset.url, posterUrl: asset.posterUrl, durationSec: asset.durationSec } : null;
  },
});
```

The planner emits a short literal keyword, not a URL. Return approved browser
URLs or `null`; licensing, attribution, caching, MIME checks and byte limits
belong to the host. Stock cannot be restyled by the generated-look prompt.

### Generated shots

`generateVideo` receives the planned subject, `shotDirection`, `generatedLook`
(one server-owned photographic default unless the planner or caller sets
another), orientation, the scene, `requestedDurationSec`, absolute `deadlineAt`
and `signal`. Use `requestId` and `scene.id` as an idempotency key; clips are
billable. Keep retries at zero inside the callback and make any retry an
explicit product decision with a budget.

```ts
generateVideo: async (subject, { generatedLook, orientation, requestId, scene, requestedDurationSec, deadlineAt, signal }) => {
  const asset = await generateAndStore({ subject, generatedLook, orientation, requestedDurationSec, deadlineAt,
    idempotencyKey: `${requestId}:${scene?.id}`, signal, maxRetries: 0 });
  return asset ? { type: "video", url: asset.url, durationSec: asset.durationSec, audio: "ambient" } : null;
},
```

The configured fal model can render native ambient audio; the reference adapter
asks for environmental sound and excludes voices, speech and music. Custom
adapters opt in with `generatedVideoAudio: true` on the handler and
`audio: "ambient"` on the result; unmarked footage stays silent. Provider
adherence per clip is not guaranteed and a volume control cannot separate
unwanted sound once mixed in.

### Timing and recovery

`generatedClipDurationSec` is the ordinary clip length (default 5, range 2–20);
`firstGeneratedClipDurationSec` may be shorter. The reference configuration
uses 8 and 5. The planner leaves a 0.8-second tail and drafting headroom (six
ordinary words for the first scene, eleven for later ones); one bounded rewrite
can shorten an oversized beat while footage prepares, keeping one complete idea.
Failed shortening keeps the original narration and footage.

A clip is not a minimum display time. Playback follows measured speech plus a
short tail and readability floor. Healthy footage plays at native speed and
repeats on the same decoder while narration continues; repetition ends with
speech. Missing media or a stalled decoder recovers to the template without
cutting narration or buying another clip.

`generateVideoTimeoutMs` bounds the first shot (internal default 15 s;
reference 45 s). Later deadlines account for position in the answer. A missed
deadline selects the template, not another paid generation.

## Voice

Without `generateSpeech`, video plays silently and the podcast steps through its
transcript without sound. With it, each narration line and podcast turn is one
speech request (`speaker` absent for narration, `host`/`analyst` for the
podcast). The browser measures each line, keeps narration synchronized with the
picture and never lets a new scene replace speech still playing. Failed
generated speech continues silently; the device's browser voice is never
substituted. A custom voice must return `supportsOffsets: true` from `prepare`
only for measured, seekable audio; podcast seeking and grouped narration depend
on it.

## Music and mixing

The component plays one music track per answer from the packaged
`audio-library` (`src/music-catalog.ts`), chosen automatically at 24% volume,
with fades at start and end. Music starts on generation and continues through
the opening and the answer; the mute control silences voice, music and clip
sound together. Unavailable music never blocks speech. Tracks are normalized
for consistent loudness; source, license and processing notes are in the
[audio library README](../public/audio-library/README.md).

On iPhone and iPad, narration and music play from decoded buffers in one
gesture-resumed Web Audio context with separate gains, and a pool of two native
video elements is unlocked on the first gesture so later clips keep audible
permission. Other browsers use native audio elements. Music downloads are
limited to 8 MiB, five minutes and 128 MiB decoded per track; generated speech
uses a 32 MiB decoded cache. Browser autoplay rules still require a gesture
before audible playback; podcast Play is always explicit.

## Safety rules

- Keep every provider key in server-only environment variables.
- Never let a planner return arbitrary media URLs.
- Bound query length, response size, duration, concurrency and generated spend.
- Hold the picture honestly when media is late; never skip narration.
- Return a safe fallback instead of leaving a scene waiting forever.
