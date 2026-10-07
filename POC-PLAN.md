# Microsoft release briefings: video, conversation and text

Plan and implementation status updated 7 October 2026.

## Implementation status

Implemented locally: shared validated briefing with source excerpts, independent text summary and two-speaker dialogue, sequential podcast playback with bounded preparation, four new mixed-media templates, host-supplied screenshot IDs and optional fal animation, full narration across clip endings, timed captions, and music with speech ducking. Provider settings live in `briefing.config.ts`; React and server entrypoints package as `@djoris/briefings`. See `docs/SDK.md` for handover.

Validation uses provider doubles and recorded media, not paid generation. Live model quality, actual time-to-first-content, voice continuity and screenshot animation fidelity remain unmeasured. The quality targets below remain acceptance targets, not achieved guarantees. Immediate loading is implemented. Video now plans directly from the supplied source in parallel with text/podcast preparation: a timed-out structured briefing no longer blocks video startup. All formats share the supplied source, but the video does not wait for the structured record.

## Product outcome

Turn a supplied personalized brief into a useful video, a natural two-person
podcast and an article. Microsoft is the customer-facing publisher in the demo;
this project provides the underlying component. Each explains what changed, why it matters to
this person, what remains uncertain and what to do next. They share facts and
priorities, but use different scripts suited to watching, listening and reading.

Keep the current local component and cloud providers. The host supplies
customer goals, product adoption, interests and release material. Building collection, Microsoft Graph access,
a recommendation engine or a full app is outside this plan. No save/export.
The component keeps a light/dark switch, output above the prompt composer,
inline playback controls and modality buttons below. Follow-ups retain context.

## Baseline before this implementation

- Template-first streaming video, Pexels and AI footage selected per scene.
- First two content scenes use templates; at most three generated clips.
- Titles, key figures, comparisons, quotes and editorial timelines.
- Original loading chapter, narration, captions, pause/resume and cancellation.
- Validated speech-provider timestamps and captions driven by actual audio time.
- Music selection, looping, crossfades and ending fades in the engine. The POC
  currently explicitly sets music off; speech-driven ducking is not implemented.
- Text and single-voice podcast prepare together while video generates.
- Contextual follow-ups, source-labelled example prompts, bounded provider usage.

The main gaps: video and text independently interpret the raw prompt; podcast
is a monologue; templates cannot currently contain footage; optional short clips
can cause narration shortening; music is disabled in the component.

## 1. One factual brief, three presentations

Introduce a bounded, versioned `Briefing` record before producing the formats:

- Audience: supplied role, goals, constraints and desired decision.
- Releases: product, exact change, announcement date, availability status,
  eligibility/limitations, supplied source reference and supporting excerpt.
- Claims: stable IDs linked to those release records; distinguish source fact,
  supplied audience context, inferred relevance and recommended action.
- Editorial outline: two or three priorities, why each matters, one important
  qualification and the next action. Include an explicit as-of date.

For structured host input, validate directly. For free text, extract this compact
record once. Check structure and source support before releasing each claim to
format generation; schema validation alone does not establish factual accuracy.
Unsupported claims are omitted or identified as unknown, never filled in.

A preview is not general availability. An announcement is not confirmation that
this person's tenant has access. A target is not an achieved benefit. Keep the
fictional profiles in the examples explicitly fictional. Use verified recent
Microsoft release notes with their original dates and rollout qualifications;
never imply a note establishes availability in the customer’s tenant.

Every video scene, podcast turn and text recommendation references supporting
claim IDs internally. Source links remain available in a compact disclosure.
Do not expose implementation IDs in the experience.

Generate a shared editorial outline, then branch into three scripts. Do not wait
for the entire podcast before starting video. Once the initial claims and opening
beats are validated, prepare their speech while the rest of the plan develops.
Follow-ups reuse this factual record; previous AI answers are conversational
context, not new evidence. Changing supplied source material creates a new version.

## 2. Video direction

Default to roughly 60–90 seconds and 6–10 purposeful scenes; preserve the current
120-second ceiling. Let content and measured speech set the length. Do not stretch
thin material or accelerate speech to hit an exact duration.

A strong opening tells the viewer the most relevant change and its connection to
their goal. Avoid a generic introduction about the importance of AI.

Illustrative sequence, using only release facts actually supplied at runtime:

| Beat | Purpose | Visual treatment |
| --- | --- | --- |
| 1 | Most relevant change | Immediate title/feature template |
| 2 | Why it matters to this person's goal | Comparison or relevance template |
| 3 | Show the capability | Supplied genuine screenshot with callout; otherwise text |
| 4 | Illustrate the work involved | Pexels footage beside a short factual message |
| 5 | Explain a less tangible idea | Brief AI visual, explicitly illustrative |
| 6 | Preserve availability or licensing qualification | Clear template |
| 7 | Give the next action | Action sequence and closing takeaway |

The demo should exercise templates, Pexels and AI together. Normal briefings need
not force an irrelevant stock clip or an AI metaphor just to fill a quota.

### Visual vocabulary

Polish the five existing templates before growing a large catalog. Add four
reusable compositions in this order:

1. **Text + media:** readable text beside either Pexels or AI footage. Make this
   the foundational mixed layout, with both left/right and stacked narrow forms.
2. **Personal relevance:** change → connection to a supplied goal → next action.
3. **Feature spotlight:** an approved/supplied product screenshot with a precise
   highlight and short caption. Never synthesize a purported real Microsoft UI.
4. **Action steps:** two or three ordered actions, reusing timeline motion and
   typography where practical instead of duplicating an existing template.

Carry over the original SDK's restrained typography and purposeful animation.
Use consistent margins, pacing and transitions; reserve a subtitle safe area.
Long names, dates and qualifiers must fit at inline and side-panel sizes.
Motion reveals meaning rather than making every word move.

### Media selection and deadlines

Pexels is for observable real-world activity. AI footage is for concepts or a
specific visual that stock cannot reasonably illustrate. Templates and actual
screenshots communicate exact product details. Neither stock nor AI footage is
proof of a product capability, real customer, event or measured outcome.

Allow a media slot to accept either provider while keeping the text composition
identical. Permit full-screen footage where it genuinely helps. Do not put dense
text over a busy image; prefer split layouts, controlled crops and a contrast wash.

Keep the current first-two-template rule and three-AI-clip cap. Resolve optional
assets concurrently within existing provider limits. Keep current bounded stock
and AI deadlines, then tune them against measured narration and playback timing.
If an asset is late, wrong or unavailable, render the same factual beat as a
complete template. Never change a scene that is already being watched.

Speech determines scene duration. If a five-second clip is too short, transition
into the supporting template while narration finishes. Never remove an important
qualification merely to fit a clip. Freeze the approved narration before speech,
subtitles and final scene timing are prepared.

## 3. Narration, subtitles and music

Use one consistent narrator for video, with a pronunciation map for Microsoft
product names and abbreviations. Keep delivery clear and natural; narration
explains the visual rather than reading every title aloud.

Retain the existing validated audio alignment. Build readable phrase captions
from those same spoken words, with accurate optional word emphasis. Check product
names, numbers, punctuation and pause/resume. If timing metadata is absent, show
phrase captions without pretending estimated word highlights are exact.

Enable a small approved instrumental music palette: calm, focused and optimistic.
Start with one bed per briefing. Add a smooth speech-driven gain envelope to the
existing soundtrack owner: lower music during speech, gently recover in pauses,
and fade at the ending. Respect mute and volume across every layer; avoid gain
pumping between words. Music or ambient-track failure must never stop narration.

Normalize voice loudness across clips and speakers, keep headroom, and check the
actual mix on headphones and laptop speakers. Use approved existing tracks first;
generating new music is not required for the initial implementation.

## 4. A real two-person podcast

Target roughly two minutes, flexing to the amount of useful material. Start with
8–14 turns, generally 250–350 words total. A short follow-up gets a short exchange.

- **Host:** represents the listener's practical questions and priorities.
- **Analyst:** explains the change, its relevance, limitations and a useful action.

Both contribute. Use a question, explanation, challenge or qualification, then a
concrete next step. Avoid repetitive agreement, lengthy greetings, fake surprise,
forced jokes, invented experience and two people taking turns reading paragraphs.
Write the conversation as a whole so each turn responds to the previous one.

Return structured `{speaker, text, claimIds}` turns, with two stable speaker IDs.
Keep delivery cues separate from spoken text. Use distinct, server-allowlisted
synthetic voices and disclose that the hosts are AI voices. Do not impersonate
Microsoft employees or imply endorsement.

Start with the existing xAI speech provider, selecting a different allowed voice
for each speaker. Audition the pair before choosing it. Prepare the first two
turns, then maintain a bounded two-turn lookahead. Play turns in order with
intentional short pauses and no accidental overlap. One audio timeline owns
pause/resume and speaker transitions; switching modality pauses the current audio.

Update speech validation and cache keys to include speaker/voice, text, language
and relevant delivery settings. Keep keys server-side, preserve per-turn limits,
quota admission and cancellation. Text becomes a concise readable summary of the
shared brief; the podcast transcript stays available as a separate transcript.
The current single-string text/podcast cache must evolve accordingly.

If listening tests show separately synthesized turns sound disconnected, compare
one short sample using ElevenLabs' dialogue endpoint. Adopt it only if the audible
improvement justifies another provider; it is not an initial dependency.

Use a short restrained music introduction and closing. Keep conversation clear;
continuous music is optional and should be quieter than the video bed.

## 5. Responsive preparation and embedding

Immediately show the existing loading scene when the user submits. Start all
three format branches automatically from the shared brief. Prioritize the first
useful video scene and opening podcast turns over far-future assets. Podcast waits
for the user's Play gesture; format switching should not generate a second copy.

Keep independent readiness/error states for each format. A podcast failure must
not erase readable text or stop video. Cancelling or replacing the brief aborts
all related work. Preserve in-memory reuse without introducing saved sessions.

Planning targets, not measured promises:

- Loading scene appears within one second of submit.
- First useful spoken video scene: median within five seconds, 95th percentile
  within ten seconds on an agreed test connection and provider configuration.
- Podcast's first exchange: ready within ten seconds under the same conditions.
- Once started, no avoidable stalls, cut-off sentences or overlapping modalities.

Measure these against the current build first. If the shared fact pass makes
startup too slow, accept structured facts from the host or stream validated beats;
do not trade away source accuracy to meet the target.

Keep Microsoft integration as a separate host adapter. Test resize, media policy,
network restrictions and authentication in an actual target host before promising
native Copilot/Teams support. This plan builds the conversion surface locally.

## 6. Delivery order and acceptance

Each slice stays reviewable in localhost. No full release suite on every visual
iteration; use focused checks and recorded media. Live provider auditions need a
separately agreed budget. This plan does not authorize paid evaluation calls.

| Slice | Deliverable | Acceptance |
| --- | --- | --- |
| 1 | Shared factual brief and outline | All three outputs preserve the same facts, priorities and qualifications; examples retain source dates and fictional-profile labels |
| 2 | Two-host script and playback | Two stable voices, coherent exchange, smooth turn boundaries, correct pause/resume and no duplicate synthesis on switching |
| 3 | Mixed text/media layout and narration-led duration | One briefing contains useful templates, Pexels and AI; a missing clip preserves its complete message |
| 4 | Relevance, feature and action compositions | No clipping at narrow/wide sizes; screenshots are genuine supplied assets; template selection matches meaning |
| 5 | Music mix and subtitle polish | Speech stays clear; captions follow exact audio; mute, pauses and ending fades behave consistently |
| 6 | Demo calibration | Representative briefs pass factual, visual, audio and startup review with measured latency and provider usage |

Use a compact review set: the three existing fictional Microsoft profiles, a
sparse-source brief, a long/narrow-layout brief and an unavailable/slow-media case.
Exercise preview-versus-GA distinctions, unsupported benefit claims, dates,
pronunciation, cross-format follow-ups and cancellation.

Score relevance, factual support, narrative clarity, visual usefulness, audio
naturalness and playback reliability. Require at least 4/5 in each after human
review, with no factual contradictions, clipped speech, unreadable text or invented
product UI. Record cost per completed briefing before setting a demo spend budget.

## Code areas

- Shared briefing validation and orchestration: new bounded server module plus
  `functions/api/video-chat.mjs`; keep provider adapters separate.
- Scene planning and media: `src/server/chat-shot-planner.ts`,
  `src/server/create-video-chat-handler.ts`, `src/server/video-chat-prompts.ts`.
- Templates: existing catalog and `src/visual-system/scene-templates/`.
- Voice roles and alignment: `functions/_video-chat/speech.mjs`,
  `src/video-chat/voice.ts`, speech protocol validation and audio caches.
- Podcast turns/readiness: `app/use-prompt-output.ts` and
  `app/embed/PromptOutput.tsx`.
- Music ducking: `src/player/soundtrack.tsx`, preserving one gain owner.

## Provider references

Checked 6 October 2026. xAI documents selectable voices and timestamped TTS;
timestamps add a post-synthesis alignment pass. Keep that startup tradeoff visible
in measurements. [xAI text-to-speech documentation](https://docs.x.ai/developers/model-capabilities/audio/text-to-speech).

ElevenLabs documents a streaming dialogue endpoint accepting text/voice pairs;
it is a candidate for a later listening comparison, not a dependency committed
by this plan. [ElevenLabs streaming dialogue](https://elevenlabs.io/docs/api-reference/text-to-dialogue/stream).
