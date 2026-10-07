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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const MODEL = "gpt-6-sol";
const unavailable = () => new Error("Provider is temporarily unavailable.");

/** Host authentication: replace with your session or token check. */
async function authorize(request: Request): Promise<boolean> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(token) && token === process.env.BRIEFINGS_HOST_TOKEN;
}

/** Keep provider errors, credentials and redirect destinations private. */
async function callOpenAI(path: "responses" | "audio/speech", body: object, signal: AbortSignal) {
  if (!OPENAI_API_KEY || signal.aborted) throw unavailable();
  let response: Response | undefined;
  try {
    response = await fetch(`https://api.openai.com/v1/${path}`, {
      method: "POST", signal, redirect: "manual",
      headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!response.ok || signal.aborted || !response.body) throw unavailable();
    return response;
  } catch {
    await response?.body?.cancel().catch(() => {});
    throw unavailable();
  }
}

/** Bounds the whole response and cancels on abort or a consumer closing early. */
async function* readChunks(response: Response, signal: AbortSignal, mediaType: string, maximum: number) {
  const reader = response.body!.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== mediaType ||
      Number(response.headers.get("content-length")) > maximum) throw unavailable();
    let length = 0;
    for (;;) {
      if (signal.aborted) throw unavailable();
      const { value, done } = await reader.read();
      if (signal.aborted) throw unavailable();
      if (done) { if (!length) throw unavailable(); return; }
      length += value.byteLength;
      if (length > maximum) throw unavailable();
      yield value;
    }
  } catch { throw unavailable(); }
  finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function readBytes(response: Response, signal: AbortSignal, mediaType: string, maximum: number) {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of readChunks(response, signal, mediaType, maximum)) {
    chunks.push(chunk); length += chunk.byteLength;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

interface ModelResponse {
  status?: string;
  error?: unknown;
  incomplete_details?: unknown;
  output?: { type: string; status?: string; content?: { type: string; text?: string }[] }[];
}
function completedText(data: ModelResponse): string {
  if (data.status !== "completed" || data.error || data.incomplete_details || !Array.isArray(data.output)) throw unavailable();
  let text = "";
  for (const item of data.output) {
    if (item.type === "reasoning") continue;
    if (item.type !== "message" || item.status !== "completed" || !Array.isArray(item.content)) throw unavailable();
    for (const part of item.content) {
      if (part.type !== "output_text" || typeof part.text !== "string") throw unavailable();
      text += part.text;
    }
  }
  if (!text.trim()) throw unavailable();
  return text;
}

function textBody(systemPrompt: string, userPrompt: string, maxOutputTokens: number) {
  return { model: MODEL, reasoning: { effort: "none" }, store: false,
    instructions: systemPrompt, input: [{ role: "user", content: userPrompt }], max_output_tokens: maxOutputTokens };
}
async function generate(body: object, signal: AbortSignal): Promise<string> {
  try {
    const response = await callOpenAI("responses", body, signal);
    const bytes = await readBytes(response, signal, "application/json", 256 * 1024);
    return completedText(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as ModelResponse);
  } catch { throw unavailable(); }
}

const prepareText: BriefingHandlerOptions["prepareText"] = request => generate({
  ...textBody(request.systemPrompt, request.userPrompt, request.maxOutputTokens),
  text: { format: { type: "json_schema", name: "briefing", strict: true, schema: request.outputSchema } },
}, request.signal);

const generateText: BriefingHandlerOptions["generateText"] = request => generate(
  textBody(request.systemPrompt, request.userPrompt, request.maxOutputTokens), request.signal,
);

/** Stream Responses text deltas; require a successful terminal response. */
const streamText: BriefingHandlerOptions["streamText"] = async function* (request) {
  try {
    const response = await callOpenAI("responses", {
      ...textBody(request.systemPrompt, request.userPrompt, 4096), stream: true,
    }, request.signal);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "";
    let emitted = "";
    for await (const chunk of readChunks(response, request.signal, "text/event-stream", 2 * 1024 * 1024)) {
      buffer += decoder.decode(chunk, { stream: true });
      const records = buffer.split(/\r?\n\r?\n/);
      buffer = records.pop() ?? "";
      if (buffer.length > 256 * 1024) throw unavailable();
      for (const record of records) {
        if (request.signal.aborted || record.length > 256 * 1024) throw unavailable();
        const lines = record.split(/\r?\n/).filter(line => line.startsWith("data:"));
        if (!lines.length) continue;
        const event = JSON.parse(lines.map(line => line.slice(5).trimStart()).join("\n")) as {
          type: string; delta?: string; response?: ModelResponse;
        };
        if (["error", "response.failed", "response.incomplete"].includes(event.type) || event.type.startsWith("response.refusal.")) throw unavailable();
        if (event.type === "response.output_text.delta") {
          if (typeof event.delta !== "string") throw unavailable();
          emitted += event.delta;
          if (emitted.length > 256 * 1024) throw unavailable();
          yield event.delta;
        } else if (event.type === "response.completed") {
          if (!emitted || !event.response || completedText(event.response) !== emitted) throw unavailable();
          return;
        }
      }
    }
    throw unavailable(); // EOF alone is not a successful completion.
  } catch { throw unavailable(); }
};

/** OpenAI returns audio only; caption timings use the SDK's estimated fallback. */
const generateSpeech: BriefingHandlerOptions["generateSpeech"] = async request => {
  if (!request.text.trim() || request.text.length > 1000 ||
    (request.speaker !== undefined && !["host", "analyst"].includes(request.speaker))) throw unavailable();
  const response = await callOpenAI("audio/speech", {
    model: "gpt-4o-mini-tts", input: request.text.trim(),
    voice: request.speaker === "analyst" ? "cedar" : "marin", response_format: "mp3",
  }, request.signal);
  return { audio: await readBytes(response, request.signal, "audio/mpeg", 1024 * 1024), mediaType: "audio/mpeg" };
};

export const handleBriefingRequest = createBriefingHandler({
  authorize,
  // Browsers on these origins may call the endpoint. Omit the option only when
  // the handler is served from the page's own origin without a rewriting proxy.
  allowedOrigins: ["https://app.example.com"],
  prepareText,
  generateText,
  streamText,
  generateSpeech,
  // Optional: searchMedia (stock footage), generateVideo (for example fal).
  // Add the host's video adapter to enable AI clips; this example uses templates.
  hybrid: true,
  mediaLed: true,
  maxGeneratedVideos: 0,
});
