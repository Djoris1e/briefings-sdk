import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { briefingFixture } from "./briefing-fixture";

// Recorded editorial fixture, not a fetched release report or generated result.
const article = {
  title: "Make the next customer conversation count",
  dek: "A smaller, carefully reviewed experiment can tell Maya more than a broad rollout. Start with the work her team already does.",
  sections: [
    { heading: "Start with the bottleneck", paragraphs: ["Maya’s team spends too much time assembling the story before a renewal meeting. Notes, plans and open questions live in different places, and each new request for a shorter explanation creates another draft. The immediate opportunity is to make that preparation easier to review, rather than simply produce more material.", "For this fictional pilot, the question is deliberately narrow: can one shared briefing help a customer success manager prepare a useful conversation with less effort? That is a hypothesis to test. It is not a claim that a new tool has already saved time or improved retention."] },
    { heading: "Make review part of the experiment", paragraphs: ["Choose ten synthetic account packs and keep the original material available beside every draft. A manager should be able to trace a recommendation back to the notes that support it, identify gaps and correct a mistaken interpretation before anything reaches a customer.", "Measure preparation and review together. A draft that arrives quickly but takes longer to correct is not an improvement. Record the kinds of errors that appear, whether important qualifications survive, and how often someone has to return to the original material to understand a recommendation."] },
    { heading: "Give the pilot a clear owner", paragraphs: ["The operations partner can organize the sample packs and agree a consistent way to record time. The customer success manager remains responsible for the account story and the commitments made to the customer. IT should confirm access and licensing before the team relies on a capability in its everyday workflow.", "Keep the first experiment separate from customer records and outbound communication. A useful result here is a reviewed brief and a clearer decision about what to try next. Automatic updates or messages would add a different set of questions before the team has answered the first one."] },
    { heading: "Know what would change your mind", paragraphs: ["Set the stopping conditions before the first session. If review time rises, the source trail is unclear, or an important qualification repeatedly disappears, pause and inspect the cause. A failed assumption is useful evidence when the experiment is small enough to change.", "Compare the outcome with the existing manual process, including the effort of collecting the source material. Keep the comparison fair: use equivalent account packs, the same review standard and a clear record of which work each approach required."] },
    { heading: "Tomorrow’s first move", paragraphs: ["Ask the operations partner to prepare two synthetic packs and invite one manager to review them. Agree what a successful briefing should help that person decide. Expand to the remaining packs only after this first session shows that the measurement and review process are practical."] },
  ],
};
for (const width of [390, 1000]) test(`article reading and light inputs work at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  let preparationAttempts = 0;
  await page.route("**/api/video-chat?*", async route => {
    const action = new URL(route.request().url()).searchParams.get("action");
    if (action === "briefing" && ++preparationAttempts === 1 && width === 1000) return route.fulfill({ status: 503, json: { error: "Preparation unavailable" } });
    if (action === "briefing") return route.fulfill({ json: { ...briefingFixture(route.request().postDataJSON().prompt, "Use a small, reviewed experiment to assess renewal preparation."), article } });
    if (action === "speech") return route.fulfill({ contentType: "audio/mpeg", body: readFileSync("tests/support/chat/speech/explanation-opening.mp3") });
    if (action === "capabilities") return route.fulfill({ json: { templates: true, generatedSpeech: true, modes: ["cinematic"] } });
    if (action === "welcome") return route.fulfill({ json: { hero: null, cards: [] } });
    return route.fulfill({ status: 503, json: { error: "No video generation in article fixture" } });
  });
  await page.goto("/embed?format=text");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator(".po-input-card")).toHaveCSS("box-shadow", "none");
  await page.screenshot({ path: info.outputPath(`start-light-${width}.png`) });
  await page.getByRole("textbox", { name: "What should this person know?", exact: true }).fill("Recorded fictional example: Maya wants to test renewal preparation with synthetic account packs.");
  await page.getByRole("button", { name: "Create briefing", exact: true }).click();
  if (width === 1000) {
    await expect(page.getByRole("alert")).toContainText("Could not prepare");
    await page.getByRole("button", { name: "Retry text and podcast", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: article.title, exact: true })).toBeVisible();
  await expect(page.locator(".po-reading-meta")).toContainText("Microsoft updates");
  await expect(page.getByText("Briefings SDK", { exact: true })).toHaveCount(0);
  const reader = page.getByRole("region", { name: "Scrollable article" });
  await expect(reader).toHaveAttribute("tabindex", "0");
  expect(await reader.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(page.locator(".po-followup")).toHaveCSS("box-shadow", "none");
  const before = await page.getByRole("form", { name: "Briefing controls" }).boundingBox();
  await page.screenshot({ path: info.outputPath(`article-light-${width}.png`), fullPage: true });
  await reader.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByText("You’re all caught up.")).toBeVisible();
  const after = await page.getByRole("form", { name: "Briefing controls" }).boundingBox();
  expect(after!.y).toBe(before!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.getByRole("tab", { name: "Podcast" }).click();
  await page.getByRole("tab", { name: "Text", exact: true }).click();
  expect(await reader.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await reader.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: info.outputPath(`article-dark-${width}.png`), fullPage: true });
});
