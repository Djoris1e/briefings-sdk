import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let createVideoChatVoice: typeof import("../src/video-chat/voice").createVideoChatVoice;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("generated speech preparation deadlines", () => {
  beforeEach(async () => {
    vi.resetModules();
    ({ createVideoChatVoice } = await import("../src/video-chat/voice"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["request", "body", "decode"] as const)("waits beyond three seconds, then continues without browser speech after a stuck %s", async (stage) => {
    vi.useFakeTimers();
    const request = deferred<Response>();
    const body = deferred<ArrayBuffer>();
    const decode = deferred<AudioBuffer>();
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:generated");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal("AudioContext", class { decodeAudioData() { return decode.promise; } });
    const browserSpeak = vi.fn((utterance: { onend?: () => void }) => utterance.onend?.());
    vi.stubGlobal("speechSynthesis", { speak: browserSpeak, cancel: vi.fn() });
    vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
    const response = new Response(new Uint8Array([1, 2, 3]));
    if (stage === "body") vi.spyOn(response, "arrayBuffer").mockReturnValue(body.promise);
    let childSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      childSignal = init?.signal ?? undefined;
      return stage === "request" ? request.promise : Promise.resolve(response);
    });
    const fallback = vi.fn();
    const voice = createVideoChatVoice({ fetcher, onFallback: fallback });
    const parent = new AbortController();
    let ready = false;
    const preparing = voice.prepare("A short response.", { signal: parent.signal }).then((value) => { ready = true; return value; });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(36_999);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(ready).toBe(true);
    await expect(preparing).resolves.toEqual({ seconds: expect.any(Number) });
    expect(childSignal?.aborted).toBe(true);
    expect(parent.signal.aborted).toBe(false);
    expect(fallback).toHaveBeenCalledOnce();

    request.resolve(response);
    body.resolve(new Uint8Array([1, 2, 3]).buffer);
    decode.resolve({ duration: 25 } as AudioBuffer);
    await vi.advanceTimersByTimeAsync(0);
    await expect(voice.prepare("A short response.")).resolves.toEqual({ seconds: expect.any(Number) });
    await expect(voice.speak("A short response.", { signal: parent.signal })).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(browserSpeak).not.toHaveBeenCalled();
    expect(createUrl.mock.calls.length).toBe(revokeUrl.mock.calls.length);
    expect(vi.getTimerCount()).toBe(0);
    voice.dispose?.();
  });

  it.each(["request", "body", "decode"] as const)("keeps successful audio when %s takes twenty seconds", async (stage) => {
    vi.useFakeTimers();
    const request = deferred<Response>();
    const body = deferred<ArrayBuffer>();
    const decode = deferred<AudioBuffer>();
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const decoded = { duration: 25 } as AudioBuffer;
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:late-success");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal("AudioContext", class {
      decodeAudioData() { return stage === "decode" ? decode.promise : Promise.resolve(decoded); }
    });
    const response = new Response(bytes);
    if (stage === "body") vi.spyOn(response, "arrayBuffer").mockReturnValue(body.promise);
    const fallback = vi.fn();
    const fetcher = vi.fn(() => stage === "request" ? request.promise : Promise.resolve(response));
    const voice = createVideoChatVoice({ fetcher, onFallback: fallback });
    let ready = false;
    const preparing = voice.prepare("A slower successful response.").then(value => { ready = true; return value; });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ready).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
    request.resolve(response);
    body.resolve(bytes);
    decode.resolve(decoded);
    await expect(preparing).resolves.toEqual({ seconds: 25, supportsOffsets: true });
    await expect(voice.prepare("A slower successful response.")).resolves.toEqual({ seconds: 25, supportsOffsets: true });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(createUrl).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    voice.dispose?.();
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith("blob:late-success");
  });

  it("revokes generated audio when cancellation wins the final preparation race", async () => {
    const parent = new AbortController();
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      parent.abort();
      return "blob:cancelled";
    });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const fallback = vi.fn();
    const voice = createVideoChatVoice({
      fetcher: vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
      onFallback: fallback,
    });
    await expect(voice.prepare("Cancelled audio.", { signal: parent.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:cancelled");
    expect(fallback).not.toHaveBeenCalled();
    voice.dispose?.();
  });

  it.each(["cancel", "dispose"] as const)("settles a signal-ignoring request immediately on %s without a fallback warning", async (action) => {
    vi.useFakeTimers();
    const fallback = vi.fn();
    const voice = createVideoChatVoice({ fetcher: vi.fn(() => new Promise<Response>(() => undefined)), onFallback: fallback });
    const parent = new AbortController();
    let rejected: unknown;
    const preparing = voice.prepare("Cancelled line.", { signal: parent.signal }).catch((cause: unknown) => { rejected = cause; });
    if (action === "cancel") parent.abort();
    else voice.dispose?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(rejected).toMatchObject({ name: "AbortError" });
    await preparing;
    expect(fallback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    voice.dispose?.();
  });
});
