import { expect, it, vi } from "vitest";
import { createVideoChatHandler } from "../src/server/create-video-chat-handler";
import { decodeVideoSse } from "../src/protocol/sse";
import type { ScreenshotAsset } from "../src/briefing/types";

type Options = Parameters<typeof createVideoChatHandler>[0];
const beat = (title: string, visual: object = { templateId: "chapterTitle", variables: { title } }) => ({
  title, narration: `${title} lets the team review source material before making its next decision.`,
  subject: "team reviewing documents", action: "A team reviews documents together.", visual,
});
const pure = (title: string) => beat(title, { templateId: "cinemaMedia", variables: {} });
async function run(shots: object[], extra: Partial<Options> = {}, screenshots: ScreenshotAsset[] = []) {
  const generateVideo = vi.fn<NonNullable<Options["generateVideo"]>>(() => ({ type: "video", url: "https://media.example/ai.mp4", durationSec: 8 }));
  const searchMedia = vi.fn<NonNullable<Options["searchMedia"]>>(() => ({ type: "video", url: "https://media.example/stock.mp4", durationSec: 16 }));
  const handler = createVideoChatHandler({ authorize: "none", hybrid: true, mediaLed: true, heartbeatMs: false,
    firstGeneratedClipDurationSec: 5, generatedClipDurationSec: 8, generateVideo, searchMedia,
    generateText: () => { throw Error("Do not rewrite factual narration"); },
    streamText: async function* () {
      yield JSON.stringify({ type: "answer", opening: "", subject: "team reviewing documents", development: "Review then decide" }) + "\n";
      for (const [index, shot] of shots.entries()) yield JSON.stringify({ ...shot, type: index === shots.length - 1 ? "ending" : "shot" }) + "\n";
    }, ...extra });
  const response = await handler(new Request("https://app.example/api?action=response", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Explain the supplied facts.", screenshots }) }));
  const events = []; for await (const event of decodeVideoSse(response.body!)) events.push(event);
  expect(events.at(-1)).toMatchObject({ type: "response.complete", data: { finishReason: "stop" } });
  return { scenes: events.flatMap(event => event.type === "scene.add" ? [event.data.scene] : []), generateVideo, searchMedia };
}

it("breaks a third repeated generic layout with clean footage and keeps all spoken facts", async () => {
  const shots = ["Review sources", "Discuss findings", "Compare outcomes", "Choose next steps", "Closing"].map(title => beat(title));
  const { scenes } = await run(shots);
  expect(scenes.map(scene => scene.templateId)).toEqual(["chapterTitle", "chapterTitle", "cinemaMedia", "chapterTitle", "chapterTitle"]);
  expect(scenes.map(scene => scene.narration)).toEqual(shots.map(shot => shot.narration));
  expect(scenes[2].variables).toMatchObject({ mediaUrl: "https://media.example/stock.mp4", fallbackText: "Compare outcomes" });
  expect(scenes[2].variables).not.toHaveProperty("title");
});

it("retains display-only facts, exact values and specialized layouts instead of forcing variety", async () => {
  const shots = [beat("Opening"), beat("Context"), beat("42% improvement"),
    beat("Separate display fact", { templateId: "textMedia", variables: { title: "Display fact", body: "This fact is absent from the narration." } }),
    beat("Again", { templateId: "textMedia", variables: { title: "Again", body: "Distinct display fact." } }),
    beat("Still visible", { templateId: "textMedia", variables: { title: "Still visible", body: "Another exact qualification." } }),
    beat("Source quote", { templateId: "quote", variables: { quote: "Keep a human reviewer.", attribution: "Supplied source" } }), beat("Closing")];
  const { scenes } = await run(shots);
  expect(scenes.map(scene => scene.templateId)).toEqual(shots.map(shot => (shot.visual as { templateId: string }).templateId));
  scenes.forEach((scene, index) => expect(scene.variables).toMatchObject((shots[index].visual as { variables: object }).variables));
});

it("accepts deliberate pure footage, honors explicit stock and caps later paid clips", async () => {
  const shots = [pure("Opening"), pure("Context"), pure("Sources"), { ...pure("Real team work"), footageSource: "stock" },
    ...["Illustration one", "Illustration two", "Illustration three", "Extra illustration"].map(title => ({ ...pure(title), footageSource: "generated" })), pure("Closing")];
  const { scenes, searchMedia, generateVideo } = await run(shots);
  expect(scenes.every(scene => scene.templateId === "cinemaMedia")).toBe(true);
  expect(scenes[3].variables.mediaUrl).toBe("https://media.example/stock.mp4");
  expect(generateVideo).toHaveBeenCalledTimes(3);
  expect(searchMedia).toHaveBeenCalledTimes(6);
  expect(generateVideo.mock.calls.map(([, context]) => context.requestedDurationSec)).toEqual([5, 8, 8]);
  expect(scenes.map(scene => scene.narration)).toEqual(shots.map(shot => shot.narration));
});

it("recovers failed clean footage with the authored title and complete narration", async () => {
  const shots = [pure("Opening"), pure("Context"), pure("Sources"), pure("Later illustration"), pure("Closing")];
  const { scenes } = await run(shots, { searchMedia: () => null, generateVideo: () => null });
  expect(scenes.map(scene => scene.templateId)).toEqual(shots.map(() => "chapterTitle"));
  expect(scenes.map(scene => scene.variables)).toEqual(shots.map(shot => ({ title: shot.title })));
  expect(scenes.map(scene => scene.narration)).toEqual(shots.map(shot => shot.narration));
});

it("rejects authored media URLs and retains template-only behavior without media availability", async () => {
  const malicious = beat("Safe title", { templateId: "cinemaMedia", variables: { mediaUrl: "https://untrusted.example/video.mp4" } });
  const result = await run([malicious, pure("Closing")]);
  expect(result.scenes[0]).toMatchObject({ templateId: "chapterTitle", variables: { title: "Safe title" } });
  expect(result.searchMedia).toHaveBeenCalledOnce();
  expect(JSON.stringify(result.scenes)).not.toContain("untrusted.example");
  const unavailable = await run([pure("Opening"), pure("Closing")], { generateVideo: undefined, searchMedia: undefined });
  expect(unavailable.scenes.map(scene => scene.templateId)).toEqual(["chapterTitle", "chapterTitle"]);
});

it("uses a matching original image before stock or AI for deliberate clean source footage", async () => {
  const screenshot: ScreenshotAsset = { id: "teams-facilitator", url: "https://images.example/teams.png", alt: "Original Facilitator interface" };
  const result = await run([pure("Facilitator in Teams"), pure("Closing")], {}, [screenshot]);
  expect(result.scenes[0]).toMatchObject({ templateId: "screenshotSpotlight", variables: { sourceImageUrl: screenshot.url, screenshotAlt: screenshot.alt, screenshotId: screenshot.id, title: "Facilitator in Teams", caption: "Original source image" } });
  expect(result.generateVideo).not.toHaveBeenCalled();
  expect(result.searchMedia).toHaveBeenCalledOnce();
});


it("does not broaden the non-media-led contract to accept pure footage visuals", async () => {
  const result = await run([pure("Opening"), pure("Closing")], { mediaLed: false });
  expect(result.scenes.map(scene => scene.templateId)).toEqual(["chapterTitle", "chapterTitle"]);
  expect(result.generateVideo).not.toHaveBeenCalled();
  expect(result.searchMedia).not.toHaveBeenCalled();
});

it("varies repeated short textMedia copy only when its complete message remains in narration", async () => {
  const shots = ["Opening", "Context", "Evidence"].map(title => beat(title, { templateId: "textMedia", variables: { title, body: "review source material" } }));
  const result = await run([...shots, beat("Closing")], { generateVideo: undefined });
  expect(result.scenes.map(scene => scene.templateId)).toEqual(["textMedia", "textMedia", "cinemaMedia", "chapterTitle"]);
  expect(result.scenes[2].narration).toBe(shots[2].narration);
});
