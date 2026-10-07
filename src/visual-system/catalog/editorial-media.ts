import type { EditorialVisualId } from "./editorial-visual.js";

/** Resolved presentation metadata; never accepted in model-authored visual data. */
const EDITORIAL_MEDIA_FIELDS = [
  "mediaUrl", "mediaType", "mediaPoster", "mediaDurationSec", "mediaAlt", "mediaKind",
] as const;

const mediaTemplates = new Set<string>([
  "chapterTitle", "keyFigure", "comparison", "quote", "editorialTimeline",
  "textMedia", "personalRelevance", "actionSteps", "screenshotSpotlight",
] satisfies EditorialVisualId[]);

/** Only these validated factual layouts can receive server-resolved optional media. */
export function isEditorialMediaTemplate(id: string): id is EditorialVisualId {
  return mediaTemplates.has(id);
}
