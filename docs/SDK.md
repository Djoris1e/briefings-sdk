# Briefings SDK integration guide

The SDK converts supplied material into a readable summary, host-and-analyst
podcast, and streaming video. Video plans directly from that source; text and
podcast share a separately prepared structured briefing. It is
an output component. Source collection, personalization, tenant access,
persistence and export belong outside this slice.

## Package and entrypoints

From the repository, build and pack locally:

```bash
npm ci
npm run build:sdk
npm pack
```

The package is named `@djoris/briefings`, version `0.1.0`, with `private: true`.
The tarball is `djoris-briefings-0.1.0.tgz`. Install that file in the consuming
application; do not run `npm publish`. React and React DOM 19 are peer
dependencies. The repository requires Node 22.12 or newer.

| Import | Exports |
| --- | --- |
| `@djoris/briefings` | Canonical types, `defineBriefingConfig`, default configuration |
| `@djoris/briefings/react` | `PromptOutput`, its props/ref types, `usePromptOutput`, canonical types |
| `@djoris/briefings/server` | `createBriefingHandler`, `prepareBriefing`, `validatePreparedBriefing`, `validateScreenshotAssets`, `toVideoPrompt`, configuration and existing video server exports |
| `@djoris/briefings/styles.css` | Component/player CSS |
| `@djoris/briefings/audio-library/*` | Packaged music files |

`sdk-dist` contains ESM bundles, lazy template chunks, source maps, declarations,
CSS and the music directory. Copy the whole built package; the main JavaScript
file alone is insufficient.

## React integration

This complete component uses a host-owned prompt field and the SDK ref. Replace
the sample text and screenshot metadata with supplied source material; neither
is fetched or discovered by the SDK.

```tsx
import { useRef, useState } from "react";
import {
  PromptOutput,
  type PromptOutputHandle,
} from "@djoris/briefings/react";
import type { ScreenshotAsset } from "@djoris/briefings";
import "@djoris/briefings/styles.css";

export function BriefingPanel({ assets = [] }: { assets?: ScreenshotAsset[] }) {
  const output = useRef<PromptOutputHandle>(null);
  const [prompt, setPrompt] = useState("");

  return (
    <section>
      <label>
        Source material and audience context
        <textarea value={prompt} maxLength={12000}
          onChange={event => setPrompt(event.target.value)} />
      </label>
      <button disabled={!prompt.trim()} onClick={() => {
        void output.current?.generate(prompt, "video", { screenshots: assets });
      }}>Create briefing</button>
      <button onClick={() => output.current?.cancel()}>Cancel</button>
      <PromptOutput
        ref={output}
        endpoint="/api/video-chat"
        showComposer={false}
        defaultFormat="video"
        theme={{ scheme: "dark", accent: "#f47c41", density: "compact" }}
      />
    </section>
  );
}
```

`generate(prompt, format, options?)` accepts `"video"`, `"podcast"` or `"text"`.
The chosen format selects the visible tab; submission prepares the shared
briefing and video/podcast work. It is not a request to spend only on that one
format. `screenshots` can also be supplied as a component prop; the third
argument overrides that prop for the current generation.

With `showComposer={true}`, the component owns the prompt/follow-up UI. Other
props are `initialPrompt`, `examples`, `className`, `publisher`, `exampleNote`, and `theme`.
`publisher` is the customer-facing label (default `Product updates`); the local
Microsoft demo uses `Microsoft updates`. Clicking an example starts generation
immediately with its source images; the prompt field is for custom input.
`exampleNote` labels the source dates and sample context on the starting screen. Theme tokens are
`scheme`, `accent`, `surface`, `text`, `muted`, `border`, `fontFamily`, `radius`
and `density`. The default endpoint is `/api/video-chat`.

Podcast playback starts only after Play. Moving between tabs pauses the previous
format and reuses the prepared briefing. Cancellation stops active preparation
and playback. Follow-ups retain original supplied context and bounded recent
conversation; source text and the newest question are not silently truncated to
make room.

Recoverable provider warnings remain in the video session state and are not
shown as technical messages in the player. If narration fails, a discreet
`Retry narration` control replays the completed video and retries failed speech,
retaining successful audio. Speech automatically retries short admission-limit
rejections up to twice; provider failures and longer rate-limit waits require
an explicit retry. Request and spending limits still apply.

## Portable server integration

The package does not ship provider credentials or automatically wire the local
Cloudflare adapters into another application. Mount a Fetch-compatible
`Request → Promise<Response>` handler. The following complete factory accepts
real host adapters through the SDK's own types, so adapter inputs and results
are checked without duplicating the protocol.

```ts
import {
  createBriefingHandler,
  type BriefingHandlerOptions,
} from "@djoris/briefings/server";

type HostProviders = Pick<BriefingHandlerOptions,
  "prepareText" | "streamText" | "generateText" |
  "generateSpeech" | "searchMedia" | "generateVideo"
>;

type HostAdmission = {
  authorize: Exclude<BriefingHandlerOptions["authorize"], "none">;
  allowedOrigins: string[];
};

export function createHostBriefingEndpoint(
  providers: HostProviders,
  admission: HostAdmission,
): (request: Request) => Promise<Response> {
  return createBriefingHandler({
    ...providers,
    authorize: admission.authorize,
    allowedOrigins: admission.allowedOrigins,
    hybrid: true,
    mediaLed: true,
    maxBodyBytes: 65536,
    maxGeneratedVideos: 3,
    generatedClipDurationSec: 8,
    firstGeneratedClipDurationSec: 5,
    generateVideoTimeoutMs: 45000,
    mediaConcurrency: 5,
  });
}
```

Instantiate this factory with host-owned functions, mount the returned handler
at the component's endpoint, and return its `Response` unchanged. In particular,
do not buffer the streaming video response into a JSON object.

The provider functions must perform real generation/search, honor the supplied
`AbortSignal`, and enforce host spending policy before paid work:

| Callback | Required behavior |
| --- | --- |
| `prepareText` | Return one complete JSON string for the supplied canonical-briefing instructions; receives `task: "briefing"`, prompts, `outputSchema`, token bound and signal |
| `streamText` | Return text deltas as an async iterable, or a supported AI SDK-shaped stream result, following the supplied video-planning instructions |
| `generateText` | Return a string for narration, narration rewrite or suggestions, following the supplied task/prompts/token bound |
| `generateSpeech` | Optional: return `{audio: Uint8Array \| ArrayBuffer, mediaType?, wordTimings?}` for `text`, optional `speaker: "host" \| "analyst"`, and signal |
| `searchMedia` | Optional: return a supported media object or `null` from the query and scene context |
| `generateVideo` | Optional: return a supported media object or `null`, honoring the requested duration, scene reference asset, signal and absolute `deadlineAt` |

For video media, use `{type: "video", url, durationSec, posterUrl?}`. Images use
`{type: "image", url}`. Speech word timings are `{text, start, end}` with seconds
on that audio's clock, one entry per written whitespace-delimited word. Do not
return estimated timings as provider alignment. When `speaker` is absent, use
the narrator voice; map host and analyst to two distinct server-owned voices.

`authorize` must be explicitly supplied; `authorize: "none"` is only an explicit
host opt-out, not a production default. Write actions must declare
`content-type: application/json`, and a request carrying an `Origin` header is
rejected unless it matches the handler's own origin or an entry in
`allowedOrigins`. Hosts behind a proxy that rewrites the request URL must set
`allowedOrigins`; otherwise same-site browser requests are refused. Authentication alone is not quota
admission. The host must enforce actor identity, concurrency, request limits and
provider spending caps, and release its reservations on completion,
cancellation and failure. The portable wrapper does not provide a billing
ledger. Keep provider callbacks behind that admission boundary.

For an existing server, `prepareBriefing({prompt, screenshots}, {generateText,
signal})` can be used directly without HTTP or Cloudflare. It returns the same
validated `PreparedBriefing`. `toVideoPrompt(briefing)` derives factual video
input; pass `briefing.screenshots` separately with the video response request.
The helper does not embed image URLs into model-authored content.

## Reference provider configuration

The repository's local application uses `functions/api/video-chat.mjs`, a
Cloudflare reference adapter with origin checks, quota admission, cancellation
and provider-specific limits. `npm run dev` supplies the local quota database
and salt. This reference adapter is not bundled into the generic server entrypoint.

Edit root `briefing.config.ts` for the reference application:

```ts
import { defineBriefingConfig } from "./src/briefing/config";

export default defineBriefingConfig({
  planner: { model: "gpt-6-luna", reasoningEffort: "none" },
  speech: { model: "gpt-4o-mini-tts", narrator: "marin", host: "marin", analyst: "cedar", language: "auto" },
  video: {
    model: "minimax/h3-max-turbo/text-to-video",
    screenshotModel: "minimax/h3-max-turbo/image-to-video",
    animateScreenshots: false,
  },
});
```

These are the currently implemented adapter schemas, not arbitrary interchangeable
provider endpoints. A different provider or video request schema needs a custom
SDK adapter. In another host, `defineBriefingConfig` is a typed configuration
helper; the host must actually connect that configuration to its callbacks.
Creating a config object alone does not configure `createBriefingHandler`.

Copy `.dev.vars.example` to ignored `.dev.vars` and set server-only credentials:

| Key | Reference adapter use |
| --- | --- |
| `OPENAI_API_KEY` | Canonical briefing, video planning, narrator and two podcast voices |
| `PEXELS_API_KEY` | Optional stock footage within mixed videos |
| `FAL_KEY` | Optional generated video and explicitly enabled screenshot animation |

Do not put secrets in `briefing.config.ts`, browser bundles or `VITE_` variables.
The reference adapter also accepts trusted server `BRIEFING_CONFIG` overrides
and specific environment overrides for planner model, reasoning effort, speech model, voices, language and
screenshot animation. `BRIEFING_REASONING_EFFORT=omit` omits the reasoning
parameter for models without it; otherwise choose an effort supported by the
configured model. Token ceilings include reasoning tokens, so reasoning-enabled
models need adequate headroom. The speech adapter supports `gpt-4o-mini-tts`
and its dated snapshots. Request bodies cannot choose provider credentials, models
or arbitrary voice IDs.

## Canonical content and limits

One admitted `action=briefing` request accepts `{prompt, screenshots?}` and returns
`PreparedBriefing`:

- `version`, `id`, and the supplied `prompt`.
- `summary`: readable plain text.
- `article`: optional `{title, dek, sections:[{heading, paragraphs}]}` for the
  text reader. New briefings request 400–650 words when the supplied material
  supports that depth; older records fall back to the summary. The article is
  prepared in the same request and does not lengthen the video prompt.
- `facts`: `{id, text, evidence}`; each evidence string must occur exactly in the
  supplied prompt.
- `priorities`: supporting `factIds`, relevance and a suggested action.
- `podcast.turns`: `{id, speaker, text, factIds}`, alternating host and analyst.
- `screenshots`: validated host assets, never model-invented URLs.

The model selects server-numbered source IDs instead of copying quotations. The
server restores the exact source text as evidence and expands host/analyst
exchanges into alternating turns. Provider adapters must enforce `outputSchema`
when supported; the OpenAI adapter sends it as `text.format` with `strict: true`
([provider documentation](https://developers.openai.com/api/docs/guides/structured-outputs)).
The authored shape is `{summary, article, facts:[{id,text,sourceId}], priorities,
podcast:{exchanges:{opening,detail,closing}}}`; the public return shape above
preserves compatibility with records without an article. Each podcast slot contains
`{host,analyst,factIds}`; opening is required and later slots may be null. Fixed slots
enforce 1–3 exchanges in the provider grammar; older bounded-array adapters remain
accepted. Output that fails this contract is re-authored once by default inside the same
deadline, with only the validator's classification fed back to the model
(`retries` option, 0–2; each attempt is a paid provider call). Timeouts,
cancellation and provider failures are never retried server-side. The
component bounds its own briefing request at 130 seconds and offers a manual
"Retry text and podcast" that never regenerates the video. Exact quotation validation establishes provenance; it is not a proof that every
paraphrase logically follows from that quotation. Review fixtures for factual
fidelity, preserved qualifications, release status and sensible recommendations.
Missing source material should produce an explicit request for that material,
not fabricated release news.

The text view uses a bounded, keyboard-scrollable article with reading time and
scroll progress, keeping the follow-up field nearby. Light mode uses a white
reading surface and softly bordered inputs without drop shadows; host theme
tokens remain available.

The prompt limit is 12,000 JavaScript string characters; the default HTTP JSON
limit is 65,536 bytes. Briefing preparation is bounded to 90 seconds by default (server-owned `planner.briefingTimeoutMs`, maximum 120 seconds; portable handler option `briefingTimeoutMs`) and requests
up to 6,144 output tokens. Authoring requests at most 6 facts, 3 priorities and
3 exchanges (6 podcast turns). The public validator supports up to 12 facts,
6 priorities and 16 turns for host-prepared records. Each turn is at most 700 characters and the conversation at most
5,000 characters; the writing target is usually 160–220 spoken words, not an
exact audio duration. Text summary length is at most 1,800 characters.

Video remains approximately one minute: useful templates first, bounded optional
media work, and at most three generated attempts under the example configuration.
It streams scenes for browser playback, not an exported MP4. Video planning and text/podcast briefing preparation start in parallel. A failed
briefing request cannot stop the video. Startup latency and perceived quality
must be measured with real authorized runs rather than assumed from the opening
placeholder or mocked tests.

## Screenshots and animation

Supply at most four objects:

```ts
const screenshots = [{
  id: "release-settings",
  url: "https://cdn.your-company.com/briefings/settings.png",
  alt: "Supplied settings screen showing the release toggle",
  sourceUrl: "https://your-company.com/release-notes",
  animate: false,
}];

// The same asset list may be passed as the screenshots component prop.
void output.current?.generate(sourceText, "video", { screenshots });
```

IDs are unique simple identifiers of at most 64 characters. URLs are public
HTTPS, at most 2,048 characters, with no credentials, custom port, literal IP or
local/private hostname. `sourceUrl`, when present, follows the same checks.
`alt` is required and at most 300 characters. The validator checks URL syntax
and disallowed hosts; it does not fetch URLs or verify DNS/content ownership.
The host must make the assets browser-accessible and supply an accurate description.

Static screenshot presentation is the default. AI animation needs both the
asset's `animate: true` and the trusted reference configuration's
`video.animateScreenshots: true`. The generated adapter uses the supplied image;
it must not invent an image URL from the prompt. Animation is illustrative and
cannot certify product behavior or guarantee that every interface detail is
preserved. Static fallback should remain available when optional generation is
unavailable, disallowed or late. Custom hosts must apply the equivalent trusted
animation gate in their own video adapter.

## Music, captions and hosting

Mount the package's `sdk-dist/audio-library` at the browser's `/audio-library`.
For a host that serves its `public` directory at the origin root:

```bash
mkdir -p public
cp -R node_modules/@djoris/briefings/sdk-dist/audio-library public/
```

Keep the included provenance/license notes with the assets. The music catalog
uses root-relative URLs, so placing files under a different URL prefix alone
will not work. Allow those assets and your supplied/generated media in the host's
content policy. Import the SDK CSS once and let the host bundler serve its lazy
JavaScript chunks.

Captions follow provider word timings and the actual speech audio clock when
available, with a less precise fallback when alignment is absent. The reference
OpenAI speech adapter returns MP3 audio without word timestamps, so its captions
use that estimated fallback. The podcast
plays bounded turns in order using two configured voices. Do not represent
browser autoplay permission as guaranteed: podcast Play remains an explicit
user action.

## Verification and scope

Use `npm run check:quick`, focused format/engine tests and `npm run build:sdk`.
Before integrating, install the tarball into a clean React host, mount its actual
endpoint and music assets, and verify canonical preparation, tab reuse,
two-speaker playback, cancellation and screenshot transport. Test admission,
provider failure and slow-media fallback using recorded doubles before any
explicitly budgeted live check.

This slice provides no source ingestion, personalization engine, Microsoft Graph
or tenant integration, saved sessions, media export, production deployment or
native Copilot integration. A host can supply relevant person/context facts;
the component does not discover or authenticate them. Building and packing the
SDK does not publish it.

## Validation

The October 6 local build passed ESLint, TypeScript, the demo/server/SDK builds,
a separate packed-package consumer import/type check, and focused briefing,
voice, provider, cancellation and quota regressions. Browser checks covered
contextual follow-ups, immediate loading, sequential two-speaker audio, video
playback at 390/1280 pixels, and eight new template/layout cases. Tests use
recorded audio/video and provider doubles; they do not call paid APIs.

Actual first-content latency, model factual fidelity, conversational quality and
AI screenshot-animation fidelity still need a budgeted live review. The opening
scene appears immediately and video starts planning without waiting for the
text/podcast preparation. This is not a measured promise of useful playback
within seconds.

## Responsive hosts

The component observes its own container width. At 600 pixels or narrower it
uses portrait scenes; wider embeds use landscape. Resizing an existing video
updates its templates without another generation request. Controls have 44-pixel
touch targets. Full-embed recorded-media checks cover 320, 360 and 390-pixel
phones and short landscape layouts; physical iOS audio behavior still needs
device verification.

Provider `video.timeoutMs` defaults to 45 seconds (maximum 60). Actual AI
requests are capped further by the scene’s playback deadline and abort signal.
A timed-out submission is never automatically submitted again. Optional
priority display text that violates its bounds is omitted as a whole; factual
source references and the reading/podcast content remain strictly validated.

## Films with media throughout

The demo host enables `createVideoChatHandler({ hybrid: true, mediaLed: true, … })`.
This keeps validated figures, comparisons and action overlays while attaching
full-frame stock footage or an original screenshot. AI footage is reserved for
later scenes so generation can run ahead of playback. Source images keep their
original aspect ratio and have source labels; generated and stock visuals are
illustrations. Text-only treatment is a fallback when suitable media is
unavailable. The opening chapter is visible immediately while the first useful
scene is prepared. The demo selects `gpt-6-luna` with reasoning disabled in `briefing.config.ts`
for quick incremental planning; hosts can change the model and reasoning effort.
Live output quality and latency must be assessed separately from fixture tests.

## Editorial template system

Open `/templates` in the local demo for all ten production renderers, sample
variables, selection rules and desktop/phone previews. Play collection uses
existing stock and generated footage; it makes no model requests.

The shared type scale is based on the shorter scene dimension: headline 10%,
body 4.6%, label 3.8%, figure 24%. Accepted long copy is paged without shrinking
or deleting characters. Keep authored display copy concise; pagination is a
readability safeguard. Entrances use a short fixed duration and stable holds.
Comparisons, timelines and actions present one active item at a time. These
reveals follow scene progress, while live phrase subtitles follow speech.
Subtitles start off. The subtle CC control in the video composer toggles them;
the choice remains in effect across follow-ups and modality switches for the
mounted component.

Source screenshot scenes contain the original image for context and use only a
supplied focus rectangle for a detail move. Optional generated illustration is
shown separately. The bottom 18% remains reserved for captions.

The media-led planner can select clean footage. A third identical consecutive
generic title/explanation may become clean footage when its copy is already in
narration and carries no protected numeric or quoted facts. Specialized layouts
and source imagery are preserved. Missing media keeps the authored content
available. Existing provider deadlines and three-clip AI cap still apply.

## Podcast player

The podcast has its own transport above the follow-up composer: elapsed time,
seek, ten-second skips, speed and transcript. Audio still prepares two turns
initially, then one turn ahead. Only the contiguous measured audio is seekable;
the remaining duration is labelled as an estimate until prepared. Seeking
reuses cached speech and does not trigger a new briefing.

`usePromptOutput` exposes `currentTime`, `duration`, `durationEstimated`,
`seekableDuration`, `seek(seconds)`, `playbackRate`, `setPlaybackRate(rate)` and
`getAudioLevel()`. Times remain source-audio seconds at every playback speed.
The waveform samples actual post-gain audio through an opt-in analyser and
returns to zero on pause. If analysis is unavailable, audio still plays and
the meter stays flat. Native audio preserves pitch; the iOS buffered fallback
changes pitch with playback speed. Switching output format pauses the podcast.

## Customer communication concept

The host supplies release notes plus customer goals, product adoption and interests.
The output explains selected product changes directly to the customer: what changed,
why it matters to their supplied context, and a useful next step. Video, podcast and
text share this editorial direction; the article provides more depth. Missing usage
or eligibility data stays unknown. This does not add tenant access or a personalization
engine, and a newly published update is not evidence the customer missed it.

The video corner control opens the composed scene and playback controls in fullscreen.
Escape or the exit control returns to the embed without restarting generation.
For iframe hosts, allow native fullscreen with `allow="fullscreen"` / `allowFullScreen`.
When native fullscreen is unavailable, the view expands within the available host
viewport; it cannot escape an iframe’s boundaries.
