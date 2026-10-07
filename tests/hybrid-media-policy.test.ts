import { afterEach, describe, expect, it, vi } from "vitest";
import { createVideoChatHandler } from "../src/server/create-video-chat-handler";
import { decodeVideoSse } from "../src/protocol/sse";
import type { ScreenshotAsset } from "../src/briefing/types";

type Options = Parameters<typeof createVideoChatHandler>[0];
const asset: ScreenshotAsset = { id: "copilot-create-april2025", url: "https://images.example/create.png", alt: "Microsoft Copilot Create original interface", animate: false };
const title = (name: string, narration = `${name} helps the team review its source documents before taking the next step.`) => ({ title: name, narration, subject: "team reviewing documents", action: "A team reviews documents together.", visual: { templateId: "chapterTitle", variables: { title: name } } });
async function run(shots: object[], extra: Partial<Options> = {}, screenshots: ScreenshotAsset[] = [], planningDelay = 0) {
  const generateVideo = vi.fn<NonNullable<Options["generateVideo"]>>(() => ({ type: "video", url: "https://media.example/illustration.mp4", durationSec: 5 }));
  const searchMedia = vi.fn<NonNullable<Options["searchMedia"]>>(() => ({ type: "video", url: "https://videos.pexels.com/team.mp4", durationSec: 16 }));
  const handler = createVideoChatHandler({ authorize: "none", hybrid: true, heartbeatMs: false, generateVideo, searchMedia,
    generateText: () => { throw new Error("Never rewrite or shorten briefing facts"); },
    streamText: async function* () {
      if (planningDelay) vi.setSystemTime(Date.now() + planningDelay);
      yield JSON.stringify({ type: "answer", subject: "Team work", intent: "practical", opening: "", development: "Distinct useful facts", visualDirection: "Natural office setting" }) + "\n";
      yield JSON.stringify({ type: "shot", ...shots[0] }) + "\n";
      yield JSON.stringify({ type: "ending", ...shots.at(-1) }) + "\n";
      for (const shot of shots.slice(1, -1)) yield JSON.stringify({ type: "shot", ...shot }) + "\n";
    }, ...extra });
  const response = await handler(new Request("https://app.example/api?action=response", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Explain the supplied release facts.", screenshots }) }));
  const events = []; for await (const event of decodeVideoSse(response.body!)) events.push(event);
  return { scenes: events.flatMap(event => event.type === "scene.add" ? [event.data.scene] : []), events, generateVideo, searchMedia };
}
afterEach(() => vi.useRealTimers());

describe("hybrid visual mixture policy", () => {
  it("turns an all-title plan into a bounded stock and AI mix after two immediate templates", async () => {
    const shots = Array.from({ length: 7 }, (_, index) => title(`Fact ${String.fromCharCode(65 + index)}`));
    const result = await run(shots);
    expect(result.scenes.slice(0, 2).map(scene => scene.templateId)).toEqual(["chapterTitle", "chapterTitle"]);
    expect(result.scenes.slice(2, 4).map(scene => scene.variables.mediaUrl)).toEqual(["https://videos.pexels.com/team.mp4", "https://media.example/illustration.mp4"]);
    expect(result.scenes.map(scene => scene.narration)).toEqual(shots.map(shot => shot.narration));
    expect(result.scenes[2].variables.title).toBe(shots[2].title);
    expect(result.searchMedia).toHaveBeenCalledOnce(); expect(result.generateVideo).toHaveBeenCalledOnce();
    expect(result.searchMedia.mock.calls[0][1].scene?.variables.stockSelection).toEqual({ subject: "team", activity: "reviewing documents" });
    expect(result.events.at(-1)).toMatchObject({ type: "response.complete", data: { finishReason: "stop" } });
  });
  it("uses only available providers and keeps the ending asset-free", async () => {
    const shots = Array.from({ length: 6 }, (_, index) => title(`Fact ${String.fromCharCode(65 + index)}`));
    const stock = await run(shots, { generateVideo: undefined });
    expect(stock.searchMedia).toHaveBeenCalledTimes(2); expect(stock.generateVideo).not.toHaveBeenCalled();
    const generated = await run(shots, { searchMedia: undefined, maxGeneratedVideos: 1 });
    expect(generated.generateVideo).toHaveBeenCalledOnce(); expect(generated.searchMedia).not.toHaveBeenCalled();
    expect(generated.scenes.at(-1)?.templateId).toBe("chapterTitle");
  });
  it("selects an original screenshot only on its matching product feature, before the media mix", async () => {
    const shots = [title("Your task"), title("Check sources"), title("Copilot Notebooks", "Copilot Notebooks helps teams create briefings from sources."), title("Copilot Create", "Copilot Create offers a creation workspace."), title("Review together"), title("Your next step")];
    const result = await run(shots, {}, [asset]);
    expect(result.scenes[2].templateId).toBe("textMedia");
    expect(result.scenes[3]).toMatchObject({ templateId: "screenshotSpotlight", variables: { sourceImageUrl: asset.url, title: "Copilot Create" } });
    expect(result.scenes[4].variables.mediaUrl).toBe("https://media.example/illustration.mp4");
    expect(result.generateVideo).toHaveBeenCalledOnce();
    expect(result.generateVideo.mock.calls[0][1].scene?.variables.animateScreenshot).toBeUndefined();
  });
  it("recognizes reordered product names in source screenshot matches", async () => {
    const facilitator: ScreenshotAsset = { id: "teams-facilitator-sept2025", url: "https://images.example/teams.png", alt: "Facilitator in Teams", animate: false };
    const result = await run([title("Opening"), title("Context"), title("Facilitator in Teams"), title("End")], {}, [facilitator]);
    expect(result.scenes[2]).toMatchObject({ templateId: "screenshotSpotlight", variables: { sourceImageUrl: facilitator.url } });
  });
  it("keeps complete narration and the media mix when optional display copy is too long", async () => {
    const overflow = (name: string) => ({ ...title(name), visual: { templateId: "textMedia", variables: { title: name, body: "Long display copy. ".repeat(20) } } });
    const diagnostics: unknown[] = [];
    const shots = [title("Opening"), title("Context"), overflow("Review sources"), overflow("Compare outcomes"), title("End")];
    const result = await run(shots, { onDiagnostic: event => { if(event.phase === "visual-recovery") diagnostics.push(event.reason); } });
    expect(result.searchMedia).toHaveBeenCalledOnce(); expect(result.generateVideo).toHaveBeenCalledOnce();
    expect(result.scenes.map(scene => scene.narration)).toEqual(shots.map(shot => shot.narration));
    expect(diagnostics).toEqual(["visual-text-overflow", "visual-text-overflow"]);
    expect(JSON.stringify(result.scenes)).not.toContain("Long display copy");
  });
  it("does not turn malformed or exact factual layouts into paid jobs", async () => {
    const result = await run([title("Opening"), title("Condition"), { ...title("Invalid"), visual: { templateId: "invented", variables: {} } }, { ...title("Quote"), visual: { templateId: "quote", variables: { quote: "The supplied quotation.", attribution: "Source author" } } }, title("End")]);
    expect(result.searchMedia).not.toHaveBeenCalled(); expect(result.generateVideo).not.toHaveBeenCalled();
    expect(result.scenes[3].templateId).toBe("quote");
  });
  it("starts media runway when the first scene exists, not before slow planning", async () => {
    vi.useFakeTimers();
    const result = await run([title("Opening"), title("Condition"), title("Review together"), title("Decision"), title("End")], {}, [], 45_000);
    expect(result.searchMedia).toHaveBeenCalledOnce(); expect(result.generateVideo).toHaveBeenCalledOnce();
    expect(result.generateVideo.mock.calls[0][1].deadlineAt).toBeGreaterThan(Date.now());
  });
});

describe("media-led briefing films", () => {
  it("keeps specialized facts intact while putting media behind most scenes, including the opening", async () => {
    const shots = [
      title("Opening"),
      { ...title("Your goal"), visual: { templateId: "personalRelevance", variables: { person: "Maya", goal: "Review renewals", why: "Compare source documents before deciding." } } },
      { ...title("The facts"), visual: { templateId: "keyFigure", variables: { value: "10", label: "Synthetic account packs" } } },
      { ...title("The decision"), visual: { templateId: "comparison", variables: { leftLabel: "Manual", leftText: "Reviewed baseline", rightLabel: "Pilot", rightText: "Reviewed experiment" } } },
      { ...title("Your actions"), visual: { templateId: "actionSteps", variables: { title: "Review then decide", steps: [{ label: "Review", detail: "Check the source documents." }, { label: "Decide", detail: "Keep a human owner." }] } } },
      title("Closing"),
    ];
    const result = await run(shots, { mediaLed: true });
    expect(result.scenes.map(scene => scene.templateId)).toEqual(shots.map(shot => shot.visual.templateId));
    result.scenes.forEach((scene, index) => {
      expect(scene.variables).toMatchObject(shots[index].visual.variables);
      expect(scene.variables.mediaUrl).toBeTruthy();
      expect(scene.narration).toBe(shots[index].narration);
    });
    expect(result.searchMedia).toHaveBeenCalledTimes(5);
    expect(result.generateVideo).toHaveBeenCalledOnce();
    expect(result.scenes[3].variables.mediaUrl).toBe("https://media.example/illustration.mp4");
  });
  it("shows a matching host screenshot from the first scene without replacing specialized facts", async () => {
    const screenshot: ScreenshotAsset = { id: "teams-facilitator-sept2025", url: "https://images.example/teams.png", alt: "Original Facilitator interface", animate: false };
    const shots = [{ ...title("Facilitator in Teams"), visual: { templateId: "personalRelevance", variables: { person: "Maya", goal: "Track decisions", why: "Test Facilitator in Teams with synthetic material." } } }, title("End")];
    const result = await run(shots, { mediaLed: true }, [screenshot]);
    expect(result.scenes[0]).toMatchObject({ templateId: "personalRelevance", variables: { ...shots[0].visual.variables, mediaUrl: screenshot.url, mediaType: "photo", mediaKind: "source", mediaAlt: screenshot.alt } });
    expect(result.generateVideo).not.toHaveBeenCalled();
  });
});
