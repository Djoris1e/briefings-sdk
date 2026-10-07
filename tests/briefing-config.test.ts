import { describe, expect, it } from "vitest";
import { defineBriefingConfig } from "../src/briefing/config";
import { createSpeechDucker } from "../src/player/speech-ducking";

describe("provider configuration", () => {
  it("keeps screenshot animation opt-in and separates podcast voices", () => {
    const defaults = defineBriefingConfig();
    expect(defaults.planner.provider).toBe("openai");
    expect(defaults.planner.model).toBe("gpt-6-sol");
    expect(defaults.planner.reasoningEffort).toBe("none");
    expect(defaults.speech.provider).toBe("openai");
    expect(defaults.speech.model).toBe("gpt-4o-mini-tts");
    expect(defaults.speech.narrator).toBe("marin");
    expect(defaults.speech.analyst).toBe("cedar");
    expect(defaults.video.provider).toBe("fal");
    expect(defaults.planner.briefingTimeoutMs).toBe(90_000);
    expect(defaults.video.timeoutMs).toBe(45_000);
    expect(defaults.video.animateScreenshots).toBe(false);
    expect(defaults.speech.host).not.toBe(defaults.speech.analyst);
    expect(defineBriefingConfig({ planner: { model: "custom-model" } }).speech).toEqual(defaults.speech);
  });
  it("rejects identical voices and unsupported provider payload schemas", () => {
    expect(() => defineBriefingConfig({ speech: { host: "marin", analyst: "marin" } })).toThrow();
    expect(() => defineBriefingConfig({ planner: { provider: "anthropic" as never } })).toThrow();
    expect(() => defineBriefingConfig({ speech: { provider: "xai" as never } })).toThrow();
    expect(() => defineBriefingConfig({ speech: { model: "tts-1" } })).toThrow();
    expect(() => defineBriefingConfig({ planner: { reasoningEffort: "unbounded" as never } })).toThrow();
    expect(defineBriefingConfig({ planner: { reasoningEffort: null } }).planner.reasoningEffort).toBeNull();
    expect(defineBriefingConfig({ speech: { model: "gpt-4o-mini-tts-2025-12-15" } }).speech.model).toBe("gpt-4o-mini-tts-2025-12-15");
    expect(() => defineBriefingConfig({ video: { model: "arbitrary" as never } })).toThrow();
    expect(() => defineBriefingConfig({ planner: { briefingTokens: 9000 } })).toThrow();
    for (const briefingTimeoutMs of [0, -1, NaN, Infinity, 120_001]) expect(() => defineBriefingConfig({ planner: { briefingTimeoutMs } })).toThrow();
    for (const timeoutMs of [0, -1, NaN, 60_001]) expect(() => defineBriefingConfig({ video: { timeoutMs } })).toThrow();
  });
});
it("ducks quickly, holds between words and releases smoothly", () => {
  const duck = createSpeechDucker();
  expect(duck(false, 0)).toBe(1);
  const speech = duck(true, 200);
  expect(speech).toBeLessThan(0.4);
  expect(duck(false, 350)).toBeLessThan(speech);
  const release = duck(false, 800);
  expect(release).toBeGreaterThan(speech);
  expect(release).toBeLessThan(1);
  expect(duck(false, 3000)).toBeGreaterThan(release);
});
