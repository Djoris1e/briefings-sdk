import type { VideoScene } from "../protocol/types.js";
import { sanitizeVideoChatMedia } from "../video-chat/media.js";
import { isEditorialMediaTemplate } from "../visual-system/catalog/editorial-media.js";
import { parseEditorialVisual } from "../visual-system/catalog/editorial-visual.js";
import { validateScreenshotAssets } from "../briefing/prepare.js";

/** Validate the actual playback contract, without an extensible template schema. */
export function validateBuiltinScene(scene: Pick<VideoScene, "templateId" | "variables">): void {
  const variables = scene.variables;
  const boundedText = (value: unknown, maximum: number) =>
    typeof value === "string" && Boolean(value.trim()) && [...value].length <= maximum;
  if (scene.templateId !== "cinemaMedia") {
    if (isEditorialMediaTemplate(scene.templateId)) {
      const { mediaUrl, mediaType, mediaPoster, mediaDurationSec, mediaAlt, mediaKind, sourceImageUrl, screenshotAlt, screenshotSourceUrl, ...authored } = variables;
      parseEditorialVisual({ templateId: scene.templateId, variables: authored });
      if (mediaUrl !== undefined) {
        if (!sanitizeVideoChatMedia({ url: mediaUrl, type: mediaType === "photo" ? "image" : mediaType, ...(mediaPoster === undefined ? {} : { posterUrl: mediaPoster }) })) throw new Error("Unsafe template media");
        if (mediaAlt !== undefined && !boundedText(mediaAlt, 300)) throw new Error("Invalid template media description");
        if (mediaKind !== undefined && mediaKind !== "source" && mediaKind !== "illustration") throw new Error("Invalid template media kind");
        if (mediaDurationSec !== undefined && (typeof mediaDurationSec !== "number" || !Number.isFinite(mediaDurationSec) || mediaDurationSec <= 0 || mediaDurationSec > 3600)) throw new Error("Invalid template media duration");
      } else if (mediaType !== undefined || mediaPoster !== undefined || mediaDurationSec !== undefined || mediaAlt !== undefined || mediaKind !== undefined) throw new Error("Template media requires a URL");
      if (scene.templateId === "screenshotSpotlight") {
        validateScreenshotAssets([{ id: authored.screenshotId, url: sourceImageUrl, alt: screenshotAlt, ...(screenshotSourceUrl ? { sourceUrl: screenshotSourceUrl } : {}) }]);
      } else if (sourceImageUrl !== undefined || screenshotAlt !== undefined || screenshotSourceUrl !== undefined) throw new Error("Screenshot fields require a screenshot template");
    } else parseEditorialVisual({ templateId: scene.templateId, variables });
    return;
  }
  if (!sanitizeVideoChatMedia({
    url: variables.mediaUrl,
    type: variables.mediaType === "photo" ? "image" : variables.mediaType,
    ...(variables.mediaPoster ? { posterUrl: variables.mediaPoster } : {}),
  })) throw new Error("Media scene requires a safe media URL and type");
  if (variables.fallbackText !== undefined && !boundedText(variables.fallbackText, 65)) {
    throw new Error("Media recovery title must contain 1–65 characters");
  }
  if (variables.mediaDurationSec !== undefined && (typeof variables.mediaDurationSec !== "number"
    || !Number.isFinite(variables.mediaDurationSec) || variables.mediaDurationSec <= 0 || variables.mediaDurationSec > 3600)) throw new Error("Invalid media duration");
  if (variables.mediaAudio !== undefined && (variables.mediaAudio !== "ambient" || variables.mediaType !== "video")) {
    throw new Error("Media audio must be ambient video sound");
  }
  const allowed = new Set(["mediaUrl", "mediaType", "mediaPoster", "fallbackText", "mediaDurationSec", "mediaAudio"]);
  if (Object.keys(variables).some(key => !allowed.has(key))) throw new Error("Unsupported media variable");
}
