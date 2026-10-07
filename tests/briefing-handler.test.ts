import { describe, expect, it, vi } from "vitest";
import { createBriefingHandler, type BriefingHandlerOptions } from "../src/briefing/handler";

const prompt = "Feature A requires admin enablement.";
const authored = { summary: prompt, facts: [{ id: "f1", text: prompt, evidence: prompt }], priorities: [], podcast: { turns: [
  { id: "t1", speaker: "host", text: "What is needed?", factIds: ["f1"] },
  { id: "t2", speaker: "analyst", text: prompt, factIds: ["f1"] },
] } };
const providerAuthored = { ...authored, facts: [{ id: "f1", text: prompt, sourceId: "source1" }],
  podcast: { exchanges: [{ host: "What is needed?", analyst: prompt, factIds: ["f1"] }] } };
const options = (extra: Partial<BriefingHandlerOptions> = {}): BriefingHandlerOptions => ({ authorize: "none",
  prepareText: () => JSON.stringify(providerAuthored), generateText: () => "", streamText: async function* () {}, ...extra });
const request = (body: unknown = { prompt }, extra: RequestInit = {}) => new Request("https://app.example/api?action=briefing", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...extra,
});

describe("portable briefing handler", () => {
  it("shares explicit authentication and calls it once for each route", async () => {
    const authorize = vi.fn(() => true);
    const prepareText = vi.fn(() => JSON.stringify(providerAuthored));
    const handler = createBriefingHandler(options({ authorize, prepareText }));
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ version: 1, prompt, summary: prompt, podcast: authored.podcast });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(prepareText).toHaveBeenCalledTimes(1);
    expect((await handler(new Request("https://app.example/api?action=capabilities"))).status).toBe(200);
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(prepareText).toHaveBeenCalledTimes(1);
  });
  it("retains origin rejection and credentialed preflight without provider work", async () => {
    const prepareText = vi.fn(); const authorize = vi.fn(() => true);
    const handler = createBriefingHandler(options({ prepareText, authorize, allowedOrigins: ["https://embed.example"], allowCredentials: true }));
    expect((await handler(request(undefined, { headers: { origin: "https://forbidden.example" } }))).status).toBe(403);
    const preflight = await handler(new Request("https://app.example/api?action=briefing", { method: "OPTIONS", headers: { origin: "https://embed.example" } }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://embed.example");
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");
    expect(authorize).not.toHaveBeenCalled(); expect(prepareText).not.toHaveBeenCalled();
  });
  it("denies authentication and sanitizes private authorization failures", async () => {
    const prepareText = vi.fn(); const onError = vi.fn(() => { throw new Error("private observer"); });
    const handler = createBriefingHandler(options({ prepareText, authorize: () => { throw new Error("private token"); }, onError }));
    const result = await handler(request());
    expect(result.status).toBe(401); expect(await result.text()).not.toContain("private");
    expect(onError).toHaveBeenCalledOnce(); expect(prepareText).not.toHaveBeenCalled();
  });
  it("preserves method, malformed JSON, request validation and bounded streamed-body checks", async () => {
    const prepareText = vi.fn();
    const handler = createBriefingHandler(options({ prepareText, maxBodyBytes: 80 }));
    expect((await handler(new Request("https://app.example/api?action=briefing"))).status).toBe(405);
    expect((await handler(request(undefined, { body: "{" }))).status).toBe(400);
    expect((await handler(request({ prompt, extra: true }))).status).toBe(400);
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(81)); }, cancel });
    const result = await handler(request(undefined, { body, duplex: "half" } as RequestInit));
    expect(result.status).toBe(413); expect(cancel).toHaveBeenCalledOnce();
    expect(prepareText).not.toHaveBeenCalled();
  });
  it("sanitizes provider failures and malformed factual outputs", async () => {
    for (const prepareText of [() => { throw new Error("private api key"); }, () => JSON.stringify({ ...providerAuthored, summary: "" })]) {
      const response = await createBriefingHandler(options({ prepareText }))(request());
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: { code: "briefing_unavailable", message: "The briefing could not be prepared" } });
    }
  });
  it("cancels preparation even if an adapter ignores its abort signal", async () => {
    const controller = new AbortController();
    let start!: () => void;
    const started = new Promise<void>(resolve => { start = resolve; });
    const handler = createBriefingHandler(options({ prepareText: () => { start(); return new Promise(() => {}); } }));
    const pending = handler(request(undefined, { signal: controller.signal }));
    await started; controller.abort();
    const result = await pending;
    expect(result.status).toBe(499);
    expect(await result.json()).toMatchObject({ error: { code: "aborted" } });
  });
  it("delegates existing speech and unknown actions unchanged", async () => {
    const generateSpeech = vi.fn(() => ({ audio: new Uint8Array([1, 2]), mediaType: "audio/mpeg" }));
    const prepareText = vi.fn();
    const handler = createBriefingHandler(options({ generateSpeech, prepareText }));
    const speech = await handler(new Request("https://app.example/api?action=speech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Hello" }) }));
    expect(speech.status).toBe(200); expect(generateSpeech).toHaveBeenCalledOnce();
    expect((await handler(new Request("https://app.example/api?action=unknown"))).status).toBe(404);
    expect(prepareText).not.toHaveBeenCalled();
  });
  it("requires explicit authorization and a preparation adapter at construction", () => {
    expect(() => createBriefingHandler({ ...options(), prepareText: undefined } as unknown as BriefingHandlerOptions)).toThrow("prepareText");
    expect(() => createBriefingHandler({ ...options(), authorize: undefined } as unknown as BriefingHandlerOptions)).toThrow("authorize");
  });
});
