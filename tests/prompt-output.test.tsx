// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CreateVideoChatVoiceOptions, VideoChatVoice } from "../src/video-chat/voice";
import type { PreparedBriefing } from "../src/briefing/types";
import { usePromptOutput } from "../src/briefing/use-prompt-output";

const factory = vi.hoisted(() => vi.fn());
vi.mock("../src/video-chat/voice", () => ({ createVideoChatVoice: factory }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function voice() {
  return {
    prepare: vi.fn<VideoChatVoice["prepare"]>().mockResolvedValue({ seconds: 2 }),
    speak: vi.fn<VideoChatVoice["speak"]>().mockResolvedValue(),
    pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(), setMuted: vi.fn(),
  };
}
function briefing(prompt = "Wind powers waves."): PreparedBriefing {
  return { version: 1, id: "brief", prompt, summary: "Wind gives waves their energy. Review the water's movement.",
    facts: [{ id: "fact1", text: "Wind powers waves.", evidence: prompt }],
    priorities: [{ factIds: ["fact1"], relevance: "Understand waves.", action: "Observe moving water." }],
    podcast: { turns: [
      { id: "turn1", speaker: "host", text: "What powers waves?", factIds: [] },
      { id: "turn2", speaker: "analyst", text: "Wind gives waves their energy.", factIds: ["fact1"] },
      { id: "turn3", speaker: "host", text: "What should we look for?", factIds: [] },
      { id: "turn4", speaker: "analyst", text: "Observe how the water moves.", factIds: ["fact1"] },
    ] }, screenshots: [] };
}
let voices: { host: ReturnType<typeof voice>; analyst: ReturnType<typeof voice> };
beforeEach(() => {
  voices = { host: voice(), analyst: voice() };
  factory.mockReset().mockImplementation((options: CreateVideoChatVoiceOptions) => voices[options.speaker!]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("prepares one canonical briefing for all formats and keeps the summary separate from dialogue", async () => {
  const prepared = briefing();
  const fetcher = vi.fn().mockResolvedValue(Response.json(prepared));
  vi.stubGlobal("fetch", fetcher);
  const onPrepared = vi.fn();
  const { result } = renderHook(() => usePromptOutput());
  await act(() => result.current.generate(prepared.prompt, "text", { onPrepared }));
  expect(result.current.text).toBe(prepared.summary);
  expect(result.current.text).not.toContain(prepared.podcast.turns[0].text);
  expect(result.current.briefing).toEqual(prepared);
  expect(onPrepared).toHaveBeenCalledWith(prepared);
  expect(factory.mock.calls.map(([options]) => options.speaker)).toEqual(["host", "analyst"]);
  expect(voices.host.prepare).toHaveBeenCalledTimes(1);
  expect(voices.analyst.prepare).toHaveBeenCalledTimes(1);
  expect(voices.host.speak).not.toHaveBeenCalled();
  expect(result.current.status).toBe("ready");
  await act(() => result.current.generate(prepared.prompt, "podcast"));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("/api/video-chat?action=briefing");
});

it("notifies video before waiting for audio and bounds initial preparation to two turns", async () => {
  const audio = deferred<{ seconds: number }>();
  voices.host.prepare.mockReturnValue(audio.promise);
  voices.analyst.prepare.mockReturnValue(audio.promise);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(briefing())));
  const onPrepared = vi.fn();
  const { result } = renderHook(() => usePromptOutput());
  let pending!: Promise<void>;
  act(() => { pending = result.current.generate("Wind powers waves.", "podcast", { onPrepared }); });
  await waitFor(() => expect(onPrepared).toHaveBeenCalledTimes(1));
  expect(result.current.text).toBe(briefing().summary);
  expect(result.current.status).toBe("preparing");
  expect(voices.host.prepare).toHaveBeenCalledTimes(1);
  expect(voices.analyst.prepare).toHaveBeenCalledTimes(1);
  await act(async () => { audio.resolve({ seconds: 2 }); await pending; });
  expect(result.current.status).toBe("ready");
});

it("plays complete alternating turns sequentially with speaker-aware preparation", async () => {
  const prepared = briefing();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(prepared)));
  const spoken: Array<{ speaker: string; text: string }> = [];
  let concurrent = 0;
  let peak = 0;
  for (const speaker of ["host", "analyst"] as const) voices[speaker].speak.mockImplementation(async text => {
    peak = Math.max(peak, ++concurrent);
    spoken.push({ speaker, text });
    await Promise.resolve();
    concurrent--;
  });
  const { result } = renderHook(() => usePromptOutput());
  await act(() => result.current.generate(prepared.prompt, "podcast"));
  await act(() => result.current.play());
  expect(spoken).toEqual(prepared.podcast.turns.map(({ speaker, text }) => ({ speaker, text })));
  expect(peak).toBe(1);
  expect(voices.host.prepare.mock.calls.map(([text]) => text)).toEqual([prepared.podcast.turns[0].text, prepared.podcast.turns[2].text]);
  expect(voices.analyst.prepare.mock.calls.map(([text]) => text)).toEqual([prepared.podcast.turns[1].text, prepared.podcast.turns[3].text]);
  expect(result.current.status).toBe("ended");
  expect(result.current.speaker).toBeUndefined();
  expect(result.current.turnIndex).toBe(3);
});

it("does not reuse the other speaker's audio when both say the same words", async () => {
  const prepared = briefing();
  prepared.podcast.turns[1].text = prepared.podcast.turns[0].text;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(prepared)));
  const { result } = renderHook(() => usePromptOutput());
  await act(() => result.current.generate(prepared.prompt, "podcast"));
  await act(() => result.current.play());
  expect(voices.host.prepare.mock.calls[0][0]).toBe(voices.analyst.prepare.mock.calls[0][0]);
  expect(voices.host.speak.mock.calls[0][0]).toBe(voices.analyst.speak.mock.calls[0][0]);
  expect(factory.mock.calls[0][0].speaker).not.toBe(factory.mock.calls[1][0].speaker);
});

it("cancels a replaced request even when its transport ignores abort and rejects stale callbacks", async () => {
  const old = deferred<Response>();
  const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(Response.json(briefing("New prompt")));
  vi.stubGlobal("fetch", fetcher);
  const staleCallback = vi.fn();
  const { result } = renderHook(() => usePromptOutput());
  let previous!: Promise<void>;
  act(() => { previous = result.current.generate("Old prompt", "podcast", { onPrepared: staleCallback }); });
  await act(() => result.current.generate("New prompt", "podcast"));
  await previous;
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => { old.resolve(Response.json(briefing("Old prompt"))); await Promise.resolve(); });
  expect(result.current.briefing?.prompt).toBe("New prompt");
  expect(result.current.status).toBe("ready");
  expect(staleCallback).not.toHaveBeenCalled();
});

it("stop aborts pending audio without losing the canonical summary", async () => {
  const loading = deferred<{ seconds: number }>();
  voices.host.prepare.mockReturnValue(loading.promise);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(briefing())));
  const { result } = renderHook(() => usePromptOutput());
  let generating!: Promise<void>;
  act(() => { generating = result.current.generate("Wind powers waves.", "podcast"); });
  await waitFor(() => expect(result.current.status).toBe("preparing"));
  act(() => result.current.stop());
  await generating;
  expect(voices.host.prepare.mock.calls[0][1]!.signal!.aborted).toBe(true);
  await act(async () => { loading.resolve({ seconds: 2 }); await Promise.resolve(); });
  expect(result.current.status).toBe("idle");
  expect(result.current.text).toBe(briefing().summary);
  expect(voices.host.dispose).toHaveBeenCalledOnce();
  expect(voices.analyst.dispose).toHaveBeenCalledOnce();
});

it("unmount aborts active playback and settles Play without late updates", async () => {
  const speaking = deferred<void>();
  voices.host.speak.mockReturnValue(speaking.promise);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(briefing())));
  const { result, unmount } = renderHook(() => usePromptOutput());
  await act(() => result.current.generate("Wind powers waves.", "podcast"));
  let playing!: Promise<void>;
  act(() => { playing = result.current.play(); });
  await waitFor(() => expect(voices.host.speak).toHaveBeenCalledOnce());
  unmount();
  await playing;
  expect(voices.host.speak.mock.calls[0][1].signal.aborted).toBe(true);
  expect(voices.host.dispose).toHaveBeenCalledOnce();
  expect(voices.analyst.speak).not.toHaveBeenCalled();
  speaking.resolve();
});

it("retains readable text when either podcast voice falls back", async () => {
  factory.mockImplementation((options: CreateVideoChatVoiceOptions) => {
    if (options.speaker === "analyst") voices.analyst.prepare.mockImplementation(async () => { options.onFallback?.(); return { seconds: 2 }; });
    return voices[options.speaker!];
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(briefing())));
  const { result } = renderHook(() => usePromptOutput());
  await act(() => result.current.generate("Wind powers waves.", "podcast"));
  expect(result.current.status).toBe("error");
  expect(result.current.error).toMatch(/speech is unavailable/);
  expect(result.current.text).toBe(briefing().summary);
  expect(result.current.briefing?.podcast.turns).toHaveLength(4);
});

it("pause holds the speaker handoff until resume", async () => {
  const firstSpeech = deferred<void>();
  voices.host.speak.mockReturnValueOnce(firstSpeech.promise);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(briefing())));
  const { result } = renderHook(() => usePromptOutput());
  await act(() => result.current.generate("Wind powers waves.", "podcast"));
  let playing!: Promise<void>;
  act(() => { playing = result.current.play(); });
  await waitFor(() => expect(voices.host.speak).toHaveBeenCalledOnce());
  expect(result.current.speaker).toBe("host");
  act(() => result.current.pause());
  expect(result.current.status).toBe("paused");
  await act(async () => { firstSpeech.resolve(); await Promise.resolve(); });
  expect(voices.analyst.speak).not.toHaveBeenCalled();
  await act(async () => { result.current.resume(); await playing; });
  expect(result.current.status).toBe("ended");
  expect(voices.host.pause).toHaveBeenCalledOnce();
  expect(voices.analyst.pause).toHaveBeenCalledOnce();
});

it("uses the host endpoint and asset metadata and invalidates cached briefs when screenshots change", async () => {
  const screenshots = [{ id: "screen", url: "https://cdn.example.com/product.png", alt: "Approved product screen" }];
  const fetcher = vi.fn().mockImplementation(async (_url, options) => Response.json({ ...briefing(), screenshots: JSON.parse(options.body).screenshots }));
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(() => usePromptOutput({ endpoint: "/host/output?session=local" }));
  await act(() => result.current.generate("Wind powers waves.", "podcast", { screenshots }));
  expect(fetcher.mock.calls[0][0]).toBe("/host/output?session=local&action=briefing");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ prompt: "Wind powers waves.", screenshots });
  expect(factory.mock.calls[0][0].endpoint).toBe("/host/output?session=local");
  await act(() => result.current.generate("Wind powers waves.", "podcast", { screenshots: [] }));
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("seeks across prepared speakers without new synthesis or stale turn advancement", async () => {
  for (const sink of Object.values(voices)) {
    sink.prepare.mockResolvedValue({ seconds: 12, supportsOffsets: true });
    sink.speak.mockImplementation(() => new Promise<void>(() => {}));
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(briefing())));
  const { result } = renderHook(() => usePromptOutput());
  await act(() => result.current.generate("Wind powers waves."));
  expect(result.current.seekableDuration).toBe(24);
  let initial!: Promise<void>;
  act(() => { initial = result.current.play(); });
  await waitFor(() => expect(voices.host.speak).toHaveBeenCalledTimes(1));
  const oldSignal = voices.host.speak.mock.calls[0][1].signal;
  act(() => result.current.seek(15));
  await initial;
  await waitFor(() => expect(voices.analyst.speak).toHaveBeenCalledTimes(1));
  expect(oldSignal.aborted).toBe(true);
  expect(voices.analyst.speak.mock.calls[0][1].offsetSeconds).toBe(3);
  expect(result.current.turnIndex).toBe(1);
  expect(result.current.currentTime).toBe(15);
  expect(voices.analyst.prepare).toHaveBeenCalledTimes(1);
  act(() => result.current.pause());
  act(() => result.current.seek(4));
  expect(result.current.status).toBe("paused");
  expect(result.current.currentTime).toBe(4);
  expect(voices.host.speak).toHaveBeenCalledTimes(1);
  act(() => result.current.resume());
  await waitFor(() => expect(voices.host.speak).toHaveBeenCalledTimes(2));
  expect(voices.host.speak.mock.calls[1][1].offsetSeconds).toBe(4);
});

it("keeps seek within measured audio and preserves rate across new briefings", async () => {
  const hostRate = vi.fn(), analystRate = vi.fn();
  Object.assign(voices.host, { setPlaybackRate: hostRate });
  Object.assign(voices.analyst, { setPlaybackRate: analystRate });
  voices.host.prepare.mockResolvedValue({ seconds: 8, supportsOffsets: true });
  voices.analyst.prepare.mockResolvedValue({ seconds: 9, supportsOffsets: false });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, init) => Response.json(briefing(JSON.parse(init.body).prompt))));
  const { result } = renderHook(() => usePromptOutput());
  await act(() => result.current.generate("Wind powers waves."));
  expect(result.current.durationEstimated).toBe(true);
  expect(result.current.seekableDuration).toBe(8);
  act(() => result.current.seek(100));
  expect(result.current.currentTime).toBeCloseTo(7.99);
  expect(result.current.turnIndex).toBe(0);
  expect(voices.host.speak).not.toHaveBeenCalled();
  act(() => result.current.setPlaybackRate(1.5));
  expect(hostRate).toHaveBeenLastCalledWith(1.5);
  expect(analystRate).toHaveBeenLastCalledWith(1.5);
  await act(() => result.current.generate("Another briefing"));
  expect(result.current.playbackRate).toBe(1.5);
  expect(hostRate).toHaveBeenLastCalledWith(1.5);
});
