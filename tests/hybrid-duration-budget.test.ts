import { describe, expect, it } from "vitest";
import { createVideoChatHandler } from "../src/server/create-video-chat-handler";
import { decodeVideoSse } from "../src/protocol/sse";
import { estimateNarrationSeconds, CLIP_NARRATION_TAIL_SEC } from "../src/protocol/clip-budget";

async function run(wordsPerScene: number[]) {
  const narrations = wordsPerScene.map((words, index) => `${Array(words - 2).fill("context").join(" ")} Fact ${String.fromCharCode(65 + index)}.`);
  const shots = narrations.map((narration, index) => ({ type: "shot", title: `Fact ${String.fromCharCode(65 + index)}`,
    narration, subject: "supplied facts", action: "", visual: {
      templateId: "chapterTitle", variables: { title: `Fact ${String.fromCharCode(65 + index)}` },
    } }));
  const handler = createVideoChatHandler({
    authorize: "none", heartbeatMs: false, hybrid: true,
    generateText: () => { throw new Error("Template content must not require an extra rewrite"); },
    streamText: async function* () {
      yield JSON.stringify({ type: "answer", intent: "explanation", opening: "", subject: "supplied facts",
        development: "Preserve each essential fact before concluding.", visualDirection: "Clear typography." }) + "\n";
      yield JSON.stringify(shots[0]) + "\n";
      yield JSON.stringify({ ...shots.at(-1), type: "ending" }) + "\n";
      for (const shot of shots.slice(1, -1)) yield JSON.stringify(shot) + "\n";
    },
  });
  const response = await handler(new Request("https://app.example/api?action=response", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Turn the supplied detailed briefing into a clear video. Preserve its essential facts; the duration is approximate." }),
  }));
  const events = [];
  for await (const event of decodeVideoSse(response.body!)) events.push(event);
  const scenes = events.flatMap(event => event.type === "scene.add" ? [event.data.scene] : []);
  return { events, scenes, narrations };
}

describe("hybrid duration headroom", () => {
  it("preserves a moderately longer complete briefing, including its ending, without a partial-answer warning", async () => {
    const result = await run([45, 26, 26, 26, 26, 26, 26]);
    const estimated = result.narrations.reduce((total, line) => total + estimateNarrationSeconds(line) + CLIP_NARRATION_TAIL_SEC, 0);
    expect(estimated).toBeGreaterThan(75);
    expect(estimated).toBeLessThan(120);
    expect(result.scenes.map(scene => scene.narration)).toEqual(result.narrations);
    expect(result.events.some(event => event.type === "response.warning" || event.type === "response.error")).toBe(false);
    expect(result.events.at(-1)).toMatchObject({ type: "response.complete", data: { finishReason: "stop" } });
  });

  it("retains a bounded timeline and an explicit incomplete result when authored speech exceeds the safety ceiling", async () => {
    const result = await run(Array(10).fill(45));
    expect(result.scenes.length).toBeLessThan(10);
    expect(result.scenes.at(-1)?.narration).toBe(result.narrations.at(-1));
    const seconds = result.scenes.reduce((total, scene) => total + scene.timing.fixedDuration!, 0);
    expect(seconds).toBeLessThanOrEqual(120);
    expect(result.events.some(event => event.type === "response.warning")).toBe(true);
    expect(result.events.at(-1)).toMatchObject({ type: "response.complete", data: { finishReason: "other" } });
  });
});
