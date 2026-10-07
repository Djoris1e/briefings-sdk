/** Recorded-provider substitute: content is supplied by the test, never a live generation. */
export function briefingFixture(prompt: string, summary: string) {
  return { version: 1, id: "fixture", prompt, summary, facts: [{ id: "fact1", text: summary, evidence: prompt.slice(0, 100) }], priorities: [],
    podcast: { turns: [
      { id: "turn1", speaker: "host", text: "What matters here?", factIds: ["fact1"] },
      { id: "turn2", speaker: "analyst", text: summary, factIds: ["fact1"] },
    ] }, screenshots: [] };
}
