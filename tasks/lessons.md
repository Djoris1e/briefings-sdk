
- Default chat silently recovers from optional provider or scene failures. Keep non-fatal diagnostics for application developers; show a fatal error only when no playable response can be produced.

- Generated clip audio means environmental and action sounds only. Keep every
  voice and all music out of the generated footage; narration and the selected
  soundtrack are independent layers with their own listening controls.

- Keep iteration checks focused on the observed failure. A poster, ready scene,
  or completed narration does not prove visible moving footage. Observe video
  visibility, advancing media time and presented frames separately; retain
  hidden-video lifecycle evidence when diagnosing readiness. Use the full
  compatibility suite as a release gate, and a few complete live answers to
  judge relevance, pacing and endings. Do not repeat broad suites without a
  changed candidate or a specific unresolved question.

- Watched source changes and HEAD changes invalidate an ongoing playback trace;
  keep the candidate unchanged until browser verification finishes.

- Cached media may load while a Suspense tree is detached. First-frame observation
  must start when the element mounts; a loadeddata handler alone cannot establish
  whether later waiting is initial decoding or a genuine playback stall. Validate
  with actual presented frames, then a frozen decoder and the unchanged recovery bound.

- When a runtime DOM contract changes, audit verification scripts as well as
  tests: application playback assertions also live under scripts/.
  Replace obsolete architecture assertions with the intended behavior and retain
  real-frame, identity, lifecycle and bounded-resource coverage.

- Welcome and follow-up suggestions share one card treatment. Fix label length or shared responsive sizing instead of introducing a separate oversized ending layout. Show preparation feedback only after the opening voice has finished and the requested quiet interval has elapsed; never extend playback waiting to display it.

- Generalize planner guidance from reported examples. Keep topic-specific cases in evaluation fixtures rather than adding the latest failing user prompt to production system instructions.

- Prompt compression and earlier ending reservation must preserve answer depth.
  Keep distinct development explicit, treat the saved ending as a playback
  reservation, and compare substantive requests with deliberately brief ones.
  Passing stream-order tests alone cannot establish the model's answer quality.

- Restore answer depth without casually relaxing narration-fit headroom. A
  proposal to measure voice before submitting footage adds a serial dependency
  to first-scene latency; preserve parallel preparation when that delay is
  unacceptable. Word budgets reduce overruns but do not certify measured fit.

- Measure original and accepted narration separately in live fit evaluations.
  Rewrites can hide poor first drafts, while conservative estimates can request
  repairs for audio that already fits. Report unavailable measurements and
  factual/coverage failures separately from the timing success rate.

- Requests for less caption text may mean progressive display, not shorter narration. Preserve full speech and transcript; disclose approximate timing when provider word timestamps are absent.

- For visual direction, reuse the existing brief and shot action fields and
  verify the active shot-planner path. Keep intent separate from appearance,
  preserve caller overrides, and check downstream provider prompt-length limits.
  Keep default wording conditional so explicit user aesthetics still work.
  Do not claim mocked media proves generated visual quality.

- A hypothetical question or hidden mechanism does not require a separate
  illustration style. One photographic, cinematic default can explain processes
  through realistic cutaways, transparent layers and simplified geometry in the
  shot action. Preserve explicit aesthetics without adding automatic style state.

- Assess product preference separately from adherence to a proposed style brief.
  The two-style evaluation rewarded drawn 2D germination for matching that brief,
  but the user preferred the baseline's more realistic explanation. Keep that
  correction beside the historical scores, and never use an earlier prompt's
  live results to claim a revised prompt has been validated.

- Product deletion is a complete dependency-graph change: remove its CLI, public surface, generated artifacts, fixtures, docs, and tests together. Keep real consumer and playback boundaries for the remaining product.

- A passing longer-duration fixture cannot establish the shorter production
  contract. Exercise the configured duration through handler, provider callback,
  streamed scene and voice preparation. Keep live text/voice quality evidence
  separate from stubbed generation and recorded-media playback; verify the
  actual reported browser session before attributing failures to authentication.

- A narration repair cannot safely squeeze several independent claims into a
  short clip. Give first-pass writing headroom and one idea per beat, with a
  single new payoff instead of a multi-claim closing recap. Keep repair's full
  safe budget for qualifiers; test live output as well as mocked fit checks.

- A narration clock taking over can initially trail the visual clock. Keep
  ordinary clock adoption monotonic; only an actual audio/playhead reset should
  rewind the decoder. A small automatic seek can stall WebKit even with fully
  fitted prerecorded speech. Inspect retained frames and clock telemetry before
  calling a retrying browser failure a flaky assertion.

- Every user conversation must use real AI planning. Missing keys must produce
  explicit setup guidance, never canned onboarding or demo responses. Configure
  Pexels when generated video is unavailable and browser speech when generated
  voice is unavailable; keep deterministic responses only in automated tests.

- Deployment speed means the complete application change-to-production loop.
  Measure its slowest required checks and release steps; docs-only shortcuts
  are supplementary, not the primary performance goal.

- When replacing npm/npx test entrypoints with direct Node commands, verify a
  real browser startup too. Test listing cannot catch fixture-server commands
  that depended on npm adding local executables to PATH.

- Subtitle styles must stay visually consistent between speech segments. Hold
  the word phrase through timing gaps; never swap in full Classic captions as a
  fallback. Word by word is the default, and the transcript belongs at the end.

- A prepared player mounting is not a new caption playback. Keep the intro's
  completed word phrase across that handoff and loading gap; reset caption
  progress for intentional replay or a new turn, not media preparation.

- Keep the chosen music and scene-sound levels consistent across narration and
  speech pauses. Automatic ducking makes the mix feel uneven; retain music
  fades at answer boundaries without changing levels for speech or buffering.

- An answer brief arriving after the intro must not replace music already
  selected for that answer. Treat that initial selection as the turn's choice;
  reserve track changes for explicit mood or shuffle actions.

- iOS audible-video sessions can interrupt HTML audio even when it feeds a
  Web Audio graph. Mix generated voice and music from buffers in one unlocked
  context. Desktop WebKit with an iPhone viewport cannot prove the physical
  phone's audio-session policy; keep recorded-media evidence and device checks
  distinct.

- Unlock the actual native video elements during the initiating gesture and
  reuse them for delayed audible footage. Native narration's ended event can
  grant a brief Safari media-gesture grace period; buffer completion does not.
  In-page waits must let that gesture expire, since repeated test evaluation
  calls can accidentally keep permission alive and hide the failure.

- Real-media browser fixtures must use the repository's paired MP4/WebM assets
  for the host platform. Check both filenames locally; a passing macOS run
  cannot validate a Linux-only filename or native decoder path.

- Keep product iteration separate from release verification. Apply small
  changes through localhost HMR, run the focused regression and immediately
  tell the owner they can test. Run the full release gates after the behavior
  is settled; CI investigation must not delay the local feedback loop.

- Parallel worktrees share the Mac's memory and decoders. Keep local compiler,
  build and native playback checks serial on a constrained machine; parallel
  editing does not require overlapping validation processes.

- Native playback tests can speak through the owner's speakers. Give notice
  before audible local checks; use remote playback verification when those
  tests disrupt their work, while keeping localhost available for their review.

- A narration-length mismatch does not make footage unusable. Keep concise
  drafting and one shortening attempt, then repeat the healthy scene until
  speech completes. Use live speech completion to account for browser voices
  and decoder head starts; never turn an estimate into a measured duration.

- Approval of a visual preview confirms its appearance. Finish correctness and
  release checks, and obtain explicit merge approval separately.

- For the streaming briefing embed, keep video startup independent of full
  text/podcast preparation. A schema-valid complete dialogue can exceed the
  preparation deadline. Test a pending preparation request and an eventual 503
  while actual recorded video/narration keep playing; an immediate successful
  JSON fixture cannot catch this dependency regression. Scope errors to their
  modality and let video retry without rebuilding the other outputs.

- Verify template readability inside the full embed, not only isolated template
  canvases. Use container width for orientation so a narrow sidebar behaves like
  a phone; resizing must not cause paid regeneration.

- Freeze local HMR and server rebuilds during live narration checks. Clear
  transient failed speech preparation only on an explicit new generation or
  retry, preserving successful cached audio and avoiding automatic paid loops.

- For briefing films, a successful template is not sufficient visual evidence.
  Verify actual media requests and moving frames: specialized factual layouts
  must not silently opt out of footage. Footage should lead most scenes;
  text-only scenes are exceptions. Keep immutable facts while adding media.

- Fixed-width source chunks can separate product names from capabilities or
  eligibility. Preserve product statements and qualifications together where
  possible, and verify semantic attribution in a live sample rather than
  treating a syntactically valid source reference as proof of truth.

- A vendor-owned SDK does not make the vendor the publisher of every output.
  In the Microsoft demo, Microsoft speaks to its customers about relevant
  product releases; the SDK only supplies the technology. Personalize the choice
  and explanation of real, recent updates using supplied goals, adoption and
  interests. Do not substitute a generic management pilot plan, or turn
  fictional sample adoption into observed tenant data or confirmed eligibility.

- Provider schemas must structurally enforce essential output counts. Prompt-only array limits caused a podcast exchange-count rejection to discard both podcast and article; fixed named slots bound the conversation without unsupported provider array keywords. Keep a retry path that preserves already generated media.

- When a short summary becomes a long-form article plus dialogue, review both the preparation deadline and the outer HTTP deadline. The 40-second inner / 45-second outer limits aborted otherwise pending provider work. Keep deadlines server-owned, bounded and cancellation-aware, and verify with a delayed-response test plus a separately budgeted live run.
