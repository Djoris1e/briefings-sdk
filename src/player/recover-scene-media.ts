import { isEditorialMediaTemplate } from "../visual-system/catalog/editorial-media.js";
import type { VideoScene } from "../protocol/types.js";

/** Keep the authored meaning when a built-in scene's optional media cannot decode. */
export function recoverSceneMedia(scene: VideoScene): VideoScene | undefined {
  if (scene.templateId === "cinemaMedia") {
    const title = scene.variables.fallbackText;
    const fallback = typeof title === "string" && title.trim() && [...title].length <= 65 ? title.trim() : "Your response continues.";
    return { ...scene, templateId: "chapterTitle", variables: { title: fallback } };
  }
  if (isEditorialMediaTemplate(scene.templateId) && scene.variables.mediaUrl !== undefined) {
    // Optional footage can fail without erasing a comparison, quotation, list,
    // or a screenshot's original pixels. Never retain the failed URL/poster.
    const { mediaUrl: _url, mediaType: _type, mediaPoster: _poster, mediaDurationSec: _duration, mediaAlt: _alt, mediaKind: _kind, ...variables } = scene.variables;
    return { ...scene, variables };
  }
  return undefined;
}
