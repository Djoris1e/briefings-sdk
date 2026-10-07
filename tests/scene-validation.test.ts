import { describe, expect, it } from "vitest";
import { parseEditorialVisual } from "../src/visual-system/catalog/editorial-visual";
import { validateBuiltinScene } from "../src/server/scene-validation";

describe("supported scene kinds", () => {
  it("accepts chapter recovery and application-resolved footage", () => {
    expect(() => validateBuiltinScene({ templateId: "chapterTitle", variables: { title: "A grounded answer" } })).not.toThrow();
    expect(() => validateBuiltinScene({ templateId: "cinemaMedia", variables: { mediaUrl: "https://app.test/clip.mp4", mediaType: "video", fallbackText: "An answer" } })).not.toThrow();
  });
  it("rejects incomplete editorial scenes and unsafe media", () => {
    expect(() => validateBuiltinScene({ templateId: "comparison", variables: {} })).toThrow();
    expect(() => validateBuiltinScene({ templateId: "cinemaMedia", variables: { mediaUrl: "javascript:alert(1)", mediaType: "video" } })).toThrow();
    expect(() => validateBuiltinScene({ templateId: "chapterTitle", variables: { title: "" } })).toThrow();
  });
});


describe("optional media alongside factual editorial layouts", () => {
  const visual = { templateId: "actionSteps", variables: { title: "Review first", steps: [{ label: "Check", detail: "Verify eligibility." }, { label: "Pilot", detail: "Use synthetic records." }] } };
  const media = { mediaUrl: "https://example.com/source.png", mediaType: "photo", mediaKind: "source", mediaAlt: "Original product screenshot" };
  it("retains structured authored data while validating server-resolved media", () => {
    expect(() => validateBuiltinScene({ ...visual, variables: { ...visual.variables, ...media } })).not.toThrow();
    expect(() => validateBuiltinScene({ templateId: "chapterTitle", variables: { title: "Preview only", ...media } })).not.toThrow();
    expect(() => validateBuiltinScene({ templateId: "personalRelevance", variables: { person: "Maya", goal: "Review faster", why: "Try a small pilot.", ...media } })).not.toThrow();
    expect(() => validateBuiltinScene({ templateId: "quote", variables: { quote: "Preview only.", attribution: "Supplied source", ...media, mediaType: "video", mediaKind: "illustration", mediaDurationSec: 5 } })).not.toThrow();
  });
  it.each([
    { mediaUrl: "javascript:alert(1)" }, { mediaKind: "evidence" }, { mediaAlt: "a".repeat(301) },
    { mediaDurationSec: 0 }, { mediaPoster: "javascript:alert(1)" }, { mediaPoster: false }, { sourceImageUrl: "https://example.com/unlisted.png" },
    { imageUrl: "https://example.com/unlisted.png" }, { extraFact: "Unsupported" },
  ])("rejects unsafe or unlisted fields instead of weakening the authored contract: %j", extra => {
    expect(() => validateBuiltinScene({ ...visual, variables: { ...visual.variables, ...media, ...extra } })).toThrow();
  });
  it("requires an actual media URL for media metadata and still validates the factual fields", () => {
    expect(() => validateBuiltinScene({ ...visual, variables: { ...visual.variables, mediaKind: "source" } })).toThrow();
    expect(() => validateBuiltinScene({ ...visual, variables: { ...visual.variables, ...media, steps: [] } })).toThrow();
    expect(() => validateBuiltinScene({ templateId: "unknown", variables: { ...visual.variables, ...media } })).toThrow();
  });
});


it("continues rejecting server-owned media metadata in model-authored visuals", () => {
  for (const extra of [{ mediaUrl: "https://example.com/clip.mp4" }, { mediaKind: "source" }, { mediaAlt: "An original" }]) {
    expect(() => parseEditorialVisual({ templateId: "chapterTitle", variables: { title: "Source", ...extra } })).toThrow();
  }
});
