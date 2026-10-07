import { createVideoChatHandler, type VideoChatHandlerOptions } from "../server/create-video-chat-handler.js";
import { createChatHttpHandler, jsonError } from "../server/video-chat-http.js";
import { MAX_REQUEST_BODY_BYTES } from "../protocol/prompt-limits.js";
import { parseBriefingRequest, prepareBriefing, type BriefingPreparationOptions } from "./prepare.js";

export interface BriefingHandlerOptions extends VideoChatHandlerOptions {
  /** Host-owned provider callback; credentials, provider configuration and quotas stay with the host. */
  prepareText: BriefingPreparationOptions["generateText"];
  briefingTimeoutMs?: number;
}

/**
 * Portable Request → Response endpoint: canonical briefing preparation plus all
 * existing video-chat operations. Authenticate/reserve host quotas in authorize
 * or provider closures; this SDK does not create a separate billing policy.
 */
export function createBriefingHandler(options: BriefingHandlerOptions): (request: Request) => Promise<Response> {
  if (!options || typeof options.prepareText !== "function") {
    throw new Error("createBriefingHandler requires prepareText");
  }
  const { prepareText, briefingTimeoutMs, ...chatOptions } = options;
  const maxBodyBytes = options.maxBodyBytes ?? MAX_REQUEST_BODY_BYTES;
  // Construct first to share all existing authorization/configuration checks.
  const video = createVideoChatHandler({ ...chatOptions, maxBodyBytes });
  const reportError = (cause: unknown) => {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    try { void Promise.resolve(options.onError?.(error)).catch(() => undefined); }
    catch { /* Private diagnostics cannot alter or leak into the HTTP response. */ }
  };
  const briefing = createChatHttpHandler({
    authorize: options.authorize,
    allowedOrigins: options.allowedOrigins,
    allowCredentials: options.allowCredentials,
    maxBodyBytes,
    maxAudioBytes: options.maxAudioBytes ?? 8 * 1024 * 1024,
    transcriptionConfigured: Boolean(options.transcribe),
    extraWriteActions: ["briefing"],
    reportError,
  }, async ({ request, headers, body }) => {
    let input;
    try { input = parseBriefingRequest(body); }
    catch { return jsonError(400, "invalid_request", "Send a prompt of up to 12,000 characters and up to four public HTTPS screenshots", headers); }
    try {
      const prepared = await prepareBriefing(input, { generateText: prepareText, timeoutMs: briefingTimeoutMs, signal: request.signal });
      return Response.json(prepared, { headers });
    } catch (cause) {
      if (request.signal.aborted) return jsonError(499, "aborted", "Request cancelled", headers);
      reportError(cause);
      return jsonError(502, "briefing_unavailable", "The briefing could not be prepared", headers);
    }
  });
  return request => new URL(request.url).searchParams.get("action") === "briefing"
    ? briefing(request) : video(request);
}
