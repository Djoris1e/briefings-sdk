# Persistence and replay

This slice does not save anything. The component holds the prepared briefing,
up to eight cached briefings per endpoint, the current video and the follow-up
history in memory; the reference API's D1 database stores quota accounting
only. Audio preferences and inherited session bookkeeping use browser storage
on the device.

If a host adds durable storage, these are the shapes and boundaries.

## Briefings

`PreparedBriefing` is plain JSON (`version: 1`). Validate it on the way back in
with `validatePreparedBriefing` from `@djoris/briefings/server`; it rejects
unknown fields, bad references and oversized text. The `prompt` field is the
original supplied source, so store a briefing only where that source may be
retained, and apply the host's deletion policy to it.

## Videos

A completed `Video` from the stream is ordinary JSON with
`schemaVersion: "0.2"`, separate from streaming protocol `0.6`. Observe
`useVideoChat().turns` and save `turn.video` only when `turn.completed` is true.
Deduplicate by `turn.id`. Load stored values as `unknown` and parse them:

```tsx
import { getVideoDuration } from "../src/protocol/timeline";
import { parseVideo } from "../src/protocol/persistence";
import { VideoPlayer } from "../src/react";

export function SavedVideo({ storedJson }: { storedJson: string }) {
  const savedVideo = parseVideo(JSON.parse(storedJson));
  return <>
    <p>{getVideoDuration(savedVideo)} seconds</p>
    <VideoPlayer video={savedVideo} autoPlay={false} />
  </>;
}
```

`parseVideo(value: unknown)` validates the complete shape, scenes, timing,
audio and JSON-safe template variables and returns a frozen `Video`. Invalid
data throws `VideoValidationError` with `code: "invalid_video"`; other storage
versions throw `code: "unsupported_video_version"`. `<VideoPlayer>` repeats this
check and never renders a partial document.

Completed snapshots omit raw source, creative instructions and the supplied
media index. Scene variables may contain approved media URLs when replay needs
them; avoid signed URLs shorter-lived than the replay window. The checksum on
`response.complete` is a deterministic drift detector, not a signature or an
authorization control.

Saved replay makes no model or generation requests. It can still fetch audio,
images, video and fonts.

## Ownership

Adding storage means owning the database, object storage, authorization,
encryption, deletion schedule, backups, quotas and media URL expiry. Persist a
final document atomically under its own record ID. Saved replay does not
restore a conversation or a speech queue.
