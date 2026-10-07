import { afterEach, describe, expect, it, vi } from "vitest";
import { createVideoChatHandler } from "../src/server/create-video-chat-handler";

function speechRequest(signal?: AbortSignal) {
  return new Request("https://app.example/api?action=speech", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "A slower successful response." }), signal,
  });
}

function pendingSpeech() {
  let resolve!: (value: { audio: Uint8Array; mediaType: string }) => void;
  let started!: () => void;
  let signal: AbortSignal | undefined;
  const pending = new Promise<{ audio: Uint8Array; mediaType: string }>(done => { resolve = done; });
  const called = new Promise<void>(done => { started = done; });
  const handler = createVideoChatHandler({
    authorize: "none", generateText: async () => "", streamText: async function* () {},
    generateSpeech: context => { signal = context.signal; started(); return pending; },
  });
  return { handler, called, resolve, signal: () => signal };
}

describe("server speech generation deadline", () => {
  afterEach(() => vi.useRealTimers());

  it("returns speech completed after twenty seconds without cancelling it at the old deadline", async () => {
    vi.useFakeTimers();
    const provider = pendingSpeech();
    let ready = false;
    const result = provider.handler(speechRequest()).then(value => { ready = true; return value; });
    await provider.called;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ready).toBe(false);
    expect(provider.signal()?.aborted).toBe(false);
    provider.resolve({ audio: new Uint8Array([1, 2, 3]), mediaType: "audio/mpeg" });
    const response = await result;
    expect(response.status).toBe(200);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a stuck provider at thirty seconds and ignores its late result", async () => {
    vi.useFakeTimers();
    const provider = pendingSpeech();
    let ready = false;
    const result = provider.handler(speechRequest()).then(value => { ready = true; return value; });
    await provider.called;
    await vi.advanceTimersByTimeAsync(29_999);
    expect(ready).toBe(false);
    expect(provider.signal()?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const response = await result;
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: "speech_failed" } });
    expect(provider.signal()?.aborted).toBe(true);
    provider.resolve({ audio: new Uint8Array([1, 2, 3]), mediaType: "audio/mpeg" });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still aborts the provider immediately when the caller cancels during the extended allowance", async () => {
    vi.useFakeTimers();
    const provider = pendingSpeech();
    const parent = new AbortController();
    const result = provider.handler(speechRequest(parent.signal));
    await provider.called;
    await vi.advanceTimersByTimeAsync(12_000);
    expect(provider.signal()?.aborted).toBe(false);
    parent.abort();
    expect((await result).status).toBe(502);
    expect(provider.signal()?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
