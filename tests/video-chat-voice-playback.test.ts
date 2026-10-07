import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps native pitch and source time while opt-in metering reads real signal samples", async () => {
  vi.useFakeTimers(); vi.resetModules();
  const element = { src: "", volume: 1, muted: false, paused: true, preservesPitch: false, playbackRate: 1, currentTime: 0,
    onplaying: null as (() => void) | null, onended: null as (() => void) | null,
    play: vi.fn(async () => { element.paused = false; }), pause: vi.fn(() => { element.paused = true; }), removeAttribute: vi.fn(), load: vi.fn() };
  const analyser = { fftSize: 0, smoothingTimeConstant: 0, connect: vi.fn(), disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn((samples: Float32Array) => samples.forEach((_sample, index) => { samples[index] = index % 2 ? .5 : -.5; })) };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const gain = { gain: { cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
  const createSource = vi.fn(() => source);
  vi.stubGlobal("Audio", function () { return element; });
  vi.stubGlobal("navigator", { userActivation: { isActive: true }, platform: "Linux" });
  vi.stubGlobal("AudioContext", class {
    state = "running"; currentTime = 0; destination = {};
    resume = vi.fn(async () => {}); close = vi.fn(async () => {});
    decodeAudioData = vi.fn(async () => ({ duration: 6 }));
    createMediaElementSource = createSource; createGain = () => gain; createAnalyser = () => analyser;
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:generated-voice");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const { createVideoChatVoice } = await import("../src/video-chat/voice");
  const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2])));
  const voice = createVideoChatVoice({ enableAudioLevel: true, fetcher });
  voice.setPlaybackRate?.(1.5); voice.resume();
  await vi.advanceTimersByTimeAsync(0);
  const task = voice.speak("A native measured line.", { signal: new AbortController().signal });
  await vi.advanceTimersByTimeAsync(0);
  expect(element.preservesPitch).toBe(true);
  expect(element.playbackRate).toBe(1.5);
  expect(voice.getAudioLevel?.()).toBe(0);
  element.currentTime = .1; element.onplaying?.();
  expect(voice.getAudioLevel?.()).toBe(.5);
  expect(createSource).toHaveBeenCalledOnce();
  expect(gain.connect).toHaveBeenCalledWith(analyser);
  voice.setPlaybackRate?.(99); expect(element.playbackRate).toBe(2);
  voice.setPlaybackRate?.(-1); expect(element.playbackRate).toBe(.5);
  voice.setPlaybackRate?.(NaN); expect(element.playbackRate).toBe(.5);
  expect(voice.getCurrentTime?.()).toBe(.1);
  voice.pause(); expect(voice.getAudioLevel?.()).toBe(0);
  voice.resume(); await vi.advanceTimersByTimeAsync(0);
  expect(voice.getAudioLevel?.()).toBe(.5);
  voice.setMuted(true); expect(voice.getAudioLevel?.()).toBe(0);
  voice.setMuted(false);
  element.onended?.(); await task;
  expect(voice.getAudioLevel?.()).toBe(0);
  voice.dispose?.(); expect(analyser.disconnect).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledOnce();
});
