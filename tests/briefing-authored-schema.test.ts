import { describe, expect, it, vi } from "vitest";
import { createBriefingOutputSchema, splitBriefingSources } from "../src/briefing/authored-schema";
import type { BriefingTextRequest } from "../src/briefing/prepare";
import { BriefingValidationError, prepareBriefing, validatePreparedBriefing } from "../src/briefing/prepare";

const prompt = "Feature is in preview; not generally available. Admin consent is required. “Exact quotes” and punctuation differ in model output.";
const authored = () => ({ summary: "The feature is in preview and needs admin consent.",
  facts: [{ id: "f1", text: "The preview needs admin consent.", sourceId: "source1" }],
  priorities: [{ factIds: ["f1"], relevance: "A pilot may be useful.", action: "Ask an admin to assess eligibility." }],
  podcast: { exchanges: [{ host: "What changed?", analyst: "A preview is available, with admin consent required.", factIds: ["f1"] },
    { host: "Can everyone use it?", analyst: "The supplied text does not say it is generally available.", factIds: ["f1"] },
    { host: "What should we do?", analyst: "Ask an admin to assess eligibility before a pilot.", factIds: ["f1"] }] } });
const prepare = (value: unknown) => prepareBriefing({ prompt }, { generateText: () => JSON.stringify(value), id: "brief1" });

describe("source-backed structured briefing", () => {
  it("hydrates exact evidence and server-owned turn IDs/roles from compact references", async () => {
    const result = await prepare(authored());
    expect(result.facts[0]?.evidence).toBe(prompt);
    expect(result.podcast.turns.map(({ id, speaker }) => ({ id, speaker }))).toEqual([
      { id: "t1", speaker: "host" }, { id: "t2", speaker: "analyst" }, { id: "t3", speaker: "host" },
      { id: "t4", speaker: "analyst" }, { id: "t5", speaker: "host" }, { id: "t6", speaker: "analyst" },
    ]);
    expect(validatePreparedBriefing(result)).toEqual(result);
  });
  it("enforces one to three exchanges structurally and preserves every accepted turn", async () => {
    const schema = createBriefingOutputSchema() as { properties: { podcast: { properties: { exchanges: { type: string; required: string[]; additionalProperties: boolean } } } } };
    const grammar = schema.properties.podcast.properties.exchanges;
    expect(grammar.type).toBe("object");
    expect(grammar.required).toEqual(["opening", "detail", "closing"]);
    expect(grammar.additionalProperties).toBe(false);
    const [opening, detail, closing] = authored().podcast.exchanges;
    for (const exchanges of [{ opening, detail: null, closing: null }, { opening, detail, closing: null }, { opening, detail, closing }]) {
      const result = await prepare({ ...authored(), podcast: { exchanges } });
      const expected = Object.values(exchanges).filter(Boolean).flatMap(exchange => [exchange!.host, exchange!.analyst]);
      expect(result.podcast.turns.map(turn => turn.text)).toEqual(expected);
      expect(result.summary).toBe(authored().summary);
    }
    for (const exchanges of [{ opening: null, detail: null, closing: null }, { opening, detail: null, closing }, { opening, detail }]) {
      await expect(prepare({ ...authored(), podcast: { exchanges } })).rejects.toMatchObject({ code: "exchange_limit" });
    }
    await expect(prepare({ ...authored(), podcast: { exchanges: { opening, detail, closing, extra: opening } } })).rejects.toMatchObject({ code: "unexpected_field" });
  });
  it.each(["x".repeat(12000), "a".repeat(599) + "😀".repeat(5700), "界".repeat(12000), ("First line.\r\nSecond line.\n").repeat(400)])("preserves every original code unit across bounded source chunks", source => {
    const pieces = splitBriefingSources(source);
    expect(pieces.map(piece => piece.text).join("")).toBe(source);
    expect(pieces.length).toBeLessThanOrEqual(41);
    expect(pieces.every(piece => piece.text.length <= 600)).toBe(true);
    expect(new Set(pieces.map(piece => piece.id)).size).toBe(pieces.length);
    for (const piece of pieces) {
      expect(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(piece.text)).toBe(false);
    }
  });
  it("sends all long input context and a stable provider grammar without copied evidence", async () => {
    const input = "x".repeat(5100) + " FINAL QUALIFICATION: admin consent remains required.";
    const generateText = vi.fn(async (_request: BriefingTextRequest) => JSON.stringify(authored()));
    await prepareBriefing({ prompt: input }, { generateText });
    const context = generateText.mock.calls[0]?.[0] as unknown as { outputSchema: unknown; userPrompt: string };
    const submitted = JSON.parse(context.userPrompt);
    expect(submitted.sources.map((source: { text: string }) => source.text).join("")).toBe(input);
    expect(context.outputSchema).toEqual(createBriefingOutputSchema());
    expect(JSON.stringify(context.outputSchema)).not.toMatch(/maxLength|minLength|minItems|maxItems|"evidence"/u);
    expect(JSON.stringify(context.outputSchema)).toContain('"additionalProperties":false');
    expect(JSON.stringify(context.outputSchema)).toContain('"source41"');
  });
  it.each([
    ["source_reference", () => ({ ...authored(), facts: [{ id: "f1", text: "Fact", sourceId: "source21" }] })],
    ["fact_reference", () => ({ ...authored(), priorities: [{ factIds: ["f6"], relevance: "Relevant", action: "Act" }] })],
    ["duplicate_id", () => ({ ...authored(), facts: [...authored().facts, ...authored().facts] })],
    ["summary_bounds", () => ({ ...authored(), summary: "x".repeat(1801) })],
    ["turn_text_bounds", () => ({ ...authored(), podcast: { exchanges: [{ host: "x".repeat(701), analyst: "Answer", factIds: ["f1"] }] } })],
    ["exchange_limit", () => ({ ...authored(), podcast: { exchanges: [] } })],
    ["unexpected_field", () => ({ ...authored(), screenshots: [] })],
  ] as const)("reports fixed %s without source or provider content", async (reason, value) => {
    const error = await prepare(value()).catch(cause => cause);
    expect(error).toBeInstanceOf(BriefingValidationError);
    expect(error.code).toBe(reason);
    expect(error.message).not.toContain(prompt);
    expect(error.message).not.toContain("source21");
  });
  it("classifies incomplete JSON separately from semantic failure", async () => {
    await expect(prepareBriefing({ prompt }, { generateText: () => '{"summary":' })).rejects.toMatchObject({ name: "BriefingValidationError", code: "invalid_json" });
  });
});
