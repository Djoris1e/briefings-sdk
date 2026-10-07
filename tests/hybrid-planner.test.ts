import { afterEach, describe, expect, it, vi } from "vitest";
import { createVideoChatHandler } from "../src/server/create-video-chat-handler";
import { decodeVideoSse } from "../src/protocol/sse";
import type { VideoEvent } from "../src/protocol/events";

type Options = Parameters<typeof createVideoChatHandler>[0];
const brief = { type: "answer", intent: "explanation", musicMood: "off", opening: "The roots carry water.",
  subject: "growing plants", development: "Explain roots, leaves, light and growth.", visualDirection: "Natural plants in a sunlit garden." };
function shot(index: number, template = false) {
  return { type: "shot", title: `Plant detail ${index}`, subject: `plant detail ${index}`,
    narration: `At stage ${index}, roots carry water through the stem while leaves capture the sunlight needed for growth.`,
    action: "Water moves through the stem toward the leaves.", continuity: "cut",
    ...(template ? { visual: { templateId: "chapterTitle", variables: { title: `Plant detail ${index}` } } } : {}),
  };
}
function source(shots: ReturnType<typeof shot>[]): Options["streamText"] {
  return async function* () {
    yield JSON.stringify(brief) + "\n";
    if (shots.length > 1) yield JSON.stringify(shots[0]) + "\n";
    yield JSON.stringify({ ...shots.at(-1), type: "ending" }) + "\n";
    for (const value of shots.slice(1, -1)) yield JSON.stringify(value) + "\n";
  };
}
const media = { type: "video" as const, url: "https://media.example/plant.mp4", durationSec: 8 };
function setup(shots: ReturnType<typeof shot>[], extra: Partial<Options> = {}) {
  const generateVideo = vi.fn<NonNullable<Options["generateVideo"]>>(() => media);
  const generateText = vi.fn(() => "Roots carry water to growing leaves.");
  const handler = createVideoChatHandler({ authorize: "none", hybrid: true, heartbeatMs: false,
    generatedClipDurationSec: 8, firstGeneratedClipDurationSec: 5,
    streamText: source(shots), generateText, generateVideo, ...extra });
  const start = (signal?: AbortSignal) => handler(new Request("http://localhost/api?action=response", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Explain plant growth in roughly one minute." }), signal,
  }));
  return { start, generateVideo, generateText };
}
async function collect(response: Response, events: VideoEvent[] = []) {
  for await (const event of decodeVideoSse(response.body!)) events.push(event);
  return events;
}
const scenes = (events: VideoEvent[]) => events.flatMap(event => event.type === "scene.add" ? [event.data.scene] : []);
afterEach(() => vi.useRealTimers());

describe("progressive hybrid films", () => {
  it("delivers a useful first template while footage is pending, then falls back in story order by its deadline", async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    const values = [shot(1), shot(2), shot(3), shot(4, true)];
    const test = setup(values, { generateVideo: (_query, context) => {
      providerSignal = context.signal;
      return new Promise(() => {});
    } });
    const events: VideoEvent[] = [];
    const finished = collect(await test.start(), events);
    await vi.advanceTimersByTimeAsync(1);
    expect(scenes(events)).toHaveLength(2);
    expect(scenes(events)[0]).toMatchObject({ templateId: "chapterTitle", narration: values[0]!.narration });
    expect(events.some(event => event.type === "data.video-chat-opening")).toBe(false);
    expect(providerSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);
    await finished;
    expect(providerSignal?.aborted).toBe(true);
    expect(scenes(events).map(scene => scene.templateId)).toEqual(["chapterTitle", "chapterTitle", "chapterTitle", "chapterTitle"]);
    // Media narration may be shortened once; both authored template lines remain intact.
    expect(scenes(events)[0]?.narration).toBe(values[0]!.narration);
    expect(scenes(events)[1]?.narration).toBe(values[1]!.narration);
    expect(scenes(events)[3]?.narration).toBe(values[3]!.narration);
  });

  it("counts every preceding template as generation runway without allowing an unlimited provider wait", async () => {
    vi.useFakeTimers();
    const deadlines: number[] = [];
    const startedAt = Date.now();
    const test = setup([shot(1, true), shot(2, true), shot(3), shot(4, true)], {
      generateVideoTimeoutMs: 60_000,
      generateVideo: (_query, context) => { deadlines.push(context.deadlineAt - startedAt); return media; },
    });
    const events = await collect(await test.start());
    const firstTwo = scenes(events).slice(0, 2);
    const runwayMs = firstTwo.reduce((total, scene) => total + scene.timing.fixedDuration! * 1000, 0);
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]).toBeCloseTo(runwayMs - 1_000, 0);
    expect(deadlines[0]).toBeLessThan(30_000);
  });

  it.each([0, 1, 3, 5])("caps paid generation at three while honoring a smaller host allowance of %i", async allowance => {
    const test = setup(Array.from({ length: 7 }, (_, i) => shot(i + 1)), { maxGeneratedVideos: allowance });
    const events = await collect(await test.start());
    expect(test.generateVideo).toHaveBeenCalledTimes(Math.min(3, allowance));
    expect(scenes(events)).toHaveLength(7);
    expect(scenes(events)[0]?.templateId).toBe("chapterTitle");
    expect(scenes(events).slice(2 + Math.min(3, allowance)).every(scene => scene.templateId === "chapterTitle")).toBe(true);
    // All beats settled as templates retain their full narration and skip clip repair.
    expect(test.generateText.mock.calls.length).toBeLessThanOrEqual(Math.min(3, allowance));
  });

  it("preserves longer template narration and a minute-scale seven-beat plan without media or repair", async () => {
    const values = Array.from({ length: 7 }, (_, i) => shot(i + 1, true));
    const test = setup(values, { generateVideo: undefined });
    const events = await collect(await test.start());
    const completed = scenes(events);
    expect(completed.map(scene => scene.narration)).toEqual(values.map(value => value.narration));
    expect(test.generateVideo).not.toHaveBeenCalled();
    expect(test.generateText).not.toHaveBeenCalled();
    const seconds = completed.reduce((sum, scene) => sum + scene.timing.fixedDuration!, 0);
    expect(seconds).toBeGreaterThanOrEqual(45);
    expect(seconds).toBeLessThanOrEqual(75);
    expect(events.at(-1)).toMatchObject({ type: "response.complete", data: { finishReason: "stop" } });
  });

  it("recovers an invalid visual as an authored chapter without losing narration or retaining unsafe variables", async () => {
    const values = [shot(1, true), { ...shot(2, true), visual: { templateId: "chapterTitle", variables: { title: "Valid title", mediaUrl: "https://untrusted.example" } } }, shot(3, true)];
    const test = setup(values);
    const events = await collect(await test.start());
    expect(test.generateVideo).not.toHaveBeenCalled();
    expect(scenes(events).map(scene => scene.narration)).toEqual(values.map(value => value.narration));
    expect(scenes(events).map(scene => scene.templateId)).toEqual(["chapterTitle", "chapterTitle", "chapterTitle"]);
    expect(JSON.stringify(events)).not.toContain("untrusted.example");
    expect(events.at(-1)).toMatchObject({ type: "response.complete", data: { finishReason: "stop" } });
  });

  it("cancels pending footage when the response is aborted", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    let providerSignal: AbortSignal | undefined;
    const test = setup([shot(1, true), shot(2, true), shot(3), shot(4, true)], {
      generateVideo: (_query, context) => { providerSignal = context.signal; return new Promise(() => {}); },
    });
    const events: VideoEvent[] = [];
    const finished = collect(await test.start(abort.signal), events).catch(() => events);
    await vi.advanceTimersByTimeAsync(1);
    expect(providerSignal).toBeDefined();
    abort.abort();
    await vi.advanceTimersByTimeAsync(1);
    await finished;
    expect(providerSignal!.aborted).toBe(true);
    expect(scenes(events)).toHaveLength(2);
  });

  it("has a ten-scene bound independent of provider output", async () => {
    const values = Array.from({ length: 14 }, (_, i) => ({ ...shot(i + 1, true), narration: `Plant stage ${i + 1} brings new growth.` }));
    const test = setup(values);
    const events = await collect(await test.start());
    expect(scenes(events)).toHaveLength(10);
    expect(scenes(events).at(-1)?.narration).toBe(values.at(-1)?.narration);
  });

});
