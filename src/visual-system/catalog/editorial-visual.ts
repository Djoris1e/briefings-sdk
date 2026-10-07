/** Bounded, React-free visual contract shared by planner and scene validation. */
export type EditorialVisualId = "chapterTitle" | "keyFigure" | "comparison" | "quote" | "editorialTimeline" | "textMedia" | "personalRelevance" | "screenshotSpotlight" | "actionSteps";

export interface EditorialVisual {
  templateId: EditorialVisualId;
  variables: Record<string, unknown>;
}

const textFields = {
  chapterTitle: { title: 65 },
  keyFigure: { value: 24, label: 90 },
  comparison: { leftLabel: 35, leftText: 100, rightLabel: 35, rightText: 100 },
  quote: { quote: 180, attribution: 65 },
  textMedia: { title: 65, body: 180 },
  personalRelevance: { person: 50, goal: 100, why: 180 },
} as const;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Visual must be an object");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error("Unsupported visual variable");
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || [...value].length > maximum) throw new Error("Invalid visual text");
  return value;
}

export function parseEditorialVisual(value: unknown): EditorialVisual {
  const visual = record(value);
  exactKeys(visual, ["templateId", "variables"]);
  const variables = record(visual.variables);
  if (visual.templateId === "actionSteps") {
    exactKeys(variables, ["title", "steps"]);
    if (!Array.isArray(variables.steps) || variables.steps.length < 2 || variables.steps.length > 4) throw new Error("Action steps require 2–4 entries");
    return { templateId: "actionSteps", variables: { title: text(variables.title, 65), steps: variables.steps.map(value => {
      const step = record(value); exactKeys(step, ["label", "detail"]);
      return { label: text(step.label, 50), detail: text(step.detail, 100) };
    }) } };
  }
  if (visual.templateId === "screenshotSpotlight") {
    exactKeys(variables, ["screenshotId", "title", "caption", "highlight"]);
    const screenshotId = text(variables.screenshotId, 64);
    if (!/^[a-zA-Z0-9_-]+$/u.test(screenshotId)) throw new Error("Invalid screenshot ID");
    let highlight: Record<string, unknown> | undefined;
    if (variables.highlight !== undefined) {
      highlight = record(variables.highlight); exactKeys(highlight, ["x", "y", "width", "height"]);
      const { x, y, width, height } = highlight;
      if (![x, y, width, height].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)
        || Number(width) <= 0 || Number(height) <= 0 || Number(x) + Number(width) > 1 || Number(y) + Number(height) > 1) throw new Error("Invalid screenshot highlight");
    }
    return { templateId: "screenshotSpotlight", variables: { screenshotId, title: text(variables.title, 65), caption: text(variables.caption, 160), ...(highlight ? { highlight: { ...highlight } } : {}) } };
  }
  if (visual.templateId === "editorialTimeline") {
    exactKeys(variables, ["events"]);
    if (!Array.isArray(variables.events) || variables.events.length < 2 || variables.events.length > 5) throw new Error("Timeline requires 2–5 events");
    return { templateId: "editorialTimeline", variables: { events: variables.events.map(value => {
      const event = record(value);
      exactKeys(event, ["label"]);
      return { label: text(event.label, 55) };
    }) } };
  }
  if (typeof visual.templateId !== "string" || !Object.hasOwn(textFields, visual.templateId)) throw new Error("Unsupported visual template");
  const templateId = visual.templateId as keyof typeof textFields;
  const fields = textFields[templateId];
  exactKeys(variables, Object.keys(fields));
  return { templateId, variables: Object.fromEntries(Object.entries(fields).map(([key, maximum]) => [key, text(variables[key], maximum)])) };
}

/** Recover a presentation-only overrun without retaining or truncating rejected
 * text. The caller keeps the complete narration and supplies its bounded title.
 * This never makes an unknown layout or extra model field eligible for media. */
export function recoverEditorialVisual(value: unknown, fallbackTitle: string): { visual: EditorialVisual; recovered: true } | undefined {
  try {
    const visual = record(value);
    if (Object.keys(visual).length !== 2 || !Object.hasOwn(visual, "templateId") || !Object.hasOwn(visual, "variables")) return;
    exactKeys(visual, ["templateId", "variables"]);
    if (visual.templateId !== "chapterTitle" && visual.templateId !== "textMedia") return;
    const variables = record(visual.variables);
    const fields = Object.entries(textFields[visual.templateId]);
    if (Object.keys(variables).length !== fields.length) return;
    exactKeys(variables, fields.map(([key]) => key));
    let overrun = false;
    for (const [key, maximum] of fields) {
      const candidate = variables[key];
      if (!Object.hasOwn(variables, key) || typeof candidate !== "string" || !candidate.trim()) return;
      if ([...candidate].length > maximum) overrun = true;
    }
    if (!overrun) return;
    return { visual: { templateId: "chapterTitle", variables: { title: text(fallbackTitle, 65) } }, recovered: true };
  } catch {
    return;
  }
}
