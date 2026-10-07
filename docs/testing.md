# Testing without a model

Tests use deterministic callbacks and recorded media. They need no keys,
provider SDKs or network. They prove ordering, validation, cancellation and
recovery, not live answer quality or latency.

## Briefing preparation

`prepareBriefing` takes a `generateText` double and returns a validated
`PreparedBriefing` or throws `BriefingValidationError` with a fixed `code`.
`tests/briefing.test.ts` and its neighbours (`briefing-article`,
`briefing-attribution`, `briefing-priority-recovery`, `briefing-authored-schema`)
cover the schema, evidence restoration, fixed podcast slots and the single
re-author retry. Return the authored shape the schema asks for, with
`sourceId` values taken from the chunk IDs the server supplies (`source1`, `source2`, …):

```ts
import { prepareBriefing } from "../src/briefing/prepare";

const briefing = await prepareBriefing({ prompt: source }, {
  generateText: async () => JSON.stringify({
    summary: "…", article: { title: "…", dek: "…", sections: [] },
    facts: [{ id: "f1", text: "…", sourceId: "source1" }],
    priorities: [{ factIds: ["f1"], relevance: "…", action: "…" }],
    podcast: { exchanges: { opening: { host: "…", analyst: "…", factIds: ["f1"] }, detail: null, closing: null } },
  }),
});
```

`tests/briefing-handler.test.ts` exercises `createBriefingHandler` end to end
over `Request`/`Response`, including `authorize`, origin checks, body bounds, the `499 aborted` and
`502 briefing_unavailable` paths. `tests/app-api/briefing.test.mjs` covers the Cloudflare
route with quota and provider doubles.

## Video route

Return the answer-brief shape requested by the planning prompt, not a generic
plan:

```ts
import { expect, it } from "vitest";
import { createVideoChatHandler } from "../src/server";

it("completes a narrated chapter when footage is unavailable", async () => {
  const handle = createVideoChatHandler({
    authorize: "none", // In-process test only.
    heartbeatMs: false,
    streamText: async function* () {
      yield JSON.stringify({
        type: "answer", intent: "informational",
        opening: "Waves move toward the shore.",
        subject: "ocean waves", development: "",
        visualDirection: "Natural ocean footage.",
        ending: {
          title: "Waves carry energy",
          narration: "Ocean waves carry energy toward the shore.",
          subject: "ocean waves", action: "Follow waves toward the shore.",
          durationSec: 4, continuity: "cut",
        },
      }) + "\n";
    },
    generateText: async () => "[]",
  });
  const response = await handle(new Request(
    "https://app.test/api/video-chat?action=response",
    { method: "POST", body: JSON.stringify({ prompt: "Explain waves" }) },
  ));
  const body = await response.text();
  expect(response.status).toBe(200);
  expect(body).toContain('"type":"scene.add"');
  expect(body).toContain('"type":"response.complete"');
});
```

Protocol tests exercise `src/protocol/` and `src/server/compose-video.ts`
directly. Keep provider output beside the regression it explains rather than in
a shared mock library. Test cancellation at the route boundary: every provider
double must observe the request signal.

## Component and browser

`tests/prompt-output.test.tsx` and `tests/briefing-component.test.tsx` render
`PromptOutput` with fetch doubles and check parallel video/briefing requests,
tab reuse, follow-up context, cancellation and retry controls.
`tests/app-browser/` (`npm run test:embed`, `npm run test:app`) drives the real
preview against a test server with paid providers disabled and recorded media.
`tests/browser/` scenarios cover decoding, narration clocks, captions, media
recovery and complete endings with the fixtures in `tests/support/chat/`. Those
fixtures never ship in the running app.

## Judging quality

None of the above says whether an answer is good. `npm run acceptance:chat`
walks the prompts in `scripts/acceptance/prompt-cases.json` through the video
planner with doubles and prints a report; see the
[acceptance gate](maintainers/acceptance.md). Factual fidelity of briefings,
spoken quality and first-content latency need real provider calls under an
explicitly authorized budget. Review new fixtures for preserved qualifications,
release status and sensible recommendations before relying on them.
