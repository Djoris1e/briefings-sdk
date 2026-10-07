import { describe, expect, it } from "vitest";
import { recoverSceneMedia } from "../src/player/recover-scene-media";
import type { VideoScene } from "../src/protocol/types";

const scene: VideoScene = {
  id: "shot", templateId: "cinemaMedia", timing: { fixedDuration: 5 },
  narration: "The robot plants a seed and waits for the first green shoot.",
  variables: { mediaUrl: "https://media.example/broken.jpg", mediaType: "photo", fallbackText: "A seed of hope" },
};

describe("unusable photo recovery", () => {
  it("keeps the authored anchor, timing and entire narration without retaining a broken URL", () => {
    expect(recoverSceneMedia(scene)).toEqual({ ...scene, templateId: "chapterTitle", variables: { title: "A seed of hope" } });
    expect(scene.variables.mediaUrl).toBeTruthy();
  });
  it("uses a simple recovery chapter with the complete line when no anchor was supplied", () => {
    expect(recoverSceneMedia({ ...scene, variables: { mediaUrl: "broken.jpg" } })).toEqual({
      ...scene, templateId: "chapterTitle", variables: { title: "Your response continues." },
    });
    expect(recoverSceneMedia({ ...scene, templateId: "customerDiagram" })).toBeUndefined();
  });
});


it.each([
  { templateId: "actionSteps", variables: { title: "Next actions", steps: [{ label: "Verify", detail: "Check preview eligibility." }, { label: "Pilot", detail: "Retain human review." }] } },
  { templateId: "comparison", variables: { leftLabel: "Today", leftText: "Manual review", rightLabel: "Pilot", rightText: "Assisted review with approval" } },
  { templateId: "quote", variables: { quote: "Preview only", attribution: "Supplied source" } },
  { templateId: "screenshotSpotlight", variables: { screenshotId: "original", title: "Original screen", caption: "Preview interface", sourceImageUrl: "https://example.com/original.png", screenshotAlt: "Original product pixels", screenshotSourceUrl: "https://example.com/announcement", highlight: { x: .1, y: .1, width: .2, height: .2 } } },
])("recovers failed optional media without changing $templateId content, timing or narration", authored => {
  const plain: VideoScene = { ...scene, ...authored };
  const mixed = { ...plain, variables: { ...plain.variables, mediaUrl: "https://example.com/broken.mp4", mediaType: "video", mediaPoster: "https://example.com/poster.png", mediaDurationSec: 5, mediaKind: "illustration", mediaAlt: "Illustrative activity" } };
  const recovered = recoverSceneMedia(mixed);
  expect(recovered).toEqual(plain);
  expect(recovered?.variables).not.toHaveProperty("mediaUrl");
  expect(mixed.variables.mediaUrl).toBe("https://example.com/broken.mp4");
  expect(recoverSceneMedia(plain)).toBeUndefined();
});
