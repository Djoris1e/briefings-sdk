import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { editorialEntrance, editorialPage, editorialType, paginateEditorialText } from "../src/visual-system/scene-templates/editorial-typography";
import { ComparisonSceneTemplate } from "../src/visual-system/scene-templates/comparison";
import { TimelineSceneTemplate } from "../src/visual-system/scene-templates/editorial-timeline";
import { TitleSceneTemplate } from "../src/visual-system/scene-templates/chapter-title";

describe("readable editorial composition", () => {
  it.each(["W".repeat(180), "界".repeat(180), "Exact words, punctuation — and  two spaces. ".repeat(6), "👩🏽‍💻 A factual quote\nwith a line break. ".repeat(8)])("keeps complete copy while paging at a fixed font size", text => {
    const pages = paginateEditorialText(text, 268, 180, 32, 1.2);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every(page => page.length > 0)).toBe(true);
    expect(pages.join("")).toBe(text);
    expect(paginateEditorialText(text, 268, 180, 32, 1.2)).toEqual(pages);
  });

  it("holds at full opacity after a fixed 400ms entrance, including the end", () => {
    for (const duration of [2, 6, 20]) {
      expect(editorialEntrance(.2 / duration, duration)).toBe(.5);
      expect(editorialEntrance(.4 / duration, duration)).toBe(1);
      expect(editorialEntrance(1, duration)).toBe(1);
    }
  });

  it("uses physical type floors and safe deterministic seek endpoints", () => {
    expect(editorialType(390)).toEqual({ title: 39, body: 17.94, label: 14.82, figure: 93.6 });
    expect([-.1, 0, .49, .5, 1, 1.1].map(progress => editorialPage(progress, 2))).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it("gives each comparison side its own frame and returns to identical content when seeking", () => {
    const props = { width: 390, height: 844, variables: { leftLabel: "Before", leftText: "Manual review", rightLabel: "After", rightText: "A supported draft" }, sceneDuration: 8 };
    const first = renderToStaticMarkup(createElement(ComparisonSceneTemplate, { ...props, progress: .25 }));
    const next = renderToStaticMarkup(createElement(ComparisonSceneTemplate, { ...props, progress: .75 }));
    expect(first).toContain("Manual review"); expect(first).not.toContain("A supported draft");
    expect(next).toContain("A supported draft"); expect(next).not.toContain("Manual review");
    expect(renderToStaticMarkup(createElement(ComparisonSceneTemplate, { ...props, progress: .25 }))).toBe(first);
  });

  it("shows every milestone in order instead of compressing all five into a slide", () => {
    const events = ["Gather", "Check", "Draft", "Review", "Decide"].map(label => ({ label }));
    for (const [index, event] of events.entries()) {
      const html = renderToStaticMarkup(createElement(TimelineSceneTemplate, { width: 320, height: 568, progress: (index + .8) / events.length, variables: { events } }));
      expect(html).toContain(event.label);
      for (const other of events.filter(item => item !== event)) expect(html).not.toContain(other.label);
    }
  });

  it("keeps a chapter visible at the final frame without a fade to black", () => {
    const html = renderToStaticMarkup(createElement(TitleSceneTemplate, { width: 390, height: 844, progress: 1, sceneDuration: 12, variables: { title: "One clear thought" } }));
    expect(html).toContain("opacity:1");
    expect(html).toContain("One clear thought");
    expect(html).not.toContain("text-shadow");
  });
});
