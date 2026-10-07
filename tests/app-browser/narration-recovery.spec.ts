import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createVideoChatHandler } from "../../src/server";
import { briefingFixture } from "./briefing-fixture";

test("recovers narration without regenerating video or displaying provider warnings", async ({ page, baseURL }) => {
  const speech = readFileSync("tests/support/chat/speech/explanation-opening.mp3");
  const line = "Wind gives ocean waves their energy.";
  let speechCalls = 0, videoCalls = 0;
  await page.addInitScript(() => {
    const OriginalAudio = window.Audio;
    Object.assign(window, { narrationStarts: 0 });
    window.Audio = class extends OriginalAudio {
      constructor(src?: string) {
        super(src);
        this.addEventListener("playing", () => {
          if (this.src.startsWith("blob:")) (window as unknown as { narrationStarts: number }).narrationStarts++;
        });
      }
    };
  });
  const handler = createVideoChatHandler({ authorize: "none", hybrid: true, heartbeatMs: false,
    generateText: () => "[]", generateSpeech: () => ({ audio: speech, mediaType: "audio/mpeg" }),
    streamText: async function* () {
      yield JSON.stringify({ type: "answer", subject: "waves", intent: "explanation", opening: "", development: "Explain energy", visualDirection: "Clear typography" }) + "\n";
      yield JSON.stringify({ type: "shot", title: "Energy travels", subject: "waves", narration: line, action: "", visual: { templateId: "textMedia", variables: { title: "Wind gives waves their energy", body: "Energy travels onward." } } }) + "\n";
      yield JSON.stringify({ type: "ending", title: "The takeaway", subject: "waves", narration: line, action: "", visual: { templateId: "chapterTitle", variables: { title: "Energy moves toward the shore" } } }) + "\n";
    } });
  await page.route("**/api/video-chat?*", async route => {
    const request = route.request(), action = new URL(request.url()).searchParams.get("action");
    if (action === "briefing") return route.fulfill({ json: briefingFixture(request.postDataJSON().prompt, line) });
    if (action === "speech") {
      if (!request.postDataJSON().speaker && ++speechCalls === 1) return route.fulfill({ status: 503, body: "Recorded provider failure" });
      return route.fulfill({ contentType: "audio/mpeg", body: speech });
    }
    if (action === "response") videoCalls++;
    const response = await handler(new Request(request.url().replace(new URL(request.url()).origin, baseURL!), { method: request.method(), headers: request.headers(), body: request.postData() ?? undefined }));
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.goto("/embed");
  await page.getByRole("textbox", { name: "What should this person know?" }).fill("Explain ocean wave energy.");
  await page.getByRole("button", { name: "Create briefing", exact: true }).click();
  const retry = page.getByRole("button", { name: "Retry narration", exact: true });
  await expect(retry).toBeEnabled();
  await expect(page.getByText("Generated voice is unavailable. Continuing without narration.", { exact: true })).toHaveCount(0);
  expect(speechCalls).toBe(1);
  await retry.click();
  await expect.poll(() => speechCalls).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as unknown as { narrationStarts: number }).narrationStarts)).toBeGreaterThan(0);
  expect(videoCalls).toBe(1);
  await expect(retry).toHaveCount(0);
});
