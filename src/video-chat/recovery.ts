export const MEDIA_RECOVERY_NOTICE = "Some visuals were replaced so your response can continue.";
export const CREDIT_FALLBACK_NOTICE = "AI video credits are used up. Using Pexels footage instead.";

/** Internal diagnostics; the embed offers a recovery control instead of these strings. */
export function isNarrationWarning(message: string): boolean {
  return ["Generated voice is unavailable. Continuing without narration.", "Voice playback is unavailable. Continuing with subtitles.", "Some narration is unavailable; the response will continue."].includes(message);
}
