# Minimal host example

Two files show the complete integration surface:

- `App.tsx` mounts `PromptOutput` with a host-owned prompt field and screenshot
  assets, and drives it through the ref (`generate`, `cancel`).
- `server.ts` builds the endpoint with `createBriefingHandler`, supplying host
  authentication, allowed origins and Anthropic-backed `prepareText`,
  `generateText` and `streamText` callbacks. Speech, stock footage and generated
  video are optional callbacks described in [the SDK guide](../../docs/SDK.md).

The files type-check against the SDK source with `npm run check:examples`; they
are documentation, not a runnable application. To run them, install the packed
tarball in a React 19 app, serve `sdk-dist/audio-library` at `/audio-library`,
and mount `handleBriefingRequest` at `/api/briefings`.
