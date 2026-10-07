// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createVideoChatVoice } from "../src/video-chat/voice";
import { useVideoChat } from "../src/video-chat/use-video-chat";
import { checksumVideo } from "../src/protocol/checksum";
import type { Video } from "../src/protocol/types";
import { TEST_VIDEO_STYLE } from "./helpers/video-style";

beforeEach(() => {
  const BaseURL = URL;
  vi.stubGlobal("URL", class extends BaseURL {
    static createObjectURL() { return "blob:prepared-speech"; }
    static revokeObjectURL() {}
  });
  vi.stubGlobal("AudioContext", class { async decodeAudioData() { return { duration: 2 }; } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const audio = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } });

it("does not retry a transient failure during preparation/playback, but permits it at an explicit new-generation boundary", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockImplementation(async () => audio());
  const voice = createVideoChatVoice({ fetcher });
  expect(await voice.prepare("Repeated line.")).not.toHaveProperty("supportsOffsets");
  await voice.prepare("Repeated line.");
  await voice.speak("Repeated line.", { signal: new AbortController().signal });
  voice.pause(); voice.resume();
  expect(fetcher).toHaveBeenCalledTimes(1);
  voice.clearFailedPreparations?.();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await voice.prepare("Repeated line.")).toMatchObject({ seconds: 2, supportsOffsets: true });
  voice.clearFailedPreparations?.();
  await voice.prepare("Repeated line.");
  expect(fetcher).toHaveBeenCalledTimes(2);
  voice.dispose?.();
});

it.each([204, 404])("preserves the session-wide configured unavailable state after HTTP %s", async status => {
  const fetcher = vi.fn(async () => new Response(null, { status }));
  const voice = createVideoChatVoice({ fetcher });
  await voice.prepare("First line.");
  voice.clearFailedPreparations?.();
  await voice.prepare("First line.");
  await voice.prepare("Other line.");
  expect(fetcher).toHaveBeenCalledTimes(1);
  voice.dispose?.();
});

it("clears only failed entries, retaining independently successful audio", async () => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => JSON.parse(String(init?.body)).text === "Failed line."
    ? new Response(null, { status: 503 }) : audio());
  const voice = createVideoChatVoice({ fetcher });
  await voice.prepare("Successful line.");
  await voice.prepare("Failed line.");
  voice.clearFailedPreparations?.();
  await voice.prepare("Successful line.");
  expect(fetcher).toHaveBeenCalledTimes(2);
  await voice.prepare("Failed line.");
  expect(fetcher).toHaveBeenCalledTimes(3);
  voice.dispose?.();
});

function stream(): Response {
  const snapshot: Video = { schemaVersion: "0.2", orientation: "landscape", style: TEST_VIDEO_STYLE,
    scenes: [{ id: "scene1", templateId: "chapterTitle", variables: { title: "A useful fact" }, narration: "Repeated line.", timing: { fixedDuration: 4 } }] };
  const data = [
    { type: "response.start", data: { requestId: "run1", format: { orientation: "landscape" }, style: TEST_VIDEO_STYLE, capabilities: { templates: ["chapterTitle"] } } },
    { type: "scene.add", data: { scene: snapshot.scenes[0], position: 0 } },
    { type: "response.complete", data: { finishReason: "stop", snapshot, checksum: checksumVideo(snapshot) } },
  ].map((event, sequence) => ({ protocolVersion: "0.6", eventId: `run1:${sequence}`, runId: "run1", sequence, ...event }));
  return new Response(data.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream", "x-briefings-video-stream": "0.6" },
  });
}

it("explicit narration retry recovers failed audio while retaining the existing video; ordinary replay and resume keep it cached", async () => {
  const speech = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockImplementation(async () => audio());
  const voice = createVideoChatVoice({ fetcher: speech });
  const resetFailures = vi.spyOn(voice, "clearFailedPreparations");
  const fetcher: typeof fetch = async input => {
    const action = new URL(String(input), "https://app.example").searchParams.get("action");
    if (action === "response") return stream();
    if (action === "capabilities") return Response.json({ templates: true, generatedSpeech: true, modes: ["cinematic"] });
    if (action === "welcome") return Response.json({ hero: null, cards: [] });
    if (action === "suggestions") return Response.json({ suggestions: [] });
    return new Response(null, { status: 404 });
  };
  const { result } = renderHook(() => useVideoChat({ fetcher, voice }));
  await act(async () => { await result.current.ask("Explain this"); });
  expect(speech).toHaveBeenCalledTimes(1);
  expect(resetFailures).toHaveBeenCalledTimes(1);
  act(() => { result.current.pause(); result.current.resume(); result.current.replay(); });
  expect(resetFailures).toHaveBeenCalledTimes(1);
  expect(speech).toHaveBeenCalledTimes(1);
  act(() => result.current.retryNarration());
  expect(resetFailures).toHaveBeenCalledTimes(2);
  await voice.prepare("Repeated line.");
  expect(result.current.turns).toHaveLength(1);
  expect(speech).toHaveBeenCalledTimes(2);
  expect(await voice.prepare("Repeated line.")).toMatchObject({ supportsOffsets: true });
  voice.dispose?.();
});

it("keeps prepared speech when the browser refuses autoplay, but drops it after a real playback failure", async () => {
  for (const [cause, keeps] of [[new DOMException("Autoplay is blocked", "NotAllowedError"), true], [new Error("Decoder failed"), false]] as const) {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(cause);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    const fetcher = vi.fn(async () => audio());
    const onFallback = vi.fn();
    const voice = createVideoChatVoice({ fetcher, onFallback });
    expect(await voice.prepare("Hello there.")).toMatchObject({ supportsOffsets: true });
    await voice.speak("Hello there.", { signal: new AbortController().signal });
    expect(onFallback).toHaveBeenCalledTimes(1);
    const again = await voice.prepare("Hello there.");
    if (keeps) expect(again).toMatchObject({ seconds: 2, supportsOffsets: true });
    else expect(again).not.toHaveProperty("supportsOffsets");
    expect(fetcher).toHaveBeenCalledTimes(1);
    voice.dispose?.();
    vi.restoreAllMocks();
  }
});
