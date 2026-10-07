import { briefingFixture } from "./briefing-fixture";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type AudioProof = Array<{ type: "playing" | "ended"; seconds: number; duration: number; id: number; src: string }>;
type ProofWindow = Window & { podcastAudioProof: AudioProof };

test("follow-ups retain the original brief and previous answers", async ({ page }) => {
  const prompts: string[] = [];
  const answers = ["Pilot Notebooks with six volunteers.", "Start with one synthetic account pack.", "Review its accuracy together."];
  await page.route("**/api/video-chat?*", async route => {
    const action = new URL(route.request().url()).searchParams.get("action");
    if (action === "briefing") {
      prompts.push(route.request().postDataJSON().prompt);
      return route.fulfill({ json: briefingFixture(route.request().postDataJSON().prompt, answers[prompts.length - 1]) });
    }
    if (action === "capabilities") return route.fulfill({ json: { templates: true, generatedSpeech: true, modes: ["cinematic"] } });
    if (action === "welcome") return route.fulfill({ json: { hero: null, cards: [] } });
    if (action === "speech") return route.fulfill({ contentType: "audio/mpeg", body: readFileSync("tests/support/chat/speech/explanation-opening.mp3") });
    return route.fulfill({ status: 400, json: { error: "Unexpected test request" } });
  });
  await page.goto("/embed?format=text");
  const original = "Help Maya reduce renewal preparation time using the supplied Microsoft announcements.";
  await page.getByRole("textbox", { name: "What should this person know?", exact: true }).fill(original);
  await page.getByRole("button", { name: "Create briefing", exact: true }).click();
  await expect(page.getByRole("article")).toContainText(answers[0]);
  const followup = page.getByRole("textbox", { name: "Ask a follow-up" });
  await followup.fill("What should they try first?");
  await page.getByRole("button", { name: "Send follow-up" }).click();
  await expect(page.getByRole("article")).toContainText(answers[1]);
  expect(prompts[1]).toContain(original);
  expect(prompts[1]).toContain(answers[0]);
  expect(prompts[1]).toContain("What should they try first?");
  await expect(followup).toHaveValue("");
  await followup.fill("And after that?");
  await followup.press("Enter");
  await expect(page.getByRole("article")).toContainText(answers[2]);
  expect(prompts[2]).toContain(original);
  expect(prompts[2]).toContain("What should they try first?");
  expect(prompts[2]).toContain(answers[1]);
  expect(prompts[2]).toContain("And after that?");
  const field = await followup.boundingBox();
  const tabs = await page.getByRole("tablist").boundingBox();
  expect(tabs!.y).toBeGreaterThan(field!.y + field!.height);
});

test("developer server does not serve private backend or test fixtures", async ({ request }) => {
  for (const path of [
    "/functions/api/video-chat.mjs", "/tests/app-browser/format-output.spec.ts", "/scripts/dev.mjs",
    "/.wrangler/local/quota-salt", "/.git", "/.generated/local-static/index.html", "/src/server.ts",
    `/@fs/${process.cwd()}/.wrangler/local/quota-salt`,
    `/@fs/${encodeURIComponent(process.cwd())}/.wrangler/local/quota-salt`,
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});

test("prepares distinct podcast turns once and plays two sequential voices in the embed", async ({ page }, info) => {
  const script = "Wind gives ocean waves their energy.";
  const audio = readFileSync("tests/support/chat/speech/explanation-opening.mp3");
  const requests: Array<{ action: string | null; body: unknown }> = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const proof: AudioProof = [];
    Object.assign(window, { podcastAudioProof: proof });
    const NativeAudio = window.Audio;
    let id = 0;
    window.Audio = function (src?: string) {
      const element = new NativeAudio(src);
      const elementId = id++;
      for (const type of ["playing", "ended"] as const) element.addEventListener(type, () => {
        if (element.src.startsWith("blob:")) proof.push({ type, seconds: element.currentTime, duration: element.duration, id: elementId, src: element.src });
      });
      return element;
    } as unknown as typeof Audio;
  });
  await page.route("**/api/video-chat?*", async route => {
    const request = route.request();
    const action = new URL(request.url()).searchParams.get("action");
    const body: unknown = request.postData() ? request.postDataJSON() : null;
    // The shared video hook discovers its capabilities on mount even when the
    // composer selects Text. These read-only bootstrap calls do not generate.
    if (action === "capabilities") return route.fulfill({ json: { templates: true, generatedSpeech: true, generatedVideo: false, generatedVideoAudio: false, stockMedia: false, transcription: false, modes: ["cinematic"] } });
    if (action === "welcome") return route.fulfill({ json: { hero: null, cards: [] } });
    requests.push({ action, body });
    if (action === "briefing") return route.fulfill({ json: briefingFixture(request.postDataJSON().prompt, script) });
    if (action === "speech") return route.fulfill({ contentType: "audio/mpeg", body: audio });
    return route.fulfill({ status: 500, json: { error: { message: "Unexpected test request" } } });
  });
  await page.goto("/embed?format=text");
  await page.getByRole("button", { name: /Better customer conversations/ }).click();
  await expect(page.getByRole("textbox", { name: "What should this person know?", exact: true })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Generated text" })).toContainText(script);
  await expect.poll(() => requests.filter(r => r.action === "speech").length).toBe(2);
  expect(requests.filter(r => r.action === "briefing")).toHaveLength(1);
  expect(requests.filter(r => r.action === "speech").map(r => r.body)).toEqual([
    { text: "What matters here?", speaker: "host" },
    { text: script, speaker: "analyst" },
  ]);
  await page.screenshot({ path: info.outputPath("text-result.png") });

  // Speech is prepared before selecting the tab; playback still needs its gesture.
  await page.getByRole("tab", { name: "Podcast", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play podcast", exact: true })).toBeEnabled();
  await expect(page.locator(".gsp-player").getByRole("button", { name: "Play podcast", exact: true })).toBeVisible();
  await page.locator(".gsp-transcript summary").click();
  await expect(page.locator(".po-transcript")).toContainText(script);
  await expect(page.locator(".po-transcript")).toContainText("What matters here?");
  expect(await page.evaluate(() => (window as unknown as ProofWindow).podcastAudioProof)).toEqual([]);
  await page.getByRole("tab", { name: "Text", exact: true }).click();
  await expect(page.getByRole("article", { name: "Generated text" })).toContainText(script);
  await page.getByRole("tab", { name: "Podcast", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play podcast", exact: true })).toBeEnabled();
  expect(requests.filter(r => r.action === "briefing")).toHaveLength(1);
  expect(requests.filter(r => r.action === "speech")).toHaveLength(2);

  await page.getByRole("button", { name: "Play podcast", exact: true }).click();
  await expect(page.getByRole("button", { name: "Replay podcast", exact: true })).toBeVisible({ timeout: 12_000 });
  const proof = await page.evaluate(() => (window as unknown as ProofWindow).podcastAudioProof);
  expect(proof.map(event => event.type)).toEqual(["playing", "ended", "playing", "ended"]);
  expect(proof[1].seconds).toBeGreaterThan(1.5);
  expect(proof[1].seconds).toBeCloseTo(proof[1].duration, 1);
  await page.getByRole("tab", { name: "Text", exact: true }).click();
  await page.getByRole("tab", { name: "Podcast", exact: true }).click();
  await expect(page.getByRole("button", { name: "Replay podcast", exact: true })).toBeVisible();
  expect(requests.filter(r => r.action === "briefing")).toHaveLength(1);
  expect(requests.filter(r => r.action === "speech")).toHaveLength(2);
  expect(errors).toEqual([]);
  await info.attach("podcast-native-playback", { body: JSON.stringify({ requests, proof }), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath("podcast-ended.png") });
});

test("opens the loading scene immediately and prepares other formats before switching", async ({ page }, info) => {
  const requests: string[] = [];
  let releaseVideo!: () => void;
  const videoGate = new Promise<void>(resolve => { releaseVideo = resolve; });
  await page.route("**/api/video-chat?*", async route => {
    const action = new URL(route.request().url()).searchParams.get("action")!;
    requests.push(action);
    if (action === "capabilities") return route.fulfill({ json: { templates: true, generatedSpeech: true, modes: ["cinematic"] } });
    if (action === "welcome") return route.fulfill({ json: { hero: null, cards: [] } });
    if (action === "briefing") return route.fulfill({ json: briefingFixture(route.request().postDataJSON().prompt, "Wind gives ocean waves their energy.") });
    if (action === "speech") return route.fulfill({ contentType: "audio/mpeg", body: readFileSync("tests/support/chat/speech/explanation-opening.mp3") });
    if (action === "response") { await videoGate; return route.fulfill({ status: 503, json: { error: "Video unavailable in this fixture" } }); }
    return route.fulfill({ status: 400, json: { error: "Unexpected test request" } });
  });
  await page.goto("/embed");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator(".prompt-output")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator(".prompt-output")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".po-chrome")).not.toContainText("Briefings");
  await page.getByRole("textbox", { name: "What should this person know?", exact: true }).fill("Explain waves.");
  await page.getByRole("button", { name: "Create briefing", exact: true }).click();
  await expect(page.locator(".po-video")).toBeVisible();
  await expect(page.locator("[data-opening-chapter]")).toBeVisible();
  await expect(page.getByRole("status", { name: "Video preparation" })).toBeVisible();
  await expect.poll(() => requests.includes("briefing") && requests.includes("speech")).toBe(true);
  await expect(page.locator("[data-opening-chapter]")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: info.outputPath("immediate-loading.png") });
  await page.getByRole("tab", { name: "Text", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("Wind gives ocean waves their energy.");
  await page.getByRole("tab", { name: "Podcast", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play podcast", exact: true })).toBeEnabled();
  expect(requests.filter(action => action === "briefing")).toHaveLength(1);
  expect(requests.filter(action => action === "speech")).toHaveLength(2);
  releaseVideo();
});
