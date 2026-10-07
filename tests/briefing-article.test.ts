import { expect, it, vi } from "vitest";
import { createBriefingOutputSchema } from "../src/briefing/authored-schema";
import { prepareBriefing, toVideoPrompt, validatePreparedBriefing, type BriefingTextRequest } from "../src/briefing/prepare";
import type { BriefingArticle } from "../src/briefing/types";

const prompt = "Feature A is in preview. Admin consent is required. Maya wants to reduce manual review.";
const article = (): BriefingArticle => ({ title: "A bounded pilot for Maya", dek: "Assess the preview before changing the review process.", sections: [
  { heading: "What is established", paragraphs: ["Feature A is in preview and requires admin consent."] },
  { heading: "What Maya can assess", paragraphs: ["Maya could test whether the preview helps her review process. That is a proposed experiment, not an established result."] },
  { heading: "What remains uncertain", paragraphs: ["The supplied material does not establish an improvement. Check the prerequisites before deciding whether to run a pilot."] },
] });
const authored = () => ({ summary: "Feature A is in preview and requires admin consent.", article: article(),
  facts: [{ id: "f1", text: "Feature A is in preview and requires admin consent.", sourceId: "source1" }], priorities: [],
  podcast: { exchanges: [{ host: "What can Maya assess?", analyst: "Feature A is in preview and requires admin consent; Maya could assess a small pilot.", factIds: ["f1"] }] } });
const prepared = () => ({ version: 1, id: "brief", prompt, summary: authored().summary, article: article(), screenshots: [], priorities: [],
  facts: [{ id: "f1", text: authored().facts[0].text, evidence: prompt }], podcast: { turns: [
    { id: "t1", speaker: "host", text: "What can Maya assess?", factIds: [] },
    { id: "t2", speaker: "analyst", text: authored().podcast.exchanges[0].analyst, factIds: ["f1"] },
  ] } });

it("requests and validates the reading article in the same bounded provider call", async () => {
  const generateText = vi.fn((_request: BriefingTextRequest) => JSON.stringify(authored()));
  const result = await prepareBriefing({ prompt }, { generateText });
  expect(generateText).toHaveBeenCalledOnce();
  expect(result.article).toEqual(article());
  expect(result.summary).toBe(authored().summary);
  const request = generateText.mock.calls[0][0];
  expect(request.maxOutputTokens).toBe(6144);
  expect(request.outputSchema).toEqual(createBriefingOutputSchema());
  expect(request.outputSchema.required).toContain("article");
  expect(request.systemPrompt).toContain("400–650 words only when");
  expect(request.systemPrompt).toContain("ONLY from the canonical facts");
  expect(request.systemPrompt).toContain("Never fabricate quotations, sources, bylines, publication dates");
  expect(request.systemPrompt).toContain("do not repeat facts, pad sections or invent context");
});

it("keeps old authored responses and recorded briefings without an article compatible", async () => {
  const { article: _article, ...legacy } = prepared();
  expect(validatePreparedBriefing(legacy)).toEqual(legacy);
  const { article: _authoredArticle, ...legacyAuthored } = authored();
  const result = await prepareBriefing({ prompt }, { generateText: () => JSON.stringify(legacyAuthored) });
  expect(result).not.toHaveProperty("article");
});

it("never sends reading prose into the canonical video input", () => {
  const { article: _article, ...legacy } = prepared();
  const result = validatePreparedBriefing(prepared());
  expect(toVideoPrompt(result)).toBe(toVideoPrompt(validatePreparedBriefing(legacy)));
  expect(toVideoPrompt(result)).not.toContain('"article"');
  expect(toVideoPrompt(result)).not.toContain(article().title);
});

it.each([
  ["title", (value: BriefingArticle) => { value.title = "x".repeat(121); }],
  ["dek", (value: BriefingArticle) => { value.dek = "x".repeat(321); }],
  ["heading", (value: BriefingArticle) => { value.sections[0].heading = "x".repeat(121); }],
  ["paragraph", (value: BriefingArticle) => { value.sections[0].paragraphs = ["x".repeat(1801)]; }],
  ["empty paragraph", (value: BriefingArticle) => { value.sections[0].paragraphs = ["  "]; }],
  ["missing paragraphs", (value: BriefingArticle) => { value.sections[0].paragraphs = []; }],
  ["too many paragraphs", (value: BriefingArticle) => { value.sections[0].paragraphs = Array(6).fill("Text"); }],
  ["too few sections", (value: BriefingArticle) => { value.sections = value.sections.slice(0, 2); }],
  ["too many sections", (value: BriefingArticle) => { value.sections = Array(6).fill(value.sections[0]); }],
] as const)("rejects invalid article %s without truncating its prose", (_label, change) => {
  const value = prepared(); change(value.article);
  expect(() => validatePreparedBriefing(value)).toThrow();
});

it.each([
  { ...article(), byline: "Invented author" },
  { ...article(), sections: [{ ...article().sections[0], date: "2026-10-07" }, ...article().sections.slice(1)] },
  { ...article(), sections: [{ ...article().sections[0], paragraphs: [{ text: "Rich text" }] }, ...article().sections.slice(1)] },
  { ...article(), title: "<h1>HTML title</h1>" },
  { ...article(), dek: "[Untrusted link](https://example.com)" },
  { ...article(), dek: "```code```" },
  { ...article(), dek: "## Markdown heading" },
  null,
])("rejects unknown fields and structured or marked-up article text", value => {
  expect(() => validatePreparedBriefing({ ...prepared(), article: value })).toThrow();
});

it("accepts exactly 8000 article text characters and rejects a combined overrun", async () => {
  const maximum: BriefingArticle = { title: "A", dek: "B", sections: [
    { heading: "C", paragraphs: ["x".repeat(1800), "x".repeat(1800)] },
    { heading: "D", paragraphs: ["x".repeat(1800), "x".repeat(1800)] },
    { heading: "E", paragraphs: ["x".repeat(795)] },
  ] };
  const raw = JSON.stringify({ ...authored(), article: maximum });
  expect(raw.length).toBeLessThan(40000);
  const result = await prepareBriefing({ prompt }, { generateText: () => raw });
  expect(result.article).toEqual(maximum);
  expect(toVideoPrompt(result).length).toBeLessThan(12000);
  maximum.sections[2].paragraphs[0] += "x";
  expect(() => validatePreparedBriefing({ ...prepared(), article: maximum })).toThrow();
});
