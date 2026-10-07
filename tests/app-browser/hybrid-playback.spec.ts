import { briefingFixture } from "./briefing-fixture";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createVideoChatHandler } from "../../src/server";

type PlaybackProof = {
  released: boolean;
  frames: number;
  responses: number;
  scenes: string[];
  speech: Array<{ type: "start" | "end"; at: number; seconds: number }>;
};
type HybridWindow = Window & { hybridPlayback: { proof: PlaybackProof; release(): void } };

for (const { width, nested } of [{ width: 390, nested: false }, { width: 1280, nested: false }, { width: 390, nested: true }]) test(`plays useful templates around footage with complete ordered narration at ${width}px${nested ? " in a scrollable host" : ""}`, async ({ page, baseURL }, info) => {
  test.setTimeout(45_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const lines = [
    "Wind gives ocean waves their energy.",
    "The water moves while energy travels onward.",
    "Wind transfers energy to the surface water.",
    "The wave carries that energy toward the shore.",
  ];
  const speech = ["opening", "body", "body", "ending"].map(beat => readFileSync(`tests/support/chat/speech/explanation-${beat}.mp3`));
  const format = process.platform === "linux" ? "webm" : "mp4";
  const footage = readFileSync(`tests/browser/fixtures/media-transition/waterfall-audio.${format}`);
  let generatedClips = 0;
  let releaseBriefing!: () => void;
  const briefingGate = new Promise<void>(resolve => { releaseBriefing = resolve; });
  const handler = createVideoChatHandler({
    authorize: "none", heartbeatMs: false, hybrid: true,
    generateText: async () => "[]",
    generateSpeech: async ({ text }) => {
      const index = lines.indexOf(text);
      if (index < 0) throw new Error("Unexpected narration in the deterministic hybrid fixture");
      return { audio: speech[index]!, mediaType: "audio/mpeg" };
    },
    generateVideo: async () => {
      generatedClips++;
      return { url: `${baseURL}/test-media/hybrid.${format}`, type: "video", durationSec: 5 };
    },
    streamText: async function* () {
      yield JSON.stringify({ type: "answer", intent: "explanation", opening: "", subject: "waves",
        development: "Explain wind, show moving water, then summarize the energy transfer.", visualDirection: "Natural water movement." }) + "\n";
      const shot = { subject: "waves", action: "Water moves toward the shore.", durationSec: 5, continuity: "cut" };
      yield JSON.stringify({ type: "shot", ...shot, narration: lines[0],
        visual: { templateId: "keyFigure", variables: { value: "Wind", label: "Gives waves energy" } } }) + "\n";
      yield JSON.stringify({ type: "shot", ...shot, narration: lines[1],
        visual: { templateId: "comparison", variables: { leftLabel: "Water", leftText: "Moves locally", rightLabel: "Energy", rightText: "Travels onward" } } }) + "\n";
      yield JSON.stringify({ type: "shot", ...shot, narration: lines[2] }) + "\n";
      yield JSON.stringify({ type: "ending", ...shot, narration: lines[3],
        visual: { templateId: "quote", variables: { quote: "Energy travels toward the shore", attribution: "The takeaway" } } }) + "\n";
    },
  });
  const response = await handler(new Request(`${baseURL}/api/video-chat?action=response`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "Explain how wind creates waves", mode: "cinematic" }),
  }));
  expect(response.ok).toBe(true);
  const records = (await response.text()).split("\n\n").filter(Boolean);
  const firstScene = records.findIndex(record => record.includes('"type":"scene.add"'));
  expect(firstScene).toBeGreaterThan(0);
  expect(generatedClips).toBe(1);

  // Deliver the real handler's validated protocol incrementally to the actual
  // app. Holding the remaining records proves the first template can play
  // without the completed response; provider latency is covered by unit tests.
  await page.addInitScript(({ head, tail }) => {
    const proof: PlaybackProof = { released: false, frames: 0, responses: 0, scenes: [], speech: [] };
    const controls = { proof, release: () => {} };
    Object.assign(window, { hybridPlayback: controls });
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
      if (url.pathname !== "/api/video-chat" || url.searchParams.get("action") !== "response") return nativeFetch(input, init);
      proof.responses++;
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode(head));
        controls.release = () => {
          if (proof.released) return;
          proof.released = true;
          controller.enqueue(new TextEncoder().encode(tail));
          controller.close();
        };
      } }), { headers: { "content-type": "text/event-stream", "x-briefings-video-stream": "0.6" } });
    };
    const NativeAudio = window.Audio;
    window.Audio = function (src?: string) {
      const audio = new NativeAudio(src);
      let active = false;
      audio.addEventListener("playing", () => {
        if (audio.src.startsWith("blob:") && !active) {
          active = true;
          proof.speech.push({ type: "start", at: performance.now(), seconds: audio.currentTime });
        }
      });
      audio.addEventListener("ended", () => {
        if (audio.src.startsWith("blob:")) {
          active = false;
          proof.speech.push({ type: "end", at: performance.now(), seconds: audio.currentTime });
        }
      });
      return audio;
    } as unknown as typeof Audio;
    const observed = new WeakSet<HTMLVideoElement>();
    const sample = () => {
      const template = document.querySelector('[data-scene-layer="active"] [data-template]')?.getAttribute("data-template");
      if (template && proof.scenes.at(-1) !== template) proof.scenes.push(template);
      for (const video of document.querySelectorAll<HTMLVideoElement>("video")) {
        if (observed.has(video)) continue;
        observed.add(video);
        let previous: number | undefined;
        const frame: VideoFrameRequestCallback = (_now, metadata) => {
          if (!video.isConnected) return;
          if (video.closest('[data-scene-layer="active"]') && previous !== undefined && metadata.mediaTime > previous) proof.frames++;
          previous = metadata.mediaTime;
          video.requestVideoFrameCallback(frame);
        };
        video.requestVideoFrameCallback(frame);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, { head: records.slice(0, firstScene + 1).join("\n\n") + "\n\n", tail: records.slice(firstScene + 1).join("\n\n") + "\n\n" });
  await page.route(`**/test-media/hybrid.${format}`, route => route.fulfill({ contentType: `video/${format}`, body: footage }));
  await page.route("**/api/video-chat?*", async route => {
    const request = route.request();
    if (request.url().includes("action=briefing")) {
      // The phone case reproduces the failed preparation request: video must
      // start while it is pending and survive its eventual 503.
      if (width === 390) {
        await briefingGate;
        return route.fulfill({ status: 503, json: { error: "Recorded preparation timeout" } });
      }
      return route.fulfill({ json: briefingFixture(request.postDataJSON().prompt, lines.join(" ")) });
    }
    if (request.url().includes("action=speech") && request.postDataJSON().speaker) return route.fulfill({ contentType: "audio/mpeg", body: speech[0] });
    if (request.url().includes("action=status")) return route.fulfill({ json: { ready: true, missing: [], videoMode: "cinematic" } });
    const result = await handler(new Request(request.url(), { method: request.method(),
      ...(request.postData() ? { body: request.postData(), headers: { "content-type": "application/json" } } : {}) }));
    await route.fulfill({ status: result.status, headers: Object.fromEntries(result.headers), body: Buffer.from(await result.arrayBuffer()) });
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/");
  if (nested) await page.evaluate(() => {
    const stage = document.querySelector(".preview-stage")!;
    const host = document.createElement("div");
    host.id = "scrollable-host";
    host.style.cssText = "height:500px;overflow-y:auto";
    stage.parentElement!.insertBefore(host, stage);
    host.append(stage);
  });
  await page.getByRole("textbox", { name: "What should this person know?", exact: true }).fill("Explain how wind creates waves");
  await page.getByRole("button", { name: "Create briefing", exact: true }).click();
  const first = page.locator('[data-scene-layer="active"] [data-template="keyFigure"]');
  await expect(first).toContainText("Gives waves energy");
  await expect(page.locator("[data-opening-chapter]")).toHaveCount(0);
  await expect(page.getByRole("form", { name: "Briefing controls" }).getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  const bounds = await first.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
  expect(bounds!.y).toBeGreaterThanOrEqual(-1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(901);
  if (nested) {
    const host = await page.locator("#scrollable-host").boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(host!.y - 1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
  await expect.poll(() => page.evaluate(() => (window as unknown as HybridWindow).hybridPlayback.proof.speech.filter(event => event.type === "start").length)).toBe(1);
  const before = await page.evaluate(() => (window as unknown as HybridWindow).hybridPlayback.proof);
  expect(before.released).toBe(false);
  expect(before.scenes).toEqual(["keyFigure"]);
  expect(before.frames).toBe(0);
  await page.screenshot({ path: info.outputPath(`hybrid-opening-${width}.png`) });
  const mountedVideo = await page.locator(".po-video").elementHandle();
  await page.getByRole("tab", { name: "Text", exact: true }).click();
  if (width === 390) {
    releaseBriefing();
    await expect(page.getByText("Could not prepare the briefing. Please try again.")).toBeVisible();
  } else await expect(page.getByRole("article", { name: "Generated text" })).toContainText(lines[0]);
  await expect(page.getByRole("tabpanel", { name: "Video", exact: true, includeHidden: true })).toBeHidden();
  expect(await mountedVideo!.evaluate(element => element.isConnected)).toBe(true);
  await page.getByRole("tab", { name: "Video", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Video", exact: true })).toBeVisible();
  expect(await mountedVideo!.evaluate(element => element === document.querySelector(".po-video"))).toBe(true);
  await expect(page.getByText("Could not prepare the briefing. Please try again.")).not.toBeVisible();
  expect(await page.evaluate(() => (window as unknown as HybridWindow).hybridPlayback.proof.responses)).toBe(1);
  await page.evaluate(() => (window as unknown as HybridWindow).hybridPlayback.release());
  await expect.poll(() => page.evaluate(() => (window as unknown as HybridWindow).hybridPlayback.proof.frames), { timeout: 15_000 }).toBeGreaterThan(2);
  await expect(page.locator('[data-scene-layer="active"] [data-template="quote"]')).toContainText("Energy travels toward the shore");
  await expect(page.getByRole("button", { name: "Replay video", exact: true, includeHidden: true })).toHaveCount(1, { timeout: 15_000 });
  const proof = await page.evaluate(() => (window as unknown as HybridWindow).hybridPlayback.proof);
  expect(proof.scenes).toEqual(["keyFigure", "comparison", "cinemaMedia", "quote"]);
  expect(proof.speech.map(event => event.type)).toEqual(["start", "end", "start", "end", "start", "end", "start", "end"]);
  expect(proof.speech.filter(event => event.type === "end").every(event => event.seconds > 1.5)).toBe(true);
  expect(generatedClips).toBe(1);
  expect(proof.responses).toBe(1);
  expect(errors).toEqual([]);
  await info.attach("hybrid-playback", { body: JSON.stringify(proof), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath(`hybrid-${width}.png`) });
});
