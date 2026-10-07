import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { briefingFixture } from "./briefing-fixture";
import { createVideoChatHandler } from "../../src/server";

for (const viewport of [{ width: 320, height: 740 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 740, height: 360 }]) {
  test(`full embed controls, captions and templates fit ${viewport.width}×${viewport.height}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await page.addInitScript(() => {
      HTMLElement.prototype.requestFullscreen = () => Promise.reject(new Error("Fullscreen unavailable in this host"));
    });
    const line = "Wind gives ocean waves their energy.";
    const speech = readFileSync("tests/support/chat/speech/explanation-opening.mp3");
    const handler = createVideoChatHandler({ authorize: "none", hybrid: true, heartbeatMs: false,
      generateText: () => "[]", generateSpeech: () => ({ audio: speech, mediaType: "audio/mpeg" }),
      streamText: async function* () {
        yield JSON.stringify({ type: "answer", subject: "waves", intent: "explanation", opening: "", development: "Explain energy", visualDirection: "Clear typography" }) + "\n";
        yield JSON.stringify({ type: "shot", title: "Energy travels", subject: "waves", narration: line, action: "", visual: { templateId: "textMedia", variables: { title: "Wind gives waves their energy", body: "Energy travels onward while the water moves locally." } } }) + "\n";
        yield JSON.stringify({ type: "ending", title: "The takeaway", subject: "waves", narration: "Energy moves toward the shore.", action: "", visual: { templateId: "personalRelevance", variables: { person: "A curious reader", goal: "Understand the motion", why: "Distinguish the moving water from the energy travelling through it." } } }) + "\n";
      } });
    const requestedOrientations: unknown[] = [];
    await page.route("**/api/video-chat?*", async route => {
      const request = route.request(), action = new URL(request.url()).searchParams.get("action");
      if (action === "response") requestedOrientations.push(request.postDataJSON().orientation);
      if (action === "briefing") return route.fulfill({ json: briefingFixture(request.postDataJSON().prompt, line) });
      const response = await handler(new Request(request.url(), { method: request.method(), ...(request.postData() ? { body: request.postData(), headers: { "content-type": "application/json" } } : {}) }));
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    });
    await page.goto(`${baseURL}/embed`);
    await page.getByRole("textbox", { name: "What should this person know?", exact: true }).fill("Explain how wind creates waves.");
    const create = page.getByRole("button", { name: "Create briefing", exact: true });
    expect((await create.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await create.click();
    await expect(page.locator('[data-scene-layer="active"] [data-template="textMedia"]')).toBeVisible();
    const pause = page.getByRole("button", { name: "Pause", exact: true });
    await expect(pause).toBeEnabled();
    await expect.poll(() => page.locator('[data-scene-layer="active"] [data-editorial-text="body"]').evaluate(element => Number(getComputedStyle(element.parentElement!).opacity))).toBeGreaterThan(.9);
    await pause.click();
    const subtitles = page.getByRole("button", { name: "Subtitles", exact: true });
    await expect(subtitles).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".po-caption")).toHaveCount(0);
    await subtitles.click();
    await expect(subtitles).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".po-caption")).toBeVisible();
    const checks = await page.locator(".prompt-output").evaluate(root => {
      const bounds = root.getBoundingClientRect();
      const controls = [...root.querySelectorAll<HTMLElement>('button, [role="tab"], textarea')].filter(element => element.getClientRects().length);
      const errors = controls.flatMap(element => {
        const box = element.getBoundingClientRect();
        return [box.width < 44 || box.height < 44 ? `Small control: ${element.getAttribute("aria-label") ?? element.textContent}` : "", box.left < bounds.left - 1 || box.right > bounds.right + 1 ? "Control escapes embed" : ""].filter(Boolean);
      });
      const caption = root.querySelector<HTMLElement>(".word-captions")!;
      const canvas = root.querySelector(".po-video")!.getBoundingClientRect();
      const captionBox = caption.getBoundingClientRect();
      if (captionBox.left < canvas.left || captionBox.right > canvas.right || captionBox.bottom > canvas.bottom) errors.push("Caption escapes video");
      const text = root.querySelector<HTMLElement>('[data-scene-layer="active"] [data-editorial-text="body"]')!;
      const range = document.createRange(); range.selectNodeContents(text);
      const lineHeight = Math.min(...[...range.getClientRects()].filter(rect => rect.height > 0).map(rect => rect.height));
      return { errors, captionSize: parseFloat(getComputedStyle(caption).fontSize), templateGlyphHeight: lineHeight, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(checks.errors).toEqual([]);
    expect(checks.overflow).toBe(false);
    expect(checks.captionSize).toBeGreaterThanOrEqual(16);
    expect(checks.templateGlyphHeight).toBeGreaterThanOrEqual(12);
    await page.screenshot({ path: info.outputPath(`embed-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.getByRole("button", { name: "Enter fullscreen", exact: true }).click();
    await expect(page.locator(".prompt-output")).toHaveAttribute("data-fullscreen", viewport.width === 390 ? "fallback" : "native");
    await expect(page.getByRole("button", { name: "Exit fullscreen", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Ask a follow-up" })).toBeHidden();
    await expect(page.getByRole("tablist")).toBeHidden();
    await expect(subtitles).toBeVisible();
    const fullscreenBounds = await page.locator(".po-video").boundingBox();
    expect(fullscreenBounds!.x).toBeGreaterThanOrEqual(0);
    expect(fullscreenBounds!.y).toBeGreaterThanOrEqual(0);
    expect(fullscreenBounds!.x + fullscreenBounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(fullscreenBounds!.y + fullscreenBounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.screenshot({ path: info.outputPath(`fullscreen-${viewport.width}.png`) });
    if (viewport.width === 390) await page.keyboard.press("Escape");
    else await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
    await expect(page.locator(".prompt-output")).toHaveAttribute("data-fullscreen", "none");
    await expect(page.getByRole("textbox", { name: "Ask a follow-up" })).toBeVisible();
    expect(requestedOrientations).toHaveLength(1);
    await subtitles.click();
    await expect(subtitles).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".po-caption")).toHaveCount(0);
    expect(requestedOrientations).toEqual([viewport.width <= 600 ? "portrait" : "landscape"]);
    await page.setViewportSize({ width: viewport.width <= 600 ? 900 : 390, height: 844 });
    await expect(page.locator(".prompt-output")).toHaveAttribute("data-orientation", viewport.width <= 600 ? "landscape" : "portrait");
    await expect.poll(() => page.locator(".po-video").evaluate(element => element.getBoundingClientRect().width > element.getBoundingClientRect().height)).toBe(viewport.width <= 600);
    expect(requestedOrientations).toHaveLength(1);
  });
}
