import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { briefingFixture } from "./briefing-fixture";

for (const width of [320, 900]) test(`podcast signal and transport work at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const audio = readFileSync("tests/support/chat/speech/explanation-opening.mp3");
  let speechRequests = 0;
  await page.route("**/api/video-chat?*", async route => {
    const action = new URL(route.request().url()).searchParams.get("action");
    if (action === "briefing") return route.fulfill({ json: briefingFixture(route.request().postDataJSON().prompt, "Wind gives ocean waves their energy.") });
    if (action === "speech") { speechRequests++; return route.fulfill({ contentType: "audio/mpeg", body: audio }); }
    if (action === "capabilities") return route.fulfill({ json: { templates: true, generatedSpeech: true, modes: ["cinematic"] } });
    if (action === "welcome") return route.fulfill({ json: { hero: null, cards: [] } });
    return route.fulfill({ status: 503, json: { error: "Video disabled in recorded podcast fixture" } });
  });
  await page.goto("/embed?format=podcast");
  await page.getByRole("textbox", { name: "What should this person know?", exact: true }).fill("Recorded test briefing: how wind powers waves.");
  await page.getByRole("button", { name: "Create briefing", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play podcast", exact: true })).toBeEnabled();
  const meter = page.locator(".po-podcast-waveform"), seek = page.getByRole("slider", { name: "Seek podcast" });
  await expect(meter).toHaveAttribute("data-level", "0");
  await page.getByRole("button", { name: "Play podcast", exact: true }).click();
  await expect.poll(async () => Number(await meter.getAttribute("data-level"))).toBeGreaterThan(.01);
  await expect.poll(async () => Number(await seek.inputValue())).toBeGreaterThan(.65);
  await page.screenshot({ path: info.outputPath(`podcast-playing-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(meter).toHaveAttribute("data-level", "0");
  const pausedAt = await seek.inputValue();
  await page.waitForTimeout(220);
  expect(await seek.inputValue()).toBe(pausedAt);
  await seek.fill("1");
  await expect(seek).toHaveValue("1");
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeEnabled();
  await page.getByRole("combobox", { name: "Playback speed" }).selectOption("1.5");
  await page.getByRole("button", { name: "Back 10 seconds" }).click();
  await expect(seek).toHaveValue("0");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect.poll(async () => Number(await meter.getAttribute("data-level"))).toBeGreaterThan(.01);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator(".gsp-transcript summary").click();
  await expect(page.locator(".po-transcript")).toContainText("Wind gives ocean waves their energy.");
  expect(speechRequests).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const small = await page.locator(".gsp-player button, .gsp-player select").evaluateAll(elements => elements.filter(element => { const box = element.getBoundingClientRect(); return box.width < 44 || box.height < 44; }).map(element => element.getAttribute("aria-label")));
  expect(small).toEqual([]);
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.screenshot({ path: info.outputPath(`podcast-light-${width}.png`), fullPage: true });
});
