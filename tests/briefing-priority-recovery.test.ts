import { expect, it, vi } from "vitest";
import { prepareBriefing, validatePreparedBriefing } from "../src/briefing/prepare";

const prompt = "The feature remains in preview, requires admin consent and is not generally available.";
const priority = { factIds: ["f1"], relevance: "A limited pilot may help assess fit.", action: "Ask the administrator to check availability." };
const authored = (priorities: unknown[] = [priority]) => ({ summary: prompt,
  facts: [{ id: "f1", text: prompt, sourceId: "source1" }], priorities,
  podcast: { exchanges: [{ host: "What are the constraints?", analyst: prompt, factIds: ["f1"] }] } });
const prepare = (value: unknown, onDiagnostic = vi.fn()) => prepareBriefing({ prompt }, {
  generateText: () => JSON.stringify(value), onDiagnostic, id: "brief1",
});

it.each(["relevance", "action"] as const)("omits an oversized optional %s item without changing facts, summary or spoken qualifications", async field => {
  const onDiagnostic = vi.fn();
  const result = await prepare(authored([{ ...priority, [field]: "x".repeat(351) }, priority]), onDiagnostic);
  expect(result.priorities).toEqual([priority]);
  expect(result.summary).toBe(prompt);
  expect(result.facts[0]).toEqual({ id: "f1", text: prompt, evidence: prompt });
  expect(result.podcast.turns[1]?.text).toBe(prompt);
  expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith({ code: `priority_${field}_bounds`, priorityIndex: 0, reason: "too_long", recovery: "priority_omitted" });
  expect(validatePreparedBriefing(result)).toEqual(result);
});

it("retains a useful canonical briefing when every optional priority exceeds its bound", async () => {
  const onDiagnostic = vi.fn();
  const result = await prepare(authored([
    { ...priority, relevance: "x".repeat(351) }, { ...priority, action: "x".repeat(351) },
  ]), onDiagnostic);
  expect(result.priorities).toEqual([]);
  expect(result.summary).toBe(prompt);
  expect(result.podcast.turns).toHaveLength(2);
  expect(onDiagnostic).toHaveBeenCalledTimes(2);
});

it.each([["", "empty"], ["  ", "empty"], [null, "invalid_type"]])("classifies malformed optional prose without copying its content", async (relevance, reason) => {
  const onDiagnostic = vi.fn();
  const result = await prepare(authored([{ ...priority, relevance }]), onDiagnostic);
  expect(result.priorities).toEqual([]);
  expect(onDiagnostic).toHaveBeenCalledWith({ code: "priority_relevance_bounds", priorityIndex: 0, reason, recovery: "priority_omitted" });
  expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain(prompt);
});

it("preserves complete prose at the exact boundary without trimming it", async () => {
  const exact = { ...priority, relevance: "x".repeat(350), action: "y".repeat(350) };
  expect((await prepare(authored([exact]))).priorities).toEqual([exact]);
});

it.each([{ factIds: ["f6"], code: "fact_reference" }, { factIds: [], code: "missing_fact_reference" }, { factIds: ["f1", "f1"], code: "duplicate_id" }])("still rejects $code before optional omission", async ({ factIds, code }) => {
  await expect(prepare(authored([{ ...priority, relevance: "x".repeat(351), factIds }]))).rejects.toMatchObject({ name: "BriefingValidationError", code });
});

it("keeps the public transport validator strict and identifies priority fields separately", async () => {
  const result = await prepare(authored());
  for (const field of ["relevance", "action"] as const) {
    expect(() => validatePreparedBriefing({ ...result, priorities: [{ ...priority, [field]: "x".repeat(351) }] })).toThrow(expect.objectContaining({ code: `priority_${field}_bounds` }));
  }
});

it("does not recover oversized core facts, summary or dialogue", async () => {
  const base = authored();
  for (const [value, code] of [
    [{ ...base, facts: [{ ...base.facts[0], text: "x".repeat(401) }] }, "fact_text_bounds"],
    [{ ...base, summary: "x".repeat(1801) }, "summary_bounds"],
    [{ ...base, podcast: { exchanges: [{ host: "Question?", analyst: "x".repeat(701), factIds: ["f1"] }] } }, "turn_text_bounds"],
  ]) await expect(prepare(value)).rejects.toMatchObject({ code });
});

it("does not let a failing diagnostic observer discard recovered output", async () => {
  const result = await prepare(authored([{ ...priority, action: "x".repeat(351) }]), vi.fn(() => { throw new Error("Observer failed"); }));
  expect(result.summary).toBe(prompt);
  expect(result.priorities).toEqual([]);
});
