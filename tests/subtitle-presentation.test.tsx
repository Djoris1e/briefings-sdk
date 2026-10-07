// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { splitSubtitlePhrases } from "../src/video-chat/caption-phrases";
import { CaptionWords } from "../src/video-chat/caption-words";
import type { CaptionProgress } from "../src/video-chat/caption-progress";
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("keeps complete qualifiers in stable bounded cues without splitting words", () => {
  for (const text of ["Maya, confirm your tenant's eligibility before enabling the pilot. Availability is not confirmed.", "This is not a proven improvement; compare against the current workflow.", "Yes!", "Pneumonoultramicroscopicsilicovolcanoconiosis remains one word.", "光に向かって成長します。", "one two three four five six seven eight"]) {
    const cues = splitSubtitlePhrases(text);
    expect(cues.flatMap(cue => cue.words).join(" ")).toBe(text);
    let offset = 0;
    for (const cue of cues) { expect(cue.start).toBe(offset); offset += cue.words.length; expect(cue.words.length).toBeLessThanOrEqual(7); expect(cue.words.join(" ").length).toBeLessThanOrEqual(Math.max(48, ...cue.words.map(word => word.length))); }
  }
  expect(splitSubtitlePhrases(" ")).toEqual([]);
});
it("holds the same subtitle cue across spoken words and advances with the real speech clock", () => {
  vi.useFakeTimers();
  const text = "Confirm eligibility before starting the pilot. Review each result with its source.";
  let wordIndex = 0;
  const getProgress = (): CaptionProgress => ({text, elapsedSeconds: wordIndex * .3, durationSeconds: 5, timing: "estimated", alignment: "browser", wordIndex});
  const view = render(<CaptionWords text={text} getProgress={getProgress} presentation="subtitles" />);
  const first = view.container.textContent;
  expect(first).toBe("Confirm eligibility before starting the pilot.");
  wordIndex = 4; act(() => vi.advanceTimersByTime(50));
  expect(view.container.textContent).toBe(first);
  expect(view.container.querySelector('[data-active="true"]')).toBeNull();
  wordIndex = 7; act(() => vi.advanceTimersByTime(50));
  expect(view.container.textContent).toBe("Review each result with its source.");
});
