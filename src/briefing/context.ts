type BriefingTurn = { prompt: string; answer?: string };

/** Preserve the original brief and current request, retaining whole recent turns. */
export function buildBriefingPrompt(
  originalPrompt: string,
  turns: readonly BriefingTurn[],
  followup: string,
  maxCharacters = 12000,
): string {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters <= 0) {
    throw new RangeError("The prompt character limit must be a positive integer.");
  }
  const before = `Answer the current request within the original brief's context. Use the conversation for continuity, keeping prior answers distinct from the original source material.\n\nOriginal brief:\n${originalPrompt}\n\nConversation (retained turns in chronological order):\n`;
  const after = `\n\nCurrent request:\n${followup}`;
  const omitted = "No prior turns included.";
  if (before.length + omitted.length + after.length > maxCharacters) {
    throw new RangeError("The original brief and current request exceed the prompt character limit.");
  }

  const retained: string[] = [];
  let length = 0;
  for (let index = turns.length - 1; index >= 0; index--) {
    const turn = turns[index]!;
    const text = `User:\n${turn.prompt}${turn.answer === undefined ? "" : `\nAssistant:\n${turn.answer}`}`;
    const nextLength = length + (retained.length ? 2 : 0) + text.length;
    if (before.length + nextLength + after.length > maxCharacters) break;
    retained.push(text);
    length = nextLength;
  }
  return before + (retained.length ? retained.reverse().join("\n\n") : omitted) + after;
}
