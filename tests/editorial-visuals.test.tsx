import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseEditorialVisual } from "../src/visual-system/catalog/editorial-visual";
import { validateBuiltinScene } from "../src/server/scene-validation";
import { KeyFigureSceneTemplate } from "../src/visual-system/scene-templates/key-figure";
import { ComparisonSceneTemplate } from "../src/visual-system/scene-templates/comparison";
import { QuoteSceneTemplate } from "../src/visual-system/scene-templates/quote";
import { TimelineSceneTemplate } from "../src/visual-system/scene-templates/editorial-timeline";

const visuals = [
  { templateId: "keyFigure", variables: { value: "42%", label: "Less energy" } },
  { templateId: "comparison", variables: { leftLabel: "Before", leftText: "Slow", rightLabel: "After", rightText: "Fast" } },
  { templateId: "quote", variables: { quote: "Keep the exact words.", attribution: "Source" } },
  { templateId: "editorialTimeline", variables: { events: [{ label: "Start" }, { label: "Finish" }] } },
];

describe("editorial scene contract", () => {
  it.each(visuals)("accepts $templateId through both planner and playback validation", visual => {
    expect(parseEditorialVisual(visual)).toEqual(visual);
    expect(() => validateBuiltinScene(visual)).not.toThrow();
  });

  it("rejects unsupported variables, oversized text and malformed events", () => {
    for (const visual of [
      { ...visuals[0], variables: { ...visuals[0].variables, mediaUrl: "https://example.com/clip.mp4" } },
      { templateId: "keyFigure", variables: { value: "4".repeat(25), label: "Too long" } },
      { templateId: "quote", variables: { quote: "Words", attribution: " " } },
      { templateId: "editorialTimeline", variables: { events: [{ label: "Only one" }] } },
      { templateId: "editorialTimeline", variables: { events: [{ label: "A", date: "invented" }, { label: "B" }] } },
      { templateId: "editorialTimeline", variables: { events: [null, { label: "B" }] } },
    ]) expect(() => parseEditorialVisual(visual)).toThrow();
  });

  it("copies accepted arrays so later planner mutations do not alter a scene", () => {
    const input = { templateId: "editorialTimeline", variables: { events: [{ label: "A" }, { label: "B" }] } };
    const parsed = parseEditorialVisual(input);
    input.variables.events[0].label = "Changed";
    expect(parsed.variables.events).toEqual([{ label: "A" }, { label: "B" }]);
  });
});

describe("editorial rendering", () => {
  const components = [KeyFigureSceneTemplate, ComparisonSceneTemplate, QuoteSceneTemplate, TimelineSceneTemplate];
  it.each(["portrait", "landscape"])("renders every restored visual without media in %s", orientation => {
    components.forEach((component, index) => {
      const props = { variables: visuals[index].variables, width: orientation === "portrait" ? 1080 : 1920, height: orientation === "portrait" ? 1920 : 1080, progress: .7 };
      const html = renderToStaticMarkup(createElement(component, props));
      expect(html).toContain(`data-template="${visuals[index].templateId}"`);
      expect(html).not.toMatch(/<video|<img|NaN|Infinity/);
      // Re-seeking to the same time has no wall-clock state.
      renderToStaticMarkup(createElement(component, { ...props, progress: .1 }));
      expect(renderToStaticMarkup(createElement(component, props))).toBe(html);
    });
  });

  it("preserves supplied figures and exact quotation words throughout their reveal", () => {
    for (const progress of [.1, .5, .9]) {
      const props = { width: 1080, height: 1920, progress };
      expect(renderToStaticMarkup(createElement(KeyFigureSceneTemplate, { ...props, variables: visuals[0].variables }))).toContain("42%");
      expect(renderToStaticMarkup(createElement(QuoteSceneTemplate, { ...props, variables: visuals[2].variables }))).toContain("Keep the exact words.");
    }
  });
});
