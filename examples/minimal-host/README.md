# Minimal host example

Two files show the complete integration surface:

- `App.tsx` mounts `PromptOutput` with a host-owned prompt field and screenshot
  assets, and drives it through the ref (`generate`, `cancel`).
- `server.ts` builds the endpoint with `createBriefingHandler`, supplying host
  authentication, allowed origins, OpenAI Responses callbacks for text and
  planning, and OpenAI speech with separate podcast voices. The example uses
  `gpt-6-luna` and `gpt-4o-mini-tts`; narrator/host use `marin`, analyst uses
  `cedar`. Caption timing uses the SDK's estimated fallback.

Set `OPENAI_API_KEY` and `BRIEFINGS_HOST_TOKEN` only on the server. Replace the
example origin and authorization check for your host. Enforce your own quotas
and spending reservations before paid calls: the SDK validates requests and
output, but does not maintain a billing ledger. Responses use `store: false`;
provider errors stay private and interrupted/oversized responses are rejected.

Stock footage and generated video remain optional callbacks described in
[the SDK guide](../../docs/SDK.md). Supply a fal video adapter to enable
video generation; this minimal example uses templates without paid video calls.

The files type-check against the SDK source with `npm run check:examples`; they
are documentation, not a runnable application. To run them, install the packed
tarball in a React 19 app, serve `sdk-dist/audio-library` at `/audio-library`,
and mount `handleBriefingRequest` at `/api/briefings`.
