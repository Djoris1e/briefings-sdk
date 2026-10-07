import { describe, expect, it } from "vitest";
import { parseEditorialVisual, recoverEditorialVisual } from "../src/visual-system/catalog/editorial-visual";

describe("bounded presentation-only visual recovery", () => {
  it.each([
    { templateId: "chapterTitle", variables: { title: "W".repeat(66) } },
    { templateId: "textMedia", variables: { title: "W".repeat(66), body: "Keep the condition." } },
    { templateId: "textMedia", variables: { title: "Source fact", body: "Only if verified. ".repeat(20) } },
  ])("recovers only the overrun with a fresh authored fallback: $templateId", input => {
    const original = JSON.stringify(input);
    expect(() => parseEditorialVisual(input)).toThrow();
    const recovered = recoverEditorialVisual(input, "The supported topic");
    expect(recovered).toEqual({ visual: { templateId: "chapterTitle", variables: { title: "The supported topic" } }, recovered: true });
    expect(parseEditorialVisual(recovered!.visual)).toEqual(recovered!.visual);
    expect(JSON.stringify(input)).toBe(original);
    expect(recovered!.visual.variables).not.toBe(input.variables);
  });

  it("uses the strict parser's Unicode character bounds without trimming or cutting authored strings", () => {
    expect(recoverEditorialVisual({ templateId: "chapterTitle", variables: { title: "😀".repeat(65) } }, "Fallback")).toBeUndefined();
    const title = `  ${"😀".repeat(61)}  `;
    expect(recoverEditorialVisual({ templateId: "chapterTitle", variables: { title: "😀".repeat(66) } }, title)?.visual.variables.title).toBe(title);
    expect(recoverEditorialVisual({ templateId: "textMedia", variables: { title: "Source", body: "界".repeat(180) } }, "Fallback")).toBeUndefined();
  });

  it.each([
    null, [], "textMedia",
    { templateId: "unknown", variables: { title: "W".repeat(66) } },
    { templateId: "personalRelevance", variables: { person: "W".repeat(66), goal: "Goal", why: "Reason" } },
    { templateId: "chapterTitle", variables: { title: "W".repeat(66), mediaUrl: "https://untrusted.example" } },
    { templateId: "chapterTitle", variables: { title: "W".repeat(66) }, mediaUrl: "https://untrusted.example" },
    { templateId: "textMedia", variables: { title: "W".repeat(66) } },
    { templateId: "textMedia", variables: { title: "W".repeat(66), body: 123 } },
    { templateId: "textMedia", variables: { title: "W".repeat(66), body: "   " } },
    { templateId: "chapterTitle", variables: { title: " ".repeat(66) } },
    { templateId: "chapterTitle", variables: { title: "Valid bounded text" } },
    { templateId: "textMedia", variables: { title: "Valid", body: "Valid" } },
  ])("does not authorize media from an unrelated validation failure or valid input (%#)", value => {
    expect(recoverEditorialVisual(value, "Authored fallback")).toBeUndefined();
  });

  it.each(["", "   ", "W".repeat(66)])("rejects an invalid fallback instead of truncating it (%#)", fallback => {
    expect(recoverEditorialVisual({ templateId: "chapterTitle", variables: { title: "W".repeat(66) } }, fallback)).toBeUndefined();
  });
});
