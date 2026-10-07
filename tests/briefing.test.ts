import { describe, expect, it, vi } from "vitest";
import type { BriefingTextRequest } from "../src/briefing/prepare";
import { parseBriefingRequest, prepareBriefing, toVideoPrompt, validatePreparedBriefing, validateScreenshotAssets } from "../src/briefing/prepare";

const prompt = "Teams feature A is in preview for selected tenants. An admin must enable it. Maya manages onboarding.";
const authored = () => ({ summary: "Feature A is in preview for selected tenants and needs admin enablement.",
  facts: [{ id: "f1", text: "Feature A is in preview for selected tenants.", evidence: "Teams feature A is in preview for selected tenants." },
    { id: "f2", text: "Admin enablement is required.", evidence: "An admin must enable it." }],
  priorities: [{ factIds: ["f1", "f2"], relevance: "Maya could assess whether this helps onboarding.", action: "Ask the admin about tenant availability." }],
  podcast: { turns: [{ id: "t1", speaker: "host", text: "What can Maya try?", factIds: ["f1"] },
    { id: "t2", speaker: "analyst", text: "Check tenant availability first: the feature is in preview and an admin must enable it.", factIds: ["f1", "f2"] }] } });
const providerAuthored = () => ({ ...authored(), facts: authored().facts.map(({ id, text }) => ({ id, text, sourceId: "source1" })),
  podcast: { exchanges: [{ host: authored().podcast.turns[0]!.text, analyst: authored().podcast.turns[1]!.text, factIds: ["f1", "f2"] }] } });
const prepared = () => ({ version: 1, id: "brief1", prompt, ...authored(), screenshots: [] });
const screenshot = { id: "screen1", url: "https://cdn.example.com/screen.png", alt: "Host supplied Teams settings screenshot", sourceUrl: "https://learn.microsoft.com/example", animate: false };

describe("canonical briefing", () => {
  it("makes one bounded provider-neutral call and preserves host-owned source and assets", async () => {
    const generateText = vi.fn(async (_request: BriefingTextRequest) => JSON.stringify(providerAuthored()));
    const result = await prepareBriefing({ prompt, screenshots: [screenshot] }, { generateText, id: "brief1" });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0]?.[0]).toMatchObject({task: "briefing", maxOutputTokens: 6144});
    const context = generateText.mock.calls[0]?.[0] as unknown as { systemPrompt: string; userPrompt: string };
    expect(context.systemPrompt).not.toContain(prompt);
    expect(context.userPrompt).not.toContain(screenshot.url);
    expect(result).toMatchObject({ prompt, screenshots: [screenshot], podcast: { turns: [{ speaker: "host" }, { speaker: "analyst" }] } });
    const video = toVideoPrompt(result, "Explain the admin prerequisite.");
    expect(video).toContain("An admin must enable it.");
    expect(video).toContain("Explain the admin prerequisite.");
    expect(video).toContain("screen1");
    expect(video).not.toContain(screenshot.url);
    expect(video).not.toContain('"podcast"');
    expect(video.length).toBeLessThanOrEqual(12000);
  });
  it.each([
    (value: ReturnType<typeof prepared>) => { value.facts[0]!.evidence = "Feature is generally available."; },
    (value: ReturnType<typeof prepared>) => { value.facts[1]!.id = "f1"; },
    (value: ReturnType<typeof prepared>) => { value.podcast.turns[1]!.factIds = ["invented"]; },
    (value: ReturnType<typeof prepared>) => { value.podcast.turns[1]!.factIds = []; },
    (value: ReturnType<typeof prepared>) => { value.podcast.turns[1]!.speaker = "host"; },
    (value: ReturnType<typeof prepared>) => { value.podcast.turns[0]!.text = "a".repeat(701); },
    (value: ReturnType<typeof prepared>) => { value.priorities[0]!.factIds = []; },
  ])("rejects unsupported evidence, references and podcast shape", mutate => {
    const value = prepared(); mutate(value);
    expect(() => validatePreparedBriefing(value)).toThrow();
  });
  it("rejects model-owned URLs and transport overrides instead of trusting or silently dropping them", async () => {
    for (const extra of [{ screenshots: [screenshot] }, { prompt: "Replaced" }, { sourceUrl: "https://fake.example.com" }]) {
      await expect(prepareBriefing({ prompt }, { generateText: () => JSON.stringify({ ...providerAuthored(), ...extra }) })).rejects.toThrow();
    }
  });
  it("handles missing source material without fabricating facts or padding conversation", async () => {
    const value = { summary: "Supply release notes to prepare a factual briefing.", facts: [], priorities: [], podcast: { exchanges: [{ host: "What do we need?", analyst: "Please supply the release notes and the audience context.", factIds: [] }] } };
    expect((await prepareBriefing({ prompt: "What is new?" }, { generateText: () => JSON.stringify(value) })).facts).toEqual([]);
  });
  it("re-authors once after output that fails the content contract and reports only the classification", async () => {
    const unusable = { ...providerAuthored(), podcast: { exchanges: { opening: { host: "Hi", analyst: "Closing thoughts.", factIds: [] }, detail: null, closing: null } } };
    const generateText = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(unusable))
      .mockResolvedValueOnce(JSON.stringify(providerAuthored()));
    const onDiagnostic = vi.fn();
    const result = await prepareBriefing({ prompt }, { generateText, onDiagnostic, id: "brief1" });
    expect(result.podcast.turns).toHaveLength(2);
    expect(generateText).toHaveBeenCalledTimes(2);
    const second = generateText.mock.calls[1]?.[0] as BriefingTextRequest;
    expect(second.systemPrompt).toContain("rejected by the validator (missing_fact_reference)");
    expect(second.systemPrompt).not.toContain(prompt);
    expect(onDiagnostic).toHaveBeenCalledWith({ code: "unusable_output", attempt: 1, reason: "missing_fact_reference", recovery: "retried" });
  });
  it("stops after the bounded retry and never retries provider failures, timeouts or cancellation", async () => {
    const broken = vi.fn(async () => "not json");
    const onDiagnostic = vi.fn();
    await expect(prepareBriefing({ prompt }, { generateText: broken, onDiagnostic })).rejects.toMatchObject({ code: "invalid_json" });
    expect(broken).toHaveBeenCalledTimes(2);
    expect(onDiagnostic).toHaveBeenLastCalledWith({ code: "unusable_output", attempt: 2, reason: "invalid_json", recovery: "failed" });
    const disabled = vi.fn(async () => "not json");
    await expect(prepareBriefing({ prompt }, { generateText: disabled, retries: 0 })).rejects.toThrow();
    expect(disabled).toHaveBeenCalledTimes(1);
    const failing = vi.fn(async () => { throw new Error("Provider unavailable"); });
    await expect(prepareBriefing({ prompt }, { generateText: failing })).rejects.toThrow("Provider unavailable");
    expect(failing).toHaveBeenCalledTimes(1);
    await expect(prepareBriefing({ prompt }, { generateText: broken, retries: 3 })).rejects.toThrow(RangeError);
    vi.useFakeTimers();
    try {
      const slow = vi.fn(() => new Promise<string>(() => {}));
      const work = expect(prepareBriefing({ prompt }, { timeoutMs: 1000, generateText: slow })).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(1500);
      await work;
      expect(slow).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("settles cancellation even when an adapter ignores its signal", async () => {
    const controller = new AbortController();
    const work = prepareBriefing({ prompt }, { signal: controller.signal, generateText: () => new Promise(() => {}) });
    controller.abort();
    await expect(work).rejects.toThrow();
  });
  it("accepts complete long-form preparation after the former 40-second cutoff", async () => {
    vi.useFakeTimers();
    try {
      let signal!: AbortSignal;
      const work = prepareBriefing({ prompt }, { generateText: request => {
        signal = request.signal;
        return new Promise(resolve => setTimeout(() => resolve(JSON.stringify(providerAuthored())), 58_000));
      } });
      await vi.advanceTimersByTimeAsync(45_000);
      expect(signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(13_000);
      expect((await work).podcast.turns).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });
  it("honors a host deadline and rejects unbounded timeout configuration", async () => {
    vi.useFakeTimers();
    try {
      let signal!: AbortSignal;
      const work = prepareBriefing({ prompt }, { timeoutMs: 1000, generateText: request => {
        signal = request.signal; return new Promise(() => {});
      } });
      const rejected = expect(work).rejects.toThrow("deadline");
      await vi.advanceTimersByTimeAsync(1000);
      await rejected;
      expect(signal.aborted).toBe(true);
      for (const timeoutMs of [0, NaN, Infinity, 120001]) {
        await expect(prepareBriefing({ prompt }, { timeoutMs, generateText: () => "" })).rejects.toThrow("Invalid briefing timeout");
      }
    } finally { vi.useRealTimers(); }
  });
  it("bounds a stalled adapter and prevents pre-cancelled calls", async () => {
    vi.useFakeTimers();
    try {
      const generateText = vi.fn(() => new Promise<string>(() => {}));
      const waiting = prepareBriefing({ prompt }, { generateText });
      const rejected = expect(waiting).rejects.toThrow("deadline");
      await vi.advanceTimersByTimeAsync(90_000);
      await rejected;
      const controller = new AbortController(); controller.abort();
      await expect(prepareBriefing({ prompt }, { generateText, signal: controller.signal })).rejects.toThrow();
      expect(generateText).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("rejects oversized complete outputs rather than cutting text or dropping facts", async () => {
    const value = prepared();
    value.summary = "x".repeat(1801);
    expect(() => validatePreparedBriefing(value)).toThrow();
    await expect(prepareBriefing({ prompt }, { generateText: () => "x".repeat(40001) })).rejects.toThrow();
    expect(() => toVideoPrompt(validatePreparedBriefing(prepared()), "x".repeat(1501))).toThrow();
  });
});

describe("host screenshot and prompt boundary", () => {
  it.each(["http://example.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://2130706433/x", "https://[::1]/x", "https://10.0.0.2/x", "https://site.internal/x", "https://u:p@example.com/x", "https://example.com:8443/x", "data:image/png;base64,a"])("rejects unsafe URL %s", url => {
    expect(() => validateScreenshotAssets([{ ...screenshot, url }])).toThrow();
  });
  it("validates all assets before any provider work and preserves input bounds", async () => {
    const generateText = vi.fn();
    expect(() => parseBriefingRequest({ prompt: "x".repeat(12001) })).toThrow();
    expect(parseBriefingRequest({ prompt: "x".repeat(12000) }).prompt).toHaveLength(12000);
    expect(() => validateScreenshotAssets([screenshot, screenshot])).toThrow();
    await expect(prepareBriefing({ prompt, screenshots: [{ ...screenshot, url: "http://example.com" }] }, { generateText })).rejects.toThrow();
    expect(generateText).not.toHaveBeenCalled();
  });
});
