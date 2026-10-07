import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

// Real source components and their native media lifecycle, outside Playwright's JSX stubs.
const source = `
import React from 'react'; import { createRoot } from 'react-dom/client';
import { TitleSceneTemplate } from './src/visual-system/scene-templates/chapter-title';
import { KeyFigureSceneTemplate } from './src/visual-system/scene-templates/key-figure';
import { ComparisonSceneTemplate } from './src/visual-system/scene-templates/comparison';
import { QuoteSceneTemplate } from './src/visual-system/scene-templates/quote';
import { TimelineSceneTemplate } from './src/visual-system/scene-templates/editorial-timeline';
import { TextMediaScene, PersonalRelevanceScene, ActionStepsScene } from './src/visual-system/scene-templates/briefing-scenes';
import { ExternalVideoBackdropProvider } from './src/visual-system/scene-templates/external-video-backdrop';
const components = {chapterTitle:TitleSceneTemplate,keyFigure:KeyFigureSceneTemplate,comparison:ComparisonSceneTemplate,quote:QuoteSceneTemplate,editorialTimeline:TimelineSceneTemplate,textMedia:TextMediaScene,personalRelevance:PersonalRelevanceScene,actionSteps:ActionStepsScene};
const root=createRoot(document.querySelector('#frame')); const fixture=window.editorialFixture;
window.drawEditorial=(changes={})=>{ Object.assign(fixture,changes); root.render(React.createElement(ExternalVideoBackdropProvider,{mode:false,narrationActive:()=>fixture.speaking===true},React.createElement(components[fixture.id],{...fixture,variables:fixture.variables}))); };
window.drawEditorial();
`;
const bundle = execFileSync(process.execPath, ["--input-type=module", "--eval", `import {readFileSync} from 'node:fs';import {build} from 'esbuild';const result=await build({stdin:{contents:readFileSync(0,'utf8'),resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}});process.stdout.write(result.outputFiles[0].text);`], { input: source, encoding: "utf8", timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
const imageUrl = "https://example.com/recorded-image.jpg";
const videoUrl = "https://example.com/recorded-motion.webm";
const cases = {
  chapterTitle: { title: "A useful next step" }, keyFigure: { value: "6 weeks", label: "The supplied review period" },
  comparison: { leftLabel: "Before", leftText: "Review scattered notes", rightLabel: "After", rightText: "Review one source pack" },
  quote: { quote: "Keep a human responsible for the decision.", attribution: "Supplied briefing" },
  editorialTimeline: { events: [{ label: "Choose sources" }, { label: "Review evidence" }, { label: "Approve actions" }] },
  textMedia: { title: "A useful next step", body: "Keep every limiting condition while checking the original source." },
  personalRelevance: { person: "Maya", goal: "Prepare a renewal review", why: "Check the source before promising a result." },
  actionSteps: { title: "Next steps", steps: [{ label: "Select", detail: "Choose one synthetic account." }, { label: "Review", detail: "Check claims and limitations." }] },
};
for (const dimensions of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) test(`editorial footage covers the whole ${dimensions.width}px frame`, async ({ page }, info) => {
  await page.setViewportSize(dimensions);
  await page.route(imageUrl, route => route.fulfill({ contentType: "image/jpeg", path: "tests/browser/fixtures/media-transition/waterfall.jpg" }));
  for (const [id, variables] of Object.entries(cases)) {
    await page.setContent(`<body style="margin:0"><main id="frame" style="position:relative;width:${dimensions.width}px;height:${dimensions.height}px"></main></body>`);
    await page.evaluate(fixture => Object.assign(window, { editorialFixture: fixture }), { id, variables: { ...variables, mediaUrl: imageUrl, mediaType: "photo", mediaKind: "illustration" }, ...dimensions, progress: .7, isPlaying: false });
    await page.addScriptTag({ content: bundle });
    await expect(page.locator('[data-editorial-media="full-bleed"]')).toBeVisible();
    const image = page.locator("#frame img");
    await expect(image).toHaveCount(1);
    await image.evaluate(element => (element as HTMLImageElement).decode());
    expect(await image.boundingBox()).toMatchObject({ x: 0, y: 0, ...dimensions });
    expect(await image.evaluate(element => getComputedStyle(element).objectFit)).toBe("cover");
    const errors = await page.evaluate(() => {
      const errors: string[] = [];
      const frame = document.querySelector("#frame")!.getBoundingClientRect();
      for (const element of document.querySelectorAll("[data-editorial-text], [data-title-composition]")) {
        const range = document.createRange(); range.selectNodeContents(element);
        for (const box of range.getClientRects()) if (box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom - frame.height * .2 + 1) errors.push("Text leaves caption-safe area");
      }
      return errors;
    });
    expect(errors, id).toEqual([]);
    if (id === "textMedia" || id === "keyFigure") await page.screenshot({ path: info.outputPath(`${id}-${dimensions.width}.png`) });
  }
  await page.evaluate(() => {
    const controls = window as unknown as { editorialFixture: { variables: Record<string, unknown> }; drawEditorial(changes: unknown): void };
    controls.drawEditorial({ id: "textMedia", variables: { title: "Original interface", body: "Source pixels are preserved.", mediaUrl: "https://example.com/recorded-image.jpg", mediaType: "photo", mediaKind: "source", mediaAlt: "Approved source image" } });
  });
  await expect(page.getByAltText("Approved source image")).toBeVisible();
  expect(await page.getByAltText("Approved source image").evaluate(element => getComputedStyle(element).objectFit)).toBe("contain");
  await expect(page.getByText("Source screenshot", { exact: true })).toBeVisible();
});

test("one full-frame decoder repeats for narration, pauses and rewinds on replay", async ({ page }, info) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await page.route(videoUrl, route => route.fulfill({ contentType: "video/webm", path: "tests/browser/fixtures/media-transition/waterfall-short.webm" }));
  await page.setContent('<body style="margin:0"><main id="frame" style="position:relative;width:960px;height:540px"></main></body>');
  await page.evaluate(fixture => Object.assign(window, { editorialFixture: fixture }), { id: "textMedia", variables: { ...cases.textMedia, mediaUrl: videoUrl, mediaType: "video" }, width: 960, height: 540, sceneDuration: 12, progress: .3, isPlaying: true, speaking: true });
  await page.addScriptTag({ content: bundle });
  const video = page.locator("video"); await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await video.evaluate(element => { const video = element as HTMLVideoElement; video.currentTime = video.duration - .1; });
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeLessThan(.8);
  await page.evaluate(() => (window as unknown as { drawEditorial(changes: unknown): void }).drawEditorial({ isPlaying: false, progress: .5 }));
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
  const stopped = await video.evaluate(element => (element as HTMLVideoElement).currentTime);
  await page.waitForTimeout(150);
  expect(await video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeCloseTo(stopped, 2);
  await page.evaluate(() => (window as unknown as { drawEditorial(changes: unknown): void }).drawEditorial({ isPlaying: true, progress: 0 }));
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(false);
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(.05);
  await expect(video).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("full-frame-native-video.png") });
});
