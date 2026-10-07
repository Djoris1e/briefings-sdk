import { afterEach, describe, expect, it, vi } from "vitest";
import { createVideoChatHandler } from "../src/server/create-video-chat-handler";
import { decodeVideoSse } from "../src/protocol/sse";
import type { VideoEvent } from "../src/protocol/events";

type Options = Parameters<typeof createVideoChatHandler>[0];
const template = (title: string) => ({ title, subject: title, action: "", narration: `${title} explains the supplied facts clearly.`, visual: { templateId: "chapterTitle", variables: { title } } });
const footage = (source: string, title: string) => ({ title, subject: title, action: "A clear action illustrates this point.", narration: `${title} shows this detail.`, footageSource: source });
const generated = { type: "video" as const, url: "https://media.example/generated.mp4", durationSec: 8 };
const stock = { type: "video" as const, url: "https://videos.pexels.com/stock.mp4", durationSec: 18 };
function setup(body: object[], extra: Partial<Options> = {}) {
  const shots = [template("Opening fact"), template("Important condition"), ...body, template("Useful next step")];
  const generateVideo = vi.fn<NonNullable<Options["generateVideo"]>>(() => generated);
  const searchMedia = vi.fn<NonNullable<Options["searchMedia"]>>(() => stock);
  const generateText = vi.fn(() => "A short complete detail.");
  const handler = createVideoChatHandler({ authorize: "none", hybrid: true, heartbeatMs: false,
    generatedClipDurationSec: 8, firstGeneratedClipDurationSec: 5, generateVideo, searchMedia, generateText,
    streamText: async function* () {
      yield JSON.stringify({ type: "answer", intent: "explanation", opening: "", subject: "supplied facts", development: "Explain each fact.", visualDirection: "Natural light." }) + "\n";
      yield JSON.stringify({ type: "shot", ...shots[0] }) + "\n";
      yield JSON.stringify({ type: "ending", ...shots.at(-1) }) + "\n";
      for (const shot of shots.slice(1, -1)) yield JSON.stringify({ type: "shot", ...shot }) + "\n";
    }, ...extra,
  });
  const start = (signal?: AbortSignal) => handler(new Request("https://app.example/api?action=response", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Explain the supplied facts.", mode: "cinematic" }), signal,
  }));
  return { start, generateVideo, searchMedia, generateText };
}
async function collect(response: Response, events: VideoEvent[] = []) {
  for await (const event of decodeVideoSse(response.body!)) events.push(event);
  return events;
}
const scenes = (events: VideoEvent[]) => events.flatMap(event => event.type === "scene.add" ? [event.data.scene] : []);
afterEach(() => vi.useRealTimers());

describe("stock scenes in a generated hybrid film", () => {
  it("keeps templates, stock and generated shots in narrative order and counts only generated clips", async () => {
    const test = setup([
      footage("stock", "Team discussion"), footage("generated", "Hidden mechanism"),
      footage("stock", "Laptop work"), footage("generated", "Abstract connection"),
      footage("generated", "Future possibility"), footage("generated", "Over allowance"),
    ]);
    const events = await collect(await test.start());
    expect(scenes(events).map(scene => scene.variables.mediaUrl ?? scene.templateId)).toEqual([
      "chapterTitle", "chapterTitle", stock.url, generated.url, stock.url, generated.url, generated.url, "chapterTitle", "chapterTitle",
    ]);
    expect(test.searchMedia).toHaveBeenCalledTimes(2);
    expect(test.generateVideo).toHaveBeenCalledTimes(3);
    expect(test.generateVideo.mock.calls.map(([, context]) => context.requestedDurationSec)).toEqual([5, 8, 8]);
    expect(scenes(events).every(scene => !("footageSource" in scene.variables))).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "response.complete", data: { finishReason: "stop" } });
  });

  it("retains stock choices after a smaller generated allowance is spent", async () => {
    const test = setup([footage("generated", "Mechanism"), footage("generated", "Excess"), footage("stock", "Team discussion")], { maxGeneratedVideos: 1 });
    const events = await collect(await test.start());
    expect(test.generateVideo).toHaveBeenCalledOnce();
    expect(test.searchMedia).toHaveBeenCalledOnce();
    expect(scenes(events)[3]?.templateId).toBe("chapterTitle");
    expect(scenes(events)[4]?.variables.mediaUrl).toBe(stock.url);
  });

  it("keeps stock source hints literal and fits narration against actual stock duration", async () => {
    const narration = "A team reviews the supplied document together before deciding which practical step to take next.";
    const selection = { subject: "team", activity: "reviewing document", equipment: "laptop", exclude: ["sports"] };
    const test = setup([{ ...footage("stock", "Team discussion"), narration, stockSelection: selection }]);
    const events = await collect(await test.start());
    expect(test.searchMedia.mock.calls[0]?.[0]).toBe("Team discussion");
    expect(test.searchMedia.mock.calls[0]?.[1].scene?.variables.stockSelection).toEqual(selection);
    expect(test.searchMedia.mock.calls[0]?.[1].generatedLook).toBeUndefined();
    expect(test.generateText).not.toHaveBeenCalled();
    expect(scenes(events)[2]?.narration).toBe(narration);
    expect(scenes(events)[2]?.variables.mediaDurationSec).toBe(18);
  });

  it.each([false, true])("a stock miss recovers as authored text without generating a replacement (configured=%s)", async configured => {
    const test = setup([footage("stock", "Team discussion")], { searchMedia: configured ? () => null : undefined });
    const events = await collect(await test.start());
    expect(test.generateVideo).not.toHaveBeenCalled();
    expect(scenes(events)[2]).toMatchObject({ templateId: "chapterTitle", narration: "Team discussion shows this detail." });
  });

  it("a generated failure does not silently become stock footage", async () => {
    const test = setup([footage("generated", "Hidden mechanism")], { generateVideo: () => null });
    const events = await collect(await test.start());
    expect(test.searchMedia).not.toHaveBeenCalled();
    expect(scenes(events)[2]?.templateId).toBe("chapterTitle");
  });

  it("invalid footage selectors retain the authored beat without calling either media provider", async () => {
    const test = setup([footage("https://untrusted.example", "Useful fact")]);
    const events = await collect(await test.start());
    expect(test.searchMedia).not.toHaveBeenCalled();
    expect(test.generateVideo).not.toHaveBeenCalled();
    expect(scenes(events)[2]?.narration).toBe("Useful fact shows this detail.");
    expect(JSON.stringify(events)).not.toContain("untrusted.example");
  });

  it("slow stock resolves to a chapter within the existing three-second bound", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const test = setup([footage("stock", "Team discussion")], { searchMedia: (_query, context) => { signal = context.signal; return new Promise(() => {}); } });
    const events: VideoEvent[] = [];
    const finished = collect(await test.start(), events);
    await vi.advanceTimersByTimeAsync(1);
    expect(scenes(events)).toHaveLength(2);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    await finished;
    expect(signal?.aborted).toBe(true);
    expect(scenes(events)[2]?.templateId).toBe("chapterTitle");
    expect(scenes(events).at(-1)?.variables.title).toBe("Useful next step");
  });

  it("cancels a stock request when its owning answer is cancelled", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let signal: AbortSignal | undefined;
    const test = setup([footage("stock", "Team discussion")], { searchMedia: (_query, context) => { signal = context.signal; return new Promise(() => {}); } });
    const finished = collect(await test.start(controller.signal)).catch(() => []);
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(1);
    await finished;
    expect(signal?.aborted).toBe(true);
    expect(test.generateVideo).not.toHaveBeenCalled();
  });
});
