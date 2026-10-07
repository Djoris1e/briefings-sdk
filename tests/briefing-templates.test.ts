import { describe, expect, it, vi } from "vitest";
import { createVideoChatHandler } from "../src/server/create-video-chat-handler";
import { decodeVideoSse } from "../src/protocol/sse";
import { parseEditorialVisual } from "../src/visual-system/catalog/editorial-visual";
import { validateBuiltinScene } from "../src/server/scene-validation";
import { parseResponseRequest, parseSpeechRequest } from "../src/server/video-chat-input";
import type { VideoScene } from "../src/protocol/types";

type Options = Parameters<typeof createVideoChatHandler>[0];
const screenshot = { id: "notebook", url: "https://images.example/notebook.png", alt: "Actual notebook interface", sourceUrl: "https://example.com/release" };
const opening = { templateId: "personalRelevance", variables: { person: "Maya", goal: "Prepare a renewal", why: "Review approved source material before making commitments." } };
const split = { templateId: "textMedia", variables: { title: "Review together", body: "A human checks every customer commitment." } };
const spotlight = { templateId: "screenshotSpotlight", variables: { screenshotId: "notebook", title: "The original interface", caption: "A supplied source screenshot, not generated UI." } };
const ending = { templateId: "actionSteps", variables: { title: "Your next move", steps: [{ label: "Choose", detail: "Select one synthetic account." }, { label: "Review", detail: "Check sources and qualifiers." }] } };
const narration = "Review every customer commitment against approved sources, and preserve the limiting conditions before asking a human owner to approve the next step.";
async function run(visuals: unknown[], options: Partial<Options> = {}, screenshots: unknown[] = []) {
  const generateText = vi.fn(() => "Unsafe abbreviated substitute.");
  const handler = createVideoChatHandler({ authorize: "none", hybrid: true, heartbeatMs: false, generateText,
    streamText: async function* () {
      yield JSON.stringify({ type: "answer", intent: "practical", opening: "", subject: "account review", development: "Review sources and commitments", visualDirection: "A grounded briefing." }) + "\n";
      for (const [index, visual] of visuals.entries()) yield JSON.stringify({ type: index === visuals.length - 1 ? "ending" : "shot", title: `Useful point ${index}`, subject: "team document review", narration: `${narration} ${index}`, action: "People review a document.", visual, footageSource: "stock" }) + "\n";
    }, ...options });
  const response = await handler(new Request("https://app.example/api?action=response", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Explain the supplied evidence.", screenshots }) }));
  const scenes: VideoScene[] = [];
  for await (const event of decodeVideoSse(response.body!)) if (event.type === "scene.add") scenes.push(event.data.scene);
  return { scenes, generateText };
}

describe("briefing layouts and trusted screenshots", () => {
  it("keeps the first two useful scenes immediate, resolves mixed stock and preserves full narration", async () => {
    const stock = vi.fn(() => ({ type: "video" as const, url: "https://videos.pexels.com/clip.mp4", durationSec: 3 }));
    const result = await run([split, opening, split, ending], { searchMedia: stock });
    expect(stock).toHaveBeenCalledOnce();
    expect(result.scenes.map(scene => scene.templateId)).toEqual(["textMedia", "personalRelevance", "textMedia", "actionSteps"]);
    expect(result.scenes[0].variables.mediaUrl).toBeUndefined();
    expect(result.scenes[2].variables).toEqual({ ...split.variables, mediaUrl: "https://videos.pexels.com/clip.mp4", mediaType: "video", mediaDurationSec: 3, mediaKind: "illustration" });
    expect(result.scenes[2].narration).toBe(`${narration} 2`);
    expect(result.scenes[2].timing.fixedDuration).toBeGreaterThan(3);
    expect(result.generateText).not.toHaveBeenCalled();
  });
  it("keeps authored text when mixed media is unavailable", async () => {
    const result = await run([opening, opening, split, ending], { searchMedia: () => null });
    expect(result.scenes[2]).toMatchObject({ templateId: "textMedia", variables: split.variables, narration: `${narration} 2` });
    expect(result.scenes[2].variables.mediaKeyword).toBeUndefined();
  });
  it("hydrates only host-approved screenshot IDs without a generation call by default", async () => {
    const generateVideo = vi.fn(() => null);
    const result = await run([opening, opening, spotlight, ending], { generateVideo }, [screenshot]);
    expect(generateVideo).not.toHaveBeenCalled();
    expect(result.scenes[2]).toMatchObject({ templateId: "screenshotSpotlight", variables: { ...spotlight.variables, sourceImageUrl: screenshot.url, screenshotAlt: screenshot.alt } });
    expect(() => validateBuiltinScene(result.scenes[2])).not.toThrow();
  });
  it("passes an explicitly animation-approved image to the provider and keeps original pixels on failure", async () => {
    const generateVideo = vi.fn<NonNullable<Options["generateVideo"]>>(() => null);
    const result = await run([opening, opening, spotlight, ending], { generateVideo }, [{ ...screenshot, animate: true }]);
    expect(generateVideo).toHaveBeenCalledOnce();
    expect(generateVideo.mock.calls[0][1].scene?.variables).toMatchObject({ sourceImageUrl: screenshot.url, animateScreenshot: true });
    expect(result.scenes[2].variables.sourceImageUrl).toBe(screenshot.url);
    expect(result.scenes[2].variables.animateScreenshot).toBeUndefined();
  });
  it("recovers unknown screenshot IDs and rejects model URLs and invalid highlight rectangles", async () => {
    const result = await run([opening, opening, spotlight, ending]);
    expect(result.scenes[2]).toMatchObject({ templateId: "chapterTitle", narration: `${narration} 2` });
    expect(() => parseEditorialVisual({ ...spotlight, variables: { ...spotlight.variables, sourceImageUrl: screenshot.url } })).toThrow();
    expect(() => parseEditorialVisual({ ...spotlight, variables: { ...spotlight.variables, highlight: { x: .9, y: 0, width: .2, height: .1 } } })).toThrow();
    expect(() => parseResponseRequest({ prompt: "Review", screenshots: [{ ...screenshot, url: "http://127.0.0.1/private" }] })).toThrow();
  });
  it("counts explicitly approved screenshot animation against the same three-generation ceiling", async () => {
    const generateVideo = vi.fn<NonNullable<Options["generateVideo"]>>(() => ({ type: "video", url: "https://media.example/illustration.mp4", durationSec: 5 }));
    const result = await run([opening, opening, spotlight, spotlight, spotlight, spotlight, ending], { generateVideo }, [{ ...screenshot, animate: true }]);
    expect(generateVideo).toHaveBeenCalledTimes(3);
    expect(result.scenes[5]).toMatchObject({ templateId: "screenshotSpotlight", variables: { sourceImageUrl: screenshot.url } });
    expect(result.scenes[5].variables.mediaUrl).toBeUndefined();
  });
  it("forwards the bounded speaker role to speech generation without changing words", async () => {
    const generateSpeech = vi.fn<NonNullable<Options["generateSpeech"]>>(() => ({ audio: new Uint8Array([1]), mediaType: "audio/mpeg" }));
    const handler = createVideoChatHandler({ authorize: "none", streamText: async function* () {}, generateText: () => "", generateSpeech });
    const response = await handler(new Request("https://app.example/api?action=speech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Keep the qualifier.", speaker: "analyst" }) }));
    expect(response.status).toBe(200);
    expect(generateSpeech.mock.calls[0][0]).toMatchObject({ text: "Keep the qualifier.", speaker: "analyst" });
  });
  it("accepts only bounded named speech roles", () => {
    expect(parseSpeechRequest({ text: "Keep the qualification.", speaker: "analyst" })).toEqual({ text: "Keep the qualification.", speaker: "analyst" });
    expect(() => parseSpeechRequest({ text: "Words", speaker: "arbitrary-provider-voice" })).toThrow();
  });
});
