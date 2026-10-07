import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { parseEditorialVisual } from "../../src/visual-system/catalog/editorial-visual";

// Playwright transforms imported JSX into its component-test stubs. Render the
// actual source in a bounded tsx subprocess, then measure that HTML in Chromium.
const renderSource = `
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TitleSceneTemplate } from './src/visual-system/scene-templates/chapter-title.tsx';
import { KeyFigureSceneTemplate } from './src/visual-system/scene-templates/key-figure.tsx';
import { ComparisonSceneTemplate } from './src/visual-system/scene-templates/comparison.tsx';
import { QuoteSceneTemplate } from './src/visual-system/scene-templates/quote.tsx';
import { TimelineSceneTemplate } from './src/visual-system/scene-templates/editorial-timeline.tsx';
const components = { chapterTitle: TitleSceneTemplate, keyFigure: KeyFigureSceneTemplate, comparison: ComparisonSceneTemplate,
  quote: QuoteSceneTemplate, editorialTimeline: TimelineSceneTemplate };
const { cases, dimensions } = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(cases.map(({ templateId, variables }) => {
  const frames = [];
  for (let seek = 0; seek <= 100; seek++) {
    const html = renderToStaticMarkup(createElement(components[templateId], { variables, ...dimensions, progress: seek / 100, sceneDuration: 12 }));
    const words = [...html.matchAll(/data-editorial-text="[^"]+"[^>]*>(.*?)<\\/div>/g)].map(match => match[1]);
    const identity = html.match(/data-(?:comparison-side|active-step)="([^"]+)"/)?.[1] ?? '';
    const pagination = [...html.matchAll(/data-editorial-page="([^"]+)"/g)].map(match => match[1]);
    const key = JSON.stringify([identity, pagination, words]);
    if (frames.at(-1)?.key === key) frames[frames.length - 1] = { key, html };
    else frames.push({ key, html });
  }
  return frames.map(frame => frame.html);
})));
`;

// Real browser typography at the accepted limits; SSR alone cannot establish fit.
for (const dimensions of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  for (const alphabet of ["W", "界", "Wide words with spaces "]) {
    test(`editorial text fits ${dimensions.width}×${dimensions.height}, ${alphabet}`, async ({ page }) => {
      await page.setViewportSize(dimensions);
      const copy = (length: number) => alphabet.repeat(length).slice(0, length);
      const cases = [
        { templateId: "chapterTitle", variables: { title: copy(65) } },
        { templateId: "keyFigure", variables: { value: copy(24), label: copy(90) } },
        { templateId: "comparison", variables: { leftLabel: copy(35), rightLabel: copy(35), leftText: copy(100), rightText: copy(100) } },
        { templateId: "quote", variables: { quote: copy(180), attribution: copy(65) } },
        { templateId: "editorialTimeline", variables: { events: Array.from({ length: 5 }, () => ({ label: copy(55) })) } },
      ].map(parseEditorialVisual);
      const rendered = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", renderSource], {
        input: JSON.stringify({ cases, dimensions }), encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024,
      })) as string[][];
      for (const [index, { templateId }] of cases.entries()) {
        const textRuns = new Map<string, Map<string, string>>();
        for (const html of rendered[index]) {
        await page.setContent(`<body style="margin:0"><main id="frame" style="position:relative;width:${dimensions.width}px;height:${dimensions.height}px">${html}</main></body>`);
        await page.evaluate(() => document.fonts.ready);
        const result = await page.evaluate(() => {
          const frame = document.querySelector("#frame")!.getBoundingClientRect();
          const elements = [...document.querySelectorAll<HTMLElement>("[data-editorial-text]")];
          const rects = elements.map(element => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return { field: element.dataset.editorialText!, pagination: element.dataset.editorialPage ?? "constant", text: element.textContent!, font: Number.parseFloat(getComputedStyle(element).fontSize), box: element.getBoundingClientRect(), glyphs: [...range.getClientRects()] };
          });
          const errors: string[] = [];
          for (const { box, glyphs, font } of rects) {
            if (font < Math.min(frame.width, frame.height) * .038 - .01) errors.push("Type falls below the label readability floor");
            for (const glyph of glyphs) {
              if (glyph.left < box.left - 1 || glyph.right > box.right + 1) errors.push("Text escapes its column");
              if (glyph.left < frame.left - 1 || glyph.right > frame.right + 1 || glyph.top < frame.top - 1 || glyph.bottom > frame.top + frame.height * .8 + 1) errors.push("Text escapes the safe frame");
            }
          }
          for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
              for (const a of rects[i].glyphs) for (const b of rects[j].glyphs) {
                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) errors.push("Separate text blocks overlap");
              }
            }
          }
          const identity = document.querySelector('[data-comparison-side]')?.getAttribute('data-comparison-side') ?? document.querySelector('[data-active-step]')?.getAttribute('data-active-step') ?? '';
          return { errors, texts: rects.map(({ field, text, pagination }) => ({ key: identity + ':' + field, text, pagination })) };
        });
        expect(result.errors, templateId).toEqual([]);
        for (const { key, text, pagination } of result.texts) {
          const runs = textRuns.get(key) ?? new Map<string, string>();
          runs.set(pagination, text);
          textRuns.set(key, runs);
        }
        }
        const actual = [...textRuns.values()].map(runs => [...runs.values()].join(""));
        const expected = templateId === "chapterTitle" ? [copy(65)] : templateId === "editorialTimeline"
          ? Array.from({ length: 5 }, () => copy(55))
          : templateId === "comparison"
            ? [copy(35), copy(100), copy(35), copy(100)]
            : templateId === "quote" ? [`“${copy(180)}”`, copy(65)] : [copy(24), copy(90)];
        expect(actual, "Seeking across every page must preserve every supplied character").toEqual(expected);
      }
    });
  }
}
