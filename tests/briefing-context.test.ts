import { describe, expect, it } from "vitest";
import { buildBriefingPrompt } from "../app/briefing-context";

describe("buildBriefingPrompt", () => {
  it("preserves the original and latest request verbatim with chronological conversation", () => {
    const original = "  Fictional leader: Maya.\nGoal: reduce review time.\n ";
    const latest = "  Which action first?\nKeep the owner visible.  ";
    const prompt = buildBriefingPrompt(original, [
      { prompt: "What changed?", answer: "A dated release summary." },
      { prompt: "How does it support my goal?", answer: "An experiment, not a guaranteed saving." },
    ], latest);
    expect(prompt).toContain(`Original brief:\n${original}\n\nConversation`);
    expect(prompt.endsWith(`Current request:\n${latest}`)).toBe(true);
    expect(prompt).toContain("User:\nWhat changed?\nAssistant:\nA dated release summary.");
    expect(prompt.indexOf("What changed?")).toBeLessThan(prompt.indexOf("How does it support my goal?"));
    expect(prompt).toContain("within the original brief's context");
  });

  it("drops the oldest whole turns first and retains the newest full question and answer", () => {
    const original = "The original source and goals stay here.";
    const latest = "Explain the next step.";
    const newest = { prompt: "Recent question", answer: "Recent answer that must not be truncated." };
    const limit = buildBriefingPrompt(original, [newest], latest).length;
    const turns = Object.freeze([
      Object.freeze({ prompt: "Oldest question", answer: "Oldest answer." }),
      Object.freeze({ prompt: "Middle question", answer: "Middle answer." }),
      Object.freeze(newest),
    ]);
    const result = buildBriefingPrompt(original, turns, latest, limit);
    expect(result.length).toBe(limit);
    expect(result).not.toContain("Oldest question");
    expect(result).not.toContain("Middle question");
    expect(result).toContain(`User:\n${newest.prompt}\nAssistant:\n${newest.answer}`);
    expect(turns).toHaveLength(3);
  });

  it("keeps a contiguous recent suffix instead of reviving older context when the latest turn cannot fit", () => {
    const required = buildBriefingPrompt("Source", [], "Follow-up");
    const result = buildBriefingPrompt("Source", [
      { prompt: "Old" },
      { prompt: "Newest", answer: "Large recent answer. ".repeat(100) },
    ], "Follow-up", required.length + 30);
    expect(result).toBe(required);
  });

  it("includes unanswered prior requests without inventing an assistant response", () => {
    const result = buildBriefingPrompt("Source", [{ prompt: "A question that was interrupted" }], "Try again");
    expect(result).toContain("User:\nA question that was interrupted");
    expect(result).not.toContain("Assistant:");
  });

  it("rejects an oversized latest request rather than cutting it or the original brief", () => {
    const original = "Original evidence.";
    const latest = "A complete latest request.";
    const required = buildBriefingPrompt(original, [], latest);
    expect(buildBriefingPrompt(original, [], latest, required.length)).toBe(required);
    expect(() => buildBriefingPrompt(original, [], latest, required.length - 1)).toThrow(/original brief and current request/);
    expect(() => buildBriefingPrompt(original, [], "x".repeat(12000))).toThrow(RangeError);
    expect(() => buildBriefingPrompt("x".repeat(12000), [], latest)).toThrow(RangeError);
  });

  it("bounds large histories by the default limit while keeping the latest request", () => {
    const turns = Array.from({ length: 100 }, (_, index) => ({ prompt: `Question ${index}`, answer: "A substantive answer. ".repeat(30) }));
    const result = buildBriefingPrompt("Original grounding.", turns, "My current question.");
    expect(result.length).toBeLessThanOrEqual(12000);
    expect(result).toContain("Question 99");
    expect(result).not.toContain("User:\nQuestion 0\n");
    expect(result.endsWith("My current question.")).toBe(true);
  });

  it.each([0, -1, 3.5, Infinity, NaN])("rejects an invalid limit %s", limit => {
    expect(() => buildBriefingPrompt("Source", [], "Question", limit)).toThrow(RangeError);
  });
});
