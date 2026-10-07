/**
 * Minimal server wiring for the briefings handler.
 *
 * Everything paid or private stays here: provider credentials, the model and
 * voice choice, who may call the endpoint, and how much they may spend. The
 * SDK validates requests and model output; it does not hold a billing ledger.
 * Mount `handleBriefingRequest` at the component's `endpoint` on any runtime
 * with Fetch-standard Request/Response (Cloudflare Workers, Deno, Bun, Node 22
 * with an adapter) and return the Response unchanged so the video can stream.
 */
import { createBriefingHandler, type BriefingHandlerOptions } from "@djoris/briefings/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = "claude-sonnet-4-6";

/** Host authentication: replace with your session or token check. */
async function authorize(request: Request): Promise<boolean> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(token) && token === process.env.BRIEFINGS_HOST_TOKEN;
}

/** One Anthropic call; the SDK supplies the system prompt, user prompt and output schema. */
async function callAnthropic(body: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal, redirect: "manual",
    headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": ANTHROPIC_API_KEY },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (!response.ok) throw new Error(`Provider failed with status ${response.status}`);
  return response;
}

const prepareText: BriefingHandlerOptions["prepareText"] = async request => {
  const response = await callAnthropic({
    max_tokens: request.maxOutputTokens, system: request.systemPrompt,
    messages: [{ role: "user", content: request.userPrompt }],
    output_config: { format: { type: "json_schema", schema: request.outputSchema } },
  }, request.signal);
  const data = await response.json() as { stop_reason?: string; content?: { type: string; text?: string }[] };
  if (data.stop_reason !== "end_turn") throw new Error("Provider did not finish the briefing");
  return (data.content ?? []).filter(part => part.type === "text").map(part => part.text ?? "").join("");
};

const generateText: BriefingHandlerOptions["generateText"] = async request => {
  const response = await callAnthropic({
    max_tokens: request.maxOutputTokens, system: request.systemPrompt,
    messages: [{ role: "user", content: request.userPrompt }],
  }, request.signal);
  const data = await response.json() as { content?: { type: string; text?: string }[] };
  return (data.content ?? []).filter(part => part.type === "text").map(part => part.text ?? "").join("");
};

/** Streams planner text deltas; the SDK parses them into scenes as they arrive. */
const streamText: BriefingHandlerOptions["streamText"] = async function* (request) {
  const response = await callAnthropic({
    max_tokens: 4096, stream: true, system: request.systemPrompt,
    messages: [{ role: "user", content: request.userPrompt }],
  }, request.signal);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";
    for (const event of events) {
      const line = event.split("\n").find(part => part.startsWith("data:"));
      if (!line) continue;
      const data = JSON.parse(line.slice(5)) as { type: string; delta?: { type: string; text?: string } };
      if (data.type === "content_block_delta" && data.delta?.type === "text_delta" && data.delta.text) yield data.delta.text;
    }
    if (done) return;
  }
};

export const handleBriefingRequest = createBriefingHandler({
  authorize,
  // Browsers on these origins may call the endpoint. Omit the option only when
  // the handler is served from the page's own origin without a rewriting proxy.
  allowedOrigins: ["https://app.example.com"],
  prepareText,
  generateText,
  streamText,
  // Optional: generateSpeech (narration and two podcast voices), searchMedia
  // (stock footage) and generateVideo (AI clips). Without them the video uses
  // templates and the podcast reports that speech is unavailable.
  hybrid: true,
  mediaLed: true,
  maxGeneratedVideos: 0,
});
