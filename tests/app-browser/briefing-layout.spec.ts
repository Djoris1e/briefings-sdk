import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { parseEditorialVisual } from "../../src/visual-system/catalog/editorial-visual";

// Compile the real React components outside Playwright's JSX stub transform.
// Mount them in Chromium so fonts, image onLoad and video effects actually run.
const browserSource = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TextMediaScene, PersonalRelevanceScene, ScreenshotSpotlightScene, ActionStepsScene } from './src/visual-system/scene-templates/briefing-scenes.tsx';
const components = { textMedia: TextMediaScene, personalRelevance: PersonalRelevanceScene, screenshotSpotlight: ScreenshotSpotlightScene, actionSteps: ActionStepsScene };
const { templateId, variables, dimensions } = window.__briefingFixture;
const root = createRoot(document.querySelector('#frame'));
window.__seekBriefing = progress => root.render(React.createElement(components[templateId], { variables, ...dimensions, progress, isPlaying: false }));
window.__seekBriefing(.9);
`;
const bundle = execFileSync(process.execPath, ["--input-type=module", "--eval", `
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const result = await build({ stdin: { contents: readFileSync(0, 'utf8'), resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'browser', format: 'iife', write: false, define: { 'process.env.NODE_ENV': '"production"' } });
process.stdout.write(result.outputFiles[0].text);
`], { input: browserSource, encoding: "utf8", timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
const screenshotUrl = "https://example.com/host-screenshot.svg";
const videoUrl = "https://example.com/illustrative-animation.webm";
const screenshotFixture = (width = 960, height = 540) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 960 540"><rect width="960" height="540" fill="#f0f4fa"/><rect width="960" height="70" fill="#122544"/><text x="32" y="46" fill="white" font-family="sans-serif" font-size="28">Source dashboard fixture</text><rect x="45" y="115" width="870" height="360" fill="white" stroke="#8c9aa9"/><text x="80" y="180" fill="#14263f" font-family="sans-serif" font-size="30">Account health</text><rect x="80" y="220" width="520" height="35" fill="#5184bf"/><rect x="80" y="285" width="690" height="35" fill="#619475"/></svg>`;

for (const dimensions of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  for (const alphabet of ["W", "界", "Wide words with spaces "]) {
    test(`briefing templates fit ${dimensions.width}×${dimensions.height}, ${alphabet}`, async ({ page }, testInfo) => {
      await page.setViewportSize(dimensions);
      await page.route(screenshotUrl, route => route.fulfill({ contentType: "image/svg+xml", body: screenshotFixture() }));
      const copy = (length: number) => alphabet.repeat(length).slice(0, length);
      const cases = [
        { templateId: "textMedia", variables: { title: copy(65), body: copy(180) } },
        { templateId: "personalRelevance", variables: { person: copy(50), goal: copy(100), why: copy(180) } },
        { templateId: "screenshotSpotlight", variables: { screenshotId: "host-ui", title: copy(65), caption: copy(160) } },
        { templateId: "actionSteps", variables: { title: copy(65), steps: Array.from({ length: 4 }, () => ({ label: copy(50), detail: copy(100) })) } },
      ].map(parseEditorialVisual);
      for (const visual of [...cases, { ...cases[0], variables: { ...cases[0].variables, mediaUrl: screenshotUrl, mediaType: "image" } }]) {
        const variables = visual.templateId === "screenshotSpotlight" ? { ...visual.variables, sourceImageUrl: screenshotUrl, screenshotAlt: "Host dashboard" } : visual.variables;
        await page.setContent(`<body style="margin:0"><main id="frame" style="position:relative;width:${dimensions.width}px;height:${dimensions.height}px"></main></body>`);
        await page.evaluate(fixture => { Object.assign(window, { __briefingFixture: fixture }); }, { ...visual, variables, dimensions });
        await page.addScriptTag({ content: bundle });
        await expect(page.locator(`[data-template="${visual.templateId}"]`)).toBeVisible();
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
        const collected = new Map<string, Map<number, string>>();
        for (let step = 0; step <= 30; step++) {
          await page.evaluate(async progress => {
            (window as unknown as { __seekBriefing: (progress: number) => void }).__seekBriefing(progress);
            await new Promise(requestAnimationFrame);
          }, step / 30);
          const result = await page.evaluate(() => {
            const frame = document.querySelector("#frame")!.getBoundingClientRect();
            // Measure visible characters one by one. Whole-range rectangles
            // include trailing spaces at wrapped line ends, which some font
            // stacks report a pixel past the column without drawing anything.
            const glyphRects = (element: HTMLElement) => {
              const rects: DOMRect[] = [];
              const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
              for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const text = node.textContent ?? "";
                for (let index = 0; index < text.length; index++) {
                  if (/\s/u.test(text[index]!)) continue;
                  const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 1);
                  const rect = range.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) rects.push(rect);
                }
              }
              return rects;
            };
            const rects = [...document.querySelectorAll<HTMLElement>("[data-editorial-text]")].map(element => ({
              field: element.dataset.copyField!, page: Number(element.dataset.copyPage), text: element.textContent!,
              fontSize: parseFloat(getComputedStyle(element).fontSize), box: element.getBoundingClientRect(), glyphs: glyphRects(element) }));
            const errors: string[] = [];
            for (const { box, glyphs, field, fontSize } of rects) {
              if (frame.width === 390 && ["body", "why", "detail"].some(name => field.endsWith(name)) && fontSize < 17.9) errors.push("Body type became unreadable");
              for (const glyph of glyphs) {
                if (glyph.left < box.left - 1 || glyph.right > box.right + 1) errors.push("Text escapes its column");
                if (glyph.left < frame.left - 1 || glyph.right > frame.right + 1 || glyph.top < frame.top - 1 || glyph.bottom > frame.top + frame.height * .82 + 1) errors.push("Text escapes the caption-safe frame");
              }
            }
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) for (const a of rects[i].glyphs) for (const b of rects[j].glyphs) {
              if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) errors.push("Separate text blocks overlap");
            }
            const media = document.querySelector("[data-source-viewport]")?.getBoundingClientRect();
            if (media) for (const { glyphs } of rects) for (const glyph of glyphs) {
              if (Math.min(glyph.right, media.right) - Math.max(glyph.left, media.left) > 1 && Math.min(glyph.bottom, media.bottom) - Math.max(glyph.top, media.top) > 1) errors.push("Text overlaps the source image");
            }
            const activeActions = document.querySelectorAll("[data-active-action]").length;
            if (activeActions > 1) errors.push("Multiple actions compete at once");
            return { errors, fields: rects.map(({ field, page, text }) => ({ field, page, text })) };
          });
          expect(result.errors, `${visual.templateId}, progress=${step / 30}, media=${Boolean(variables.mediaUrl)}`).toEqual([]);
          for (const field of result.fields) {
            if (!collected.has(field.field)) collected.set(field.field, new Map());
            collected.get(field.field)!.set(field.page, field.text);
          }
        }
        const full = (field: string) => [...collected.get(field)!].sort(([a], [b]) => a - b).map(([, text]) => text).join("");
        const expected: Record<string, string> = visual.templateId === "textMedia" ? { title: copy(65), body: copy(180) }
          : visual.templateId === "personalRelevance" ? { person: `For ${copy(50)}`, goal: copy(100), why: copy(180) }
          : visual.templateId === "screenshotSpotlight" ? { title: copy(65) }
          : { title: copy(65), ...Object.fromEntries(Array.from({ length: 4 }, (_, index) => [[`step-${index}-label`, copy(50)], [`step-${index}-detail`, copy(100)]]).flat()) };
        for (const [field, text] of Object.entries(expected)) expect(full(field), `Every ${field} source character must remain across seeks`).toBe(text);
        if (alphabet === "Wide words with spaces ") await page.screenshot({ path: testInfo.outputPath(`${visual.templateId}${variables.mediaUrl ? "-media" : ""}-${dimensions.width}.png`) });
      }
    });
  }

  test(`source screenshot stays faithful beside animation at ${dimensions.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(dimensions);
    await page.route(screenshotUrl, route => route.fulfill({ contentType: "image/svg+xml", body: screenshotFixture(320, 640) }));
    await page.route(videoUrl, route => route.fulfill({ contentType: "video/webm", path: "tests/browser/fixtures/media-transition/waterfall-short.webm" }));
    await page.setContent(`<body style="margin:0"><main id="frame" style="position:relative;width:${dimensions.width}px;height:${dimensions.height}px"></main></body>`);
    await page.evaluate(fixture => { Object.assign(window, { __briefingFixture: fixture }); }, {
      templateId: "screenshotSpotlight", dimensions, variables: { screenshotId: "host-ui", title: "Your account dashboard", caption: "The source interface remains visible.", sourceImageUrl: screenshotUrl, screenshotAlt: "Host dashboard", mediaUrl: videoUrl, mediaType: "video", highlight: { x: .1, y: .2, width: .4, height: .3 } },
    });
    await page.addScriptTag({ content: bundle });
    const original = page.locator("[data-screenshot-original] > img");
    await expect(original).toBeVisible();
    await expect(original).toHaveAttribute("src", screenshotUrl);
    await expect(page.getByText("Illustrative AI animation", { exact: true })).toBeVisible();
    await expect.poll(() => original.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(320);
    await expect.poll(() => original.evaluate(image => image.getBoundingClientRect().width / image.getBoundingClientRect().height)).toBeCloseTo(.5, 2);
    const video = page.locator("video");
    await expect(video).toBeVisible();
    expect(await video.evaluate(element => (element as HTMLVideoElement).loop)).toBe(false);
    const sourceViewport = await page.locator("[data-source-viewport]").boundingBox();
    const illustration = await page.locator("[data-illustrative-animation]").boundingBox();
    expect(sourceViewport!.x + sourceViewport!.width).toBeLessThanOrEqual(illustration!.x);
    await expect(original).toBeVisible();
    const bounds = await page.locator("[data-screenshot-original]").boundingBox();
    const highlight = await page.locator("[data-screenshot-highlight]").boundingBox();
    expect(bounds).not.toBeNull(); expect(highlight).not.toBeNull();
    expect(highlight!.width / bounds!.width).toBeCloseTo(.4, 2);
    const focused = await original.evaluate(image => image.parentElement!.style.transform);
    expect(focused).not.toContain("scale(1)");
    await page.evaluate(async () => { (window as unknown as { __seekBriefing: (progress: number) => void }).__seekBriefing(0); await new Promise(requestAnimationFrame); });
    await expect(original.locator("..")).toHaveCSS("transform", /^matrix\(1, 0, 0, 1,/u);
    await page.screenshot({ path: testInfo.outputPath(`source-plus-animation-${dimensions.width}.png`) });
  });

  test(`source detail uses the full viewport at ${dimensions.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(dimensions);
    await page.route(screenshotUrl, route => route.fulfill({ contentType: "image/svg+xml", body: screenshotFixture(998, 574) }));
    await page.setContent(`<body style="margin:0"><main id="frame" style="position:relative;width:${dimensions.width}px;height:${dimensions.height}px"></main></body>`);
    await page.evaluate(fixture => { Object.assign(window, { __briefingFixture: fixture }); }, {
      templateId: "screenshotSpotlight", dimensions, variables: { screenshotId: "host-ui", title: "Keep the source in view", caption: "Original product image. Selected region in focus.", sourceImageUrl: screenshotUrl, screenshotAlt: "Host dashboard", highlight: { x: .37, y: .39, width: .4, height: .34 } },
    });
    await page.addScriptTag({ content: bundle });
    const original = page.locator("[data-screenshot-original] > img");
    await expect.poll(() => original.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(998);
    const viewport = await page.locator("[data-source-viewport]").boundingBox();
    expect(viewport!.width).toBeCloseTo(dimensions.width * .88, 1);
    expect(viewport!.height).toBeCloseTo(dimensions.height * (dimensions.height > dimensions.width ? .43 : .55), 1);
    const seek = (progress: number) => page.evaluate(async progress => { (window as unknown as { __seekBriefing: (progress: number) => void }).__seekBriefing(progress); await new Promise(requestAnimationFrame); }, progress);
    await seek(0);
    const overview = await original.boundingBox();
    expect(overview!.width / overview!.height).toBeCloseTo(998 / 574, 2);
    expect(overview!.x).toBeGreaterThanOrEqual(viewport!.x - 1);
    expect(overview!.y).toBeGreaterThanOrEqual(viewport!.y - 1);
    expect(overview!.x + overview!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width + 1);
    expect(overview!.y + overview!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 1);
    await seek(.9);
    const focused = await original.boundingBox();
    expect(focused!.width).toBeGreaterThanOrEqual(viewport!.width);
    expect(focused!.height).toBeGreaterThanOrEqual(viewport!.height);
    expect(focused!.width / focused!.height).toBeCloseTo(998 / 574, 2);
    const highlight = await page.locator("[data-screenshot-highlight]").boundingBox();
    expect(highlight!.x + highlight!.width / 2).toBeCloseTo(viewport!.x + viewport!.width / 2, 1);
    expect(highlight!.y + highlight!.height / 2).toBeCloseTo(viewport!.y + viewport!.height / 2, 1);
    await expect(original).toHaveAttribute("src", screenshotUrl);
    await page.screenshot({ path: testInfo.outputPath(`source-detail-large-${dimensions.width}.png`) });
  });
}
