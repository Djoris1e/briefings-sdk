import { describe, expect, it, vi } from "vitest";
import { examples } from "../app/example-prompts";
import { BRIEFING_SOURCE_IDS, splitBriefingSources } from "../src/briefing/authored-schema";
import { prepareBriefing, type BriefingTextRequest } from "../src/briefing/prepare";

describe("briefing attribution context", () => {
  it.each(examples)("keeps $id product statements and their qualifications together", example => {
    const pieces = splitBriefingSources(example.prompt);
    expect(pieces.map(piece => piece.text).join("")).toBe(example.prompt);
    expect(pieces.length).toBeLessThanOrEqual(41);
    expect(pieces.every(piece => piece.text.length <= 600 && BRIEFING_SOURCE_IDS.includes(piece.id))).toBe(true);
    // Each dated release block must stay in one evidence chunk together with its
    // availability caveat and source link, so a cited fact cannot shed its qualification.
    const release = (key: string) => pieces.find(piece => piece.text.includes(key))!;
    const october = release("6 October 2026 release notes"), september = release("generally available items that rolled out in September");
    const frontier = release("describes default Copilot Search"), announcement = release("25 September 2026 announcement");
    expect(new Set([october.id, september.id, frontier.id, announcement.id]).size).toBe(4);
    expect(october.text).toContain("not proof of access in this customer's tenant");
    expect(frontier.text).toContain("Frontier, not general availability");
    expect(frontier.text).toContain("not confirmed tenant access");
    expect(announcement.text).toContain("does not confirm subsequent rollout completion");
    expect(september.text).not.toContain("Frontier");
    for (const piece of [october, september, frontier, announcement]) expect(piece.text).toMatch(/Source: https:\/\/(?:learn|techcommunity|blogs)\.microsoft\.com\//u);
  });

  it("prefers complete sentences inside a long paragraph", () => {
    const sentences = Array.from({ length: 10 }, (_, i) => `Product ${i} has a distinct capability ${"x".repeat(100)}. `);
    const pieces = splitBriefingSources(sentences.join(""));
    expect(pieces.map(piece => piece.text).join("")).toBe(sentences.join(""));
    for (const sentence of sentences) expect(pieces.some(piece => piece.text.includes(sentence))).toBe(true);
  });

  it.each([("a\n\n").repeat(3000) + "z".repeat(3000), ("😀\n\n").repeat(1000) + "😀".repeat(4000)])("bounds pathological paragraph counts without losing input", prompt => {
    const pieces = splitBriefingSources(prompt);
    expect(pieces.map(piece => piece.text).join("")).toBe(prompt);
    expect(pieces.length).toBeLessThanOrEqual(41);
    for (const piece of pieces) {
      expect(BRIEFING_SOURCE_IDS).toContain(piece.id);
      expect(piece.text.length).toBeLessThanOrEqual(600);
      expect(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(piece.text)).toBe(false);
    }
  });

  it("hydrates a recorded product-specific response without changing its qualifications", async () => {
    const prompt = examples[0]!.prompt;
    const sources = splitBriefingSources(prompt);
    const evidence = (key: string) => sources.find(source => source.text.includes(key))!;
    const facts = [
      { id: "f1", text: "Default Copilot Search in SharePoint/OneDrive is described as Frontier, not general availability; PowerPoint Brand Kit skills are October rollout plans, not confirmed tenant access.", sourceId: evidence("describes default Copilot Search").id },
      { id: "f2", text: "Home and Code were entering Frontier rollout; the announcement does not confirm subsequent rollout completion.", sourceId: evidence("25 September 2026 announcement").id },
      { id: "f3", text: "Copilot Search adds contextual chat on Windows and web, listed as generally available with gradual, platform-specific rollout.", sourceId: evidence("6 October 2026 release notes").id },
      { id: "f4", text: "Copilot in SharePoint supports content organization, grounded questions and metadata autofill; these rolled out in September.", sourceId: evidence("rolled out in September").id },
    ];
    const authored = { summary: facts.map(fact => fact.text).join(" "), facts, priorities: [], podcast: { exchanges: [
      { host: "Which rollouts are not yet general availability?", analyst: facts[0]!.text + " " + facts[1]!.text, factIds: ["f1", "f2"] },
      { host: "What is generally available now?", analyst: facts[3]!.text + " " + facts[2]!.text, factIds: ["f4", "f3"] },
    ] } };
    const generateText = vi.fn((_request: BriefingTextRequest) => JSON.stringify(authored));
    const result = await prepareBriefing({ prompt }, { generateText });
    for (const fact of facts) {
      expect(result.facts.find(item => item.id === fact.id)).toMatchObject({ text: fact.text, evidence: sources.find(source => source.id === fact.sourceId)!.text });
    }
    expect(result.podcast.turns[1]!.text).toBe(authored.podcast.exchanges[0]!.analyst);
    expect(result.podcast.turns[3]!.factIds).toEqual(["f4", "f3"]);
    const request = generateText.mock.calls[0]![0];
    expect(request.systemPrompt).toContain("Never transfer attributes between neighboring products");
    expect(request.systemPrompt).toContain("ONLY the canonical facts listed in that exchange's factIds");
    expect(JSON.parse(request.userPrompt).sources.map((source: { text: string }) => source.text).join("")).toBe(prompt);
  });
});
