# Prompt and conversation input

The host supplies one text: release notes plus whatever audience context it
wants used (goals, adoption, interests). The SDK does not fetch, discover or
personalize anything. `src/briefing/prepare.ts` owns the briefing prompt;
`src/server/` owns the video-planning prompt and conversation formatting; the
host's handler options (`instructions`) add product guidance.

## What the component sends

`generate(prompt, format, { screenshots })` validates the prompt (non-empty,
at most 12,000 JavaScript characters) and up to four screenshot assets, then
sends two requests to the same endpoint:

- `action=briefing` with `{ prompt, screenshots }`. The server splits the
  prompt into numbered chunks (`source1`, `source2`, …) and sends them as JSON
  in the user prompt together with screenshot IDs and `alt` text only.
- `action=response` with the prompt, bounded conversation, orientation and the
  same screenshots. The planner reads it as source material for a video.

`format` only picks the visible tab. Both requests always run.

## Follow-ups

A follow-up does not send a diff. `buildBriefingPrompt`
(`src/briefing/context.ts`) rebuilds one prompt from the original brief, the
retained turns (each earlier question with the summary it produced; whole
recent turns are kept while they fit, oldest dropped first, at most eight) and
the current question, within the 12,000-character limit. The original brief and
the newest question are never truncated; if they alone exceed the limit, the
component asks for a shorter follow-up. The rebuilt prompt then goes through
both requests again, so follow-ups also regenerate the video.

## Product guidance

Durable product direction goes through the handler's `instructions` option, as
the reference route does:

```js
createVideoChatHandler({
  authorize: "none", // Host admission applies before this handler.
  streamText, generateText,
  instructions: "When the prompt supplies a briefing or source digest, use only its facts and preserve qualifications. …",
});
```

`instructions` shapes tone and answer style for the video planner. It cannot
change the protocol, authorize media or weaken validation. The briefing prompt
has its own fixed editorial guidance (`src/briefing/editorial.ts`); hosts
change it by changing the source, not per request.

## What reaches the model

Provider adapters receive two complete strings, `systemPrompt` and
`userPrompt`, and pass them unchanged. For the briefing the system prompt
describes the JSON contract, product attribution rules, article and podcast
guidance; the user prompt is the JSON of sources and screenshot descriptors.
For video the system prompt describes the answer brief and shot format, pacing
and visual rules; the user prompt carries the request, bounded prior turns,
orientation and screenshot IDs.

Supplied text is declared untrusted data in both prompts. Credentials and media
URLs never enter either; media is restored server-side after parsing.

## What the model may not decide

- Facts without a source chunk, or evidence text. The server attaches exact
  source text; the model only cites chunk IDs.
- Screenshot URLs or contents. It sees IDs and `alt` and selects by ID.
- Release dates, availability, current product facts or claims of having
  searched. Missing material must produce a request for material, not news.
- Scene IDs, layouts, media providers, lifecycle events or protocol envelopes.
  The runtime assigns those and validates every scene.
- Executable content. React, HTML, CSS and JavaScript are rejected.

## Video planning shape

The planner streams a compact answer brief (opening, visual direction), then
shots as NDJSON with narration, title, visual metadata and an optional footage
source. The ending is authored early and committed last. A substantive briefing
usually uses three to five scenes within the duration ceiling; narration is one
short sentence per shot, with a bounded rewrite when speech would overrun the
clip. In `hybrid`/`mediaLed` mode, validated visual metadata selects chapter,
key figure, comparison, quote, timeline or screenshot layouts, and most scenes
carry full-frame footage or a source image with a restrained overlay.

## Debugging weak output

1. Does the prompt contain the exact facts the output needs? Nothing else is
   available to the model.
2. Are the `source` chunk boundaries splitting a key sentence? Sources are
   consecutive slices of the prompt; the model is told to read neighbours
   together, but a shorter, cleaner source helps.
3. Did validation reject and re-author? Check `onDiagnostic` for
   `unusable_output` and its `reason`.
4. Is `instructions` concise guidance rather than extra source data?
5. Does the adapter pass both prompt strings unchanged and enforce
   `outputSchema`?
6. Do `onWarning` and `onComplete` show rejected scenes or a length limit?

Log request IDs, diagnostic codes, model IDs and token usage. Never log the
prompt or provider output.
