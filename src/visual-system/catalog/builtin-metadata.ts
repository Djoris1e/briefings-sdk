import type { EditorialVisualId } from "./editorial-visual.js";
/** Internal scene definitions for footage and quiet editorial beats. */
export type BuiltinSceneId = "cinemaMedia" | EditorialVisualId;

export interface BuiltinSceneDefinition {
  readonly id: BuiltinSceneId;
  readonly defaults: Readonly<Record<string, unknown>>;
  readonly minDuration: number;
  readonly preferredDuration: number;
  readonly timing: {
    readonly contentFields: readonly string[];
    readonly contentUnit: "words";
    readonly revealSeconds: number;
    readonly holdSeconds: number;
    readonly exitSeconds: number;
  };
}

export const SCENE_DEFINITIONS: readonly BuiltinSceneDefinition[] = Object.freeze([
  Object.freeze({
    id: "cinemaMedia" as const,
    defaults: Object.freeze({ mediaUrl: "", mediaType: "video", mediaPoster: "" }),
    minDuration: 3,
    preferredDuration: 6,
    timing: Object.freeze({ contentFields: Object.freeze([]), contentUnit: "words" as const, revealSeconds: 0, holdSeconds: 3, exitSeconds: 0 }),
  }),
  Object.freeze({
    id: "chapterTitle" as const,
    defaults: Object.freeze({ title: "A different perspective" }),
    minDuration: 3,
    preferredDuration: 4,
    timing: Object.freeze({ contentFields: Object.freeze(["title"]), contentUnit: "words" as const, revealSeconds: .8, holdSeconds: 1.5, exitSeconds: .8 }),
  }),
  ...([
    { id: "keyFigure", defaults: { value: "42%", label: "A clear improvement" }, fields: ["value", "label"] },
    { id: "comparison", defaults: { leftLabel: "Before", leftText: "One approach", rightLabel: "After", rightText: "Another approach" }, fields: ["leftLabel", "leftText", "rightLabel", "rightText"] },
    { id: "quote", defaults: { quote: "One idea, clearly expressed.", attribution: "The source" }, fields: ["quote", "attribution"] },
    { id: "editorialTimeline", defaults: { events: [{ label: "First" }, { label: "Then" }, { label: "Finally" }] }, fields: ["events"] },
    { id: "textMedia", defaults: { title: "The useful change", body: "Why this matters to your work." }, fields: ["title", "body"] },
    { id: "personalRelevance", defaults: { person: "You", goal: "Your goal", why: "A practical connection." }, fields: ["person", "goal", "why"] },
    { id: "screenshotSpotlight", defaults: { screenshotId: "source", title: "The source interface", caption: "Review the original evidence." }, fields: ["title", "caption"] },
    { id: "actionSteps", defaults: { title: "Your next steps", steps: [{ label: "Choose", detail: "Select a small test." }, { label: "Review", detail: "Check the result." }] }, fields: ["title", "steps"] },
  ] satisfies Array<{ id: BuiltinSceneId; defaults: Record<string, unknown>; fields: string[] }>).map(scene => Object.freeze({
    id: scene.id,
    defaults: Object.freeze(scene.defaults),
    minDuration: 4,
    preferredDuration: 6,
    timing: Object.freeze({ contentFields: Object.freeze(scene.fields), contentUnit: "words" as const, revealSeconds: .8, holdSeconds: 3, exitSeconds: 0 }),
  })),
]);

export function getBuiltinSceneDefinition(id: string): BuiltinSceneDefinition | undefined {
  return SCENE_DEFINITIONS.find(scene => scene.id === id);
}
