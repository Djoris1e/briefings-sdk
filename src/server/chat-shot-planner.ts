import { isEditorialMediaTemplate } from "../visual-system/catalog/editorial-media.js";
import { parseEditorialVisual, recoverEditorialVisual, type EditorialVisual } from "../visual-system/catalog/editorial-visual.js";
import type { ScreenshotAsset } from "../briefing/types.js";
import { compileVisualDirection, type AnswerIntent } from "./chat-visual-direction.js";
import type { VideoGenerationContext, VideoPlanPart, VideoPlanner, VideoScene } from "../protocol/types.js";
import { createTextDeltaVideoPlanner, type TextDeltaVideoPlannerOptions, type TextDeltaVideoSource } from "./model/text-stream.js";
import { attachGenerationLifecycleSink, getGenerationLifecycleSink } from "./lifecycle.js";
import { continueAfterOpening } from "./opening-continuity.js";
import { MEDIA_RECOVERY_NOTICE } from "../video-chat/recovery.js";
import type { MediaResolver, ResolvedMedia } from "./media-resolver.js";
import { clipNarrationBudget, estimateNarrationSeconds, narrationFitsClip, CLIP_NARRATION_TAIL_SEC } from "../protocol/clip-budget.js";
import { chooseAnswerMusic, createMusicAudio, type MusicMood, type MusicPreference } from "../music-catalog.js";

interface ChatPlannerTextContext extends VideoGenerationContext {
  userPrompt: string;
}

export type ChatPlannerText = (context: ChatPlannerTextContext) => ReturnType<TextDeltaVideoPlannerOptions["streamText"]>;

export interface ShotPreparation {
  sceneId: string;
  narration: string;
  media?: ResolvedMedia;
  clipDurationSec?: number;
}

type VisualRecovery = "visual-text-overflow" | "invalid-visual" | "invalid-subject" | "invalid-footage-source";

interface ShotResolutionOptions {
  onVisualRecovery?: (reason: VisualRecovery) => void;
  mode?: "cinematic" | "pexels";
  hybrid?: boolean;
  mediaLed?: boolean;
  resolveMedia?: MediaResolver;
  mediaConcurrency: number;
  prepareScene?: (scene: ShotPreparation) => void;
  rewriteNarration?: (text: string, durationSec: number, signal: AbortSignal) => Promise<string>;
  onNarrationFit?: (sceneId: string, estimatedSpeechSec: number, clipDurationSec: number, reason: "fit" | "rewritten" | "oversized") => void;
  onNarrationRewrite?: (event: {
    sceneId: string; clipDurationSec: number; durationMs: number;
    reason: "rewritten" | "empty" | "oversized" | "timeout" | "provider-error" | "cancelled";
  }) => void;
}

interface StockSelection { subject: string; activity?: string; equipment?: string; exclude?: string[] }

type ShotVisual = EditorialVisual | { templateId: "cinemaMedia"; variables: Record<string, never> };

interface Shot {
  narration: string;
  title: string;
  subject: string;
  action: string;
  durationSec: number;
  continuity: "cut" | "continue";
  stockSelection?: StockSelection;
  footageSource?: "stock" | "generated";
  visual?: ShotVisual;
  allowAutomaticMedia?: boolean;
  sourceAsset?: ScreenshotAsset;
}
interface Brief {
  musicMood: MusicMood;
  intent: AnswerIntent;
  opening: string;
  subject: string;
  visualDirection: string;
  development: string;
  ending?: Shot;
}
const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
function readMusicMood(value: unknown): MusicMood {
  return value === "focused" || value === "upbeat" || value === "off" ? value : "calm";
}
/** Closed structural evidence only: never retain model keys, values or text. */
function planShapeError(value: unknown): Error {
  const part = object(value);
  const has = (key: string) => Boolean(part && Object.hasOwn(part, key));
  const shape = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const discriminator = !has("type") ? "missing"
    : part!.type === "answer" || part!.type === "shot" || part!.type === "ending" ? part!.type
    : typeof part!.type === "string" ? "other-string" : "non-string";
  return new Error("Chat plan requires an answer brief followed by shots", { cause: {
    code: "chat_plan_shape", shape, discriminator,
    fields: { opening: has("opening"), subject: has("subject"), development: has("development"),
      visualDirection: has("visualDirection"), ending: has("ending") },
  } });
}
function text(value: unknown, maximum: number): string {
  // Never truncate spoken content or turn a partial scientific claim into a fact.
  return typeof value === "string" && value.trim().length <= maximum ? value.trim() : "";
}
function readStockSelection(value: unknown): StockSelection | undefined {
  const item = object(value);
  const phrase = (candidate: unknown): string | undefined => {
    if (typeof candidate !== "string") return;
    const normalized = candidate.trim().replace(/\s+/gu, " ");
    if (!normalized || normalized.length > 48 || !/^[\p{L}\p{N} '’-]+$/u.test(normalized)) return;
    const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
    return words.length >= 1 && words.length <= 4 ? normalized : undefined;
  };
  const subject = phrase(item?.subject);
  if (!subject) return;
  const activity = phrase(item?.activity), equipment = phrase(item?.equipment);
  const exclude = Array.isArray(item?.exclude) && item.exclude.length <= 3
    ? item.exclude.map(phrase).filter((value): value is string => value !== undefined) : [];
  return {subject, ...(activity ? {activity} : {}), ...(equipment ? {equipment} : {}), ...(exclude.length ? {exclude} : {})};
}
/** Respect the stock adapter's public query contract before dispatch. A long
 * editorial subject is not a search phrase; use its authored literal selector
 * instead, never truncate it into a different subject or invent replacement media. */
function stockQuery(shot: Shot): string {
  const ignored = new Set(["a", "an", "the", "in", "on", "at", "of", "with", "and", "to"]);
  const query = (value: string | undefined): string => {
    const normalized = value?.trim().replace(/\s+/gu, " ") ?? "";
    if (!normalized || normalized.toLowerCase().length > 80 || normalized.split(" ").length > 8) return "";
    return (normalized.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).some(word => !ignored.has(word)) ? normalized : "";
  };
  const selection = shot.stockSelection;
  return query(shot.subject) || (selection
    ? query([selection.subject, selection.activity].filter(Boolean).join(" ")) || query(selection.subject)
    : "");
}
/** IDs are host-authored semantic handles. Require the feature phrase, not
 * a generic vendor word, before putting an original product image behind a beat. */
function screenshotMatches(asset: ScreenshotAsset, shot: Shot): boolean {
  const words = asset.id.toLowerCase().split(/[-_]+/u).filter(word => word.length >= 3 && !/\d/u.test(word)
    && !["screenshot", "image", "asset", "source", "host", "example"].includes(word));
  if (!words.length) return false;
  const authored = ` ${shot.title} ${shot.narration} `.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  const phrase = words.join(" ");
  if (authored.includes(` ${phrase} `)) return true;
  // Allow a feature named before its host, without treating a loose verb such
  // as “create” elsewhere in a Copilot sentence as the Copilot Create product.
  return words.length === 2 && ["in", "for", "within", "on"].some(preposition =>
    authored.includes(` ${words[1]} ${preposition} ${words[0]} `));
}

function chapterSubject(subject: string): string {
  const normalized = subject.replace(/\s+/gu, " ");
  if (normalized.length <= 65) return normalized;
  const prefix = normalized.slice(0, 65);
  const boundary = prefix.lastIndexOf(" ");
  return boundary > 0 ? prefix.slice(0, boundary) : "";
}
function readShot(value: unknown, clipDurationSec: number, answerSubject = "", hybrid = false, onRecovery?: (reason: VisualRecovery) => void, mediaLed = false): Shot {
  const item = object(value);
  const narration = text(item?.narration, 2_000);
  if (!narration) throw new Error("Chat shot requires bounded authored narration");
  const subject = text(item?.subject, 80);
  if (hybrid && !subject) onRecovery?.("invalid-subject");
  const title = text(item?.title, 65) || chapterSubject(subject) || chapterSubject(answerSubject);
  if (!title) throw new Error("Chat shot requires an authored chapter title or subject");
  let visual: ShotVisual | undefined;
  let allowAutomaticMedia = true;
  if (item?.visual !== undefined) {
    try {
      const candidate = object(item.visual);
      const variables = object(candidate?.variables);
      if (hybrid && mediaLed && candidate?.templateId === "cinemaMedia" && variables
        && Object.keys(candidate).length === 2 && Object.keys(variables).length === 0) {
        visual = { templateId: "cinemaMedia", variables: {} };
      } else visual = parseEditorialVisual(item.visual);
    }
    catch (cause) {
      if (!hybrid) throw cause;
      // Text that outgrows a layout remains complete in narration. A fresh,
      // bounded title may still receive the host's illustrative media policy.
      // Unknown fields, URLs and invalid structures remain ineligible.
      const recovered = recoverEditorialVisual(item.visual, title);
      allowAutomaticMedia = Boolean(recovered);
      visual = recovered?.visual ?? { templateId: "chapterTitle", variables: { title } };
      onRecovery?.(recovered ? "visual-text-overflow" : "invalid-visual");
    }
  }
  const footageSource = item?.footageSource;
  if (hybrid && footageSource !== undefined && footageSource !== "stock" && footageSource !== "generated") {
    allowAutomaticMedia = false;
    onRecovery?.("invalid-footage-source");
    visual = { templateId: "chapterTitle", variables: { title } };
  }
  return {
    narration,
    title,
    allowAutomaticMedia,
    ...(hybrid && (footageSource === "stock" || footageSource === "generated") ? { footageSource } : {}),
    stockSelection: readStockSelection(item?.stockSelection),
    ...(visual ? { visual } : {}),
    subject,
    action: text(item?.action, 600),
    // The adapter owns supported duration. A model cannot silently request a different paid clip.
    durationSec: clipDurationSec,
    continuity: item?.continuity === "continue" ? "continue" : "cut",
  };
}
/** Recover only a complete first brief; never infer missing authored content. */
function recoverFirstBrief(part: Record<string, unknown> | undefined, clipDurationSec: number, hybrid = false, mediaLed = false): Brief | undefined {
  if (!part || typeof part.type !== "string" || !part.type.trim() || part.type === "answer" || part.type === "shot" || part.type === "ending") return;
  const bounded = (value: unknown, maximum: number, allowEmpty = false): value is string =>
    typeof value === "string" && value.trim().length <= maximum && (allowEmpty || Boolean(value.trim()));
  if (!["opening", "subject", "development", "visualDirection"].every(key => Object.hasOwn(part, key))
    || !bounded(part.opening, 300) || !bounded(part.subject, 80)
    || !bounded(part.development, 2_000, true) || !bounded(part.visualDirection, 600)) return;
  const ending = object(part.ending);
  if (Object.hasOwn(part, "ending") && (!ending || !bounded(ending.narration, 2_000)
    || !bounded(ending.subject, 80, true) || !bounded(ending.action, 600, true)
    || (Object.hasOwn(ending, "title") && !bounded(ending.title, 65))
    || typeof ending.durationSec !== "number" || !Number.isFinite(ending.durationSec)
    || (ending.continuity !== "cut" && ending.continuity !== "continue"))) return;
  const subject = text(part.subject, 80);
  // Preserve the regular shot contract: authored subject/title fallback and
  // bounded duration normalization. Invalid content above is never defaulted.
  return { intent: compileVisualDirection(part).intent, musicMood: readMusicMood(part.musicMood), opening: text(part.opening, 300), subject, development: text(part.development, 2_000),
    visualDirection: text(part.visualDirection, 600), ...(ending ? { ending: readShot(ending, clipDurationSec, subject, hybrid, undefined, mediaLed) } : {}) };
}
function replaceStream(source: ReturnType<TextDeltaVideoPlannerOptions["streamText"]>, textStream: AsyncIterable<string>): ReturnType<TextDeltaVideoPlannerOptions["streamText"]> {
  if (!(typeof source === "object" && source != null && "textStream" in source)) return textStream;
  return new Proxy({ textStream } as TextDeltaVideoSource, {
    get(target, key, receiver) { return key === "textStream" ? Reflect.get(target, key, receiver) : Reflect.get(source, key, source); },
  });
}

/** Chat-only creative grammar. Generic structured composition keeps its own protocol. */
export function createChatShotPlanner(options: Omit<TextDeltaVideoPlannerOptions, "streamText"> & ShotResolutionOptions & {
  streamText: ChatPlannerText;
  openingLine?: string;
  publishOpening: (opening: { line: string; keyword: string } | undefined) => void;
  generatedClipDurationSec?: number;
  firstGeneratedClipDurationSec?: number;
  generatedVideoAvailable?: boolean;
  stockMediaAvailable?: boolean;
  maxGeneratedVideos?: number;
  screenshots?: readonly ScreenshotAsset[];
  musicMood?: MusicPreference;
  previousTrackId?: string;
  initialTrackId?: string;
}): VideoPlanner {
  const clipDurationSec = options.mode === "pexels" ? undefined : options.generatedClipDurationSec ?? 5;
  // Planning slots bound record count, not the physical length of stock footage.
  // Playback establishes stock timing from speech and available media instead.
  const planningSlotSec = clipDurationSec ?? 5;
  const firstSlotSec = options.mode === "pexels" ? 5 : options.firstGeneratedClipDurationSec ?? planningSlotSec;
  const incomplete = new WeakSet<VideoGenerationContext>();
  const planner = createTextDeltaVideoPlanner({
    includeRawProviderData: options.includeRawProviderData,
    streamText(context) {
      const providerContext = { ...context,
        userPrompt: [
        `Create a complete answer with enough development to satisfy the request, using distinct spoken beats within ${context.request.input.maxDurationSec ?? 40} seconds. Match depth to the question and any requested brevity; preserve essential explanation and steps.`,
        options.hybrid ? "Use complete concise narration with necessary qualifiers. Never shorten an evidence-backed claim to fit a clip: template text remains while the narration finishes." : "Write ONE short sentence per narration, within the supplied speech budget where given. Count spoken words or unspaced-script characters as applicable; shorten any overlong draft before emitting. Completeness belongs to the whole sequence: develop distinct points across scenes instead of cramming a complete explanation into each line.",
        ...(options.hybrid ? ["Make a useful briefing with 6–8 purposeful beats, aiming around one minute with a 120-second ceiling. Budget the WHOLE spoken answer, including its ending: aim for 120–160 words total (or 200–260 unspaced-script characters), not that many per beat. Do not repeat the complete source in each beat; assign each supported fact to one beat and preserve its qualifications. The first beats communicate useful content immediately; the opening chapter is already visible during preparation."] : []),
        ...(options.screenshots?.length ? [`HOST SCREENSHOTS (reference IDs only; never author image URLs): ${JSON.stringify(options.screenshots.map(({ id, alt }) => ({ id, alt })))}`] : []),
        ...(!options.hybrid && options.generatedVideoAvailable ? [
          `NARRATION LIMITS: first scene, including an ending-only answer: ${clipNarrationBudget(firstSlotSec).targetWords} spoken words or ${clipNarrationBudget(firstSlotSec).targetUnspacedCharacters} unspaced-script characters maximum; later scenes, including the saved ending: ${clipNarrationBudget(planningSlotSec).targetWords} spoken words or ${clipNarrationBudget(planningSlotSec).targetUnspacedCharacters} unspaced-script characters maximum. Use fewer for long technical words, numbers or pauses. Count numbers and units in their spoken form. Rewrite before emitting if over the limit.`,
        ] : []),
        "Preserve supplied objects, action/result pairings, quantities with units, limiting conditions and required step order. Fit by simplifying wording and distributing facts across available scenes, never by changing those facts or inventing causes for an observation.",
        `Orientation: ${context.request.input.orientation ?? "landscape"}.`,
        ...(context.request.input.style?.generatedLook ? [`CALLER VISUAL DIRECTION (takes precedence over automatic style): ${context.request.input.style.generatedLook}`] : []),
        "USER REQUEST AND CONVERSATION", context.request.input.input,
      ].join("\n") };
      const sink = getGenerationLifecycleSink(context);
      if (sink) attachGenerationLifecycleSink(providerContext, sink);
      let source: ReturnType<TextDeltaVideoPlannerOptions["streamText"]>;
      try { source = options.streamText(providerContext); } catch (cause) { options.publishOpening(undefined); throw cause; }
      const upstream = typeof source === "object" && source != null && "textStream" in source ? source.textStream : source;
      const translated = (async function* () {
        let brief: Brief | undefined, buffer = "", index = 0, bodyDuration = 0, lastNarration = "";
        let firstBody = true, recordsSeen = 0, generatedCount = 0, stockCount = 0;
        const dispatchedNarrations = new Set<string>();
        const usedScreenshotIds = new Set<string>();
        let lastSimpleTemplate: string | undefined, simpleRun = 0;
        const reject = (cause: unknown) => {
          incomplete.add(context);
          const error = cause instanceof Error ? cause : new Error(String(cause));
          if (!getGenerationLifecycleSink(context)?.rejectPart?.(error)) throw error;
        };
        const acceptMusic = (value: Brief) => {
          const track = chooseAnswerMusic({ preference: options.musicMood, briefMood: value.musicMood,
            initialTrackId: options.initialTrackId, previousTrackId: options.previousTrackId });
          getGenerationLifecycleSink(context)?.setPlannedAudio?.(track ? createMusicAudio(track) : undefined);
        };
        const prepareShot = (shot: Shot, closer = false): Shot => {
          if (!options.hybrid) return shot;
          if (options.mediaLed) {
            const visual = shot.visual ?? { templateId: "chapterTitle" as const, variables: { title: shot.title } };
            const eligible = shot.allowAutomaticMedia !== false && (isEditorialMediaTemplate(visual.templateId) || visual.templateId === "cinemaMedia");
            const sourceAsset = eligible && visual.templateId !== "screenshotSpotlight"
              ? options.screenshots?.find(asset => !usedScreenshotIds.has(asset.id) && screenshotMatches(asset, shot)) : undefined;
            const canGenerate = !closer && index >= 3 && options.generatedVideoAvailable
              && generatedCount < Math.min(3, options.maxGeneratedVideos ?? 3);
            const source = eligible && !sourceAsset && visual.templateId !== "screenshotSpotlight" && shot.subject
              ? canGenerate && (shot.footageSource === "generated" || (!shot.footageSource && generatedCount < 1)) ? "generated"
                : options.stockMediaAvailable ? "stock" : canGenerate ? "generated" : undefined
              : undefined;
            const stockSelection = shot.stockSelection ?? (source === "stock"
              && /\b(team|colleagues|people)\b/iu.test(shot.action) && /\bdocuments?\b/iu.test(shot.action)
              ? { subject: "team", activity: "reviewing documents" } : undefined);
            const simple = visual.templateId === "chapterTitle" || visual.templateId === "textMedia";
            // Hide only redundant generic display copy. Exact values, quotations,
            // and facts that are absent from narration must remain visible.
            const normalized = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
            const redundant = simple && Object.values(visual.variables).every(value => typeof value === "string"
              && !/[\d%$€£“”"«»]/u.test(value) && normalized(shot.narration).includes(normalized(value)));
            const vary = redundant && !closer && !sourceAsset && Boolean(source)
              && lastSimpleTemplate === visual.templateId && simpleRun >= 2;
            const selected: ShotVisual = visual.templateId === "cinemaMedia" && sourceAsset
              ? { templateId: "screenshotSpotlight", variables: { screenshotId: sourceAsset.id, title: shot.title, caption: "Original source image" } }
              : vary ? { templateId: "cinemaMedia", variables: {} }
              : visual.templateId === "cinemaMedia" && !source && !sourceAsset
                ? { templateId: "chapterTitle", variables: { title: shot.title } } : visual;
            return { ...shot, visual: selected, footageSource: source, stockSelection, sourceAsset: selected.templateId === "screenshotSpotlight" ? undefined : sourceAsset,
              durationSec: Math.max(4, estimateNarrationSeconds(shot.narration) + CLIP_NARRATION_TAIL_SEC) };
          }
          // Enforce a small illustrative mix even when the model repeats the
          // default title layout. Keep exact charts, quotes, actions and genuine
          // screenshots intact; never repair rejected layouts into paid jobs.
          const eligible = index >= 2 && !closer && shot.allowAutomaticMedia !== false && Boolean(shot.subject)
            && (shot.visual?.templateId === "chapterTitle" || shot.visual?.templateId === "textMedia");
          const sourceScreenshot = eligible && !shot.footageSource && shot.visual?.templateId === "chapterTitle"
            ? options.screenshots?.find(asset => !usedScreenshotIds.has(asset.id) && screenshotMatches(asset, shot)) : undefined;
          if (sourceScreenshot) {
            shot = { ...shot, visual: { templateId: "screenshotSpotlight", variables: {
              screenshotId: sourceScreenshot.id, title: String(shot.visual!.variables.title),
              caption: "Original source screenshot · product illustration", } } };
          } else if (eligible) {
            const canGenerate = options.generatedVideoAvailable && generatedCount < Math.min(3, options.maxGeneratedVideos ?? 3);
            const automatic = options.stockMediaAvailable && stockCount < (options.generatedVideoAvailable ? 1 : 2) ? "stock"
              : canGenerate && generatedCount < (options.stockMediaAvailable ? 1 : 2) ? "generated" : undefined;
            const footageSource = shot.footageSource ?? automatic;
            if (footageSource && (footageSource === "stock" ? options.stockMediaAvailable : canGenerate)) {
              const visual = shot.visual!.templateId === "textMedia" ? shot.visual!
                : { templateId: "textMedia" as const, variables: { title: String(shot.visual!.variables.title),
                  body: shot.narration.length <= 180 ? shot.narration : "Illustrative footage" } };
              // When the model names software but describes human work, the
              // existing stock search can broaden to that same authored actor.
              const stockSelection = shot.stockSelection ?? (footageSource === "stock"
                && /\b(team|colleagues|people)\b/iu.test(shot.action) && /\bdocuments?\b/iu.test(shot.action)
                ? { subject: "team", activity: "reviewing documents" } : undefined);
              shot = { ...shot, footageSource, visual, stockSelection };
            }
          }
          const stock = options.mode === "pexels" || shot.footageSource === "stock";
          const unavailable = stock ? !options.stockMediaAvailable
            : !options.generatedVideoAvailable || generatedCount >= Math.min(3, options.maxGeneratedVideos ?? 3);
          const needsTemplate = index < 2 || unavailable;
          const visual = shot.visual ?? (needsTemplate ? { templateId: "chapterTitle" as const, variables: { title: shot.title } } : undefined);
          return { ...shot, visual, durationSec: visual || stock ? Math.max(4, estimateNarrationSeconds(shot.narration) + CLIP_NARRATION_TAIL_SEC)
            : generatedCount === 0 ? firstSlotSec : shot.durationSec };
        };
        const scenePart = (source: Shot, closer = false): VideoPlanPart => {
          const shot = prepareShot(source, closer);
          if (options.hybrid && index >= 10) throw new Error("Hybrid answer exceeds ten scenes");
          let narration = shot.narration;
          if (firstBody && !closer && (!options.hybrid || options.openingLine)) narration = continueAfterOpening(narration, [options.openingLine ?? brief?.opening ?? ""]);
          if (!closer) { dispatchedNarrations.add(shot.narration); dispatchedNarrations.add(narration); }
          firstBody = false;
          lastNarration = narration;
          const durationSec = options.hybrid ? shot.durationSec : index === 0 ? firstSlotSec : shot.durationSec;
          const sceneId = `${context.request.requestId}-shot-${++index}`;
          if (options.mediaLed) {
            const simple = shot.visual?.templateId === "chapterTitle" || shot.visual?.templateId === "textMedia" ? shot.visual.templateId : undefined;
            simpleRun = simple ? simple === lastSimpleTemplate ? simpleRun + 1 : 1 : 0;
            lastSimpleTemplate = simple;
          }
          if (options.hybrid && shot.visual && shot.visual.templateId !== "cinemaMedia") {
            let templateId = shot.visual.templateId;
            let variables = { ...shot.visual.variables };
            const stock = options.mode === "pexels" || shot.footageSource === "stock";
            let resolveVisualMedia = (options.mediaLed ? isEditorialMediaTemplate(templateId) && shot.allowAutomaticMedia !== false : index > 2 && templateId === "textMedia") && Boolean(stock ? stockQuery(shot) : shot.subject) && Boolean(shot.footageSource)
              && (stock ? options.stockMediaAvailable : options.generatedVideoAvailable && generatedCount < Math.min(3, options.maxGeneratedVideos ?? 3));
            if (templateId === "screenshotSpotlight") {
              const asset = options.screenshots?.find(asset => asset.id === variables.screenshotId);
              if (!asset) { templateId = "chapterTitle"; variables = { title: shot.title }; }
              else {
                usedScreenshotIds.add(asset.id);
                variables = { ...variables, sourceImageUrl: asset.url, screenshotAlt: asset.alt, ...(asset.sourceUrl ? { screenshotSourceUrl: asset.sourceUrl } : {}) };
                resolveVisualMedia = index > 2 && asset.animate === true && options.generatedVideoAvailable === true && generatedCount < Math.min(3, options.maxGeneratedVideos ?? 3);
                if (resolveVisualMedia) variables.animateScreenshot = true;
              }
            }
            if (shot.sourceAsset) {
              usedScreenshotIds.add(shot.sourceAsset.id);
              variables = { ...variables, mediaUrl: shot.sourceAsset.url, mediaType: "photo",
                mediaAlt: shot.sourceAsset.alt, mediaKind: "source" };
              resolveVisualMedia = false;
            }
            if (resolveVisualMedia) {
              const generated = templateId === "screenshotSpotlight" || !stock;
              const requestedClipDurationSec = generatedCount === 0 ? firstSlotSec : planningSlotSec;
              if (generated) generatedCount++;
              else stockCount++;
              variables = { ...variables, footageSource: generated ? "generated" : "stock", requestedClipDurationSec,
                mediaKeyword: generated ? shot.subject || shot.title : stockQuery(shot), shotDirection: [brief?.visualDirection, shot.action].filter(Boolean).join("\n"),
                ...(!generated && shot.stockSelection ? { stockSelection: shot.stockSelection } : {}) };
            }
            return { type: "scene.add", ...(closer ? { placement: "closer" as const } : {}), scene: {
              id: sceneId, templateId, variables, narration, timing: { fixedDuration: durationSec },
            } };
          }
          const stock = options.mode === "pexels" || (options.hybrid && shot.footageSource === "stock");
          const requestedClipDurationSec = generatedCount === 0 ? firstSlotSec : planningSlotSec;
          if (!stock) generatedCount += 1;
          else stockCount++;
          return { type: "scene.add", ...(closer ? { placement: "closer" as const } : {}), scene: {
            id: sceneId, templateId: "cinemaMedia",
            variables: { ...(stock && shot.stockSelection ? {stockSelection: shot.stockSelection} : {}), ...(options.hybrid ? {footageSource: stock ? "stock" : "generated", requestedClipDurationSec} : {}), fallbackText: shot.title, mediaType: "video", mediaKeyword: stock ? stockQuery(shot) : shot.subject, shotDirection: [
              brief?.visualDirection,
              shot.action,
              shot.continuity === "continue" ? "Continue the established subject, setting and action consistently." : "A deliberate new shot; choose framing that reveals this beat.",
              "No voices, speech, dialogue, voiceover, singing, chanting, music, written words or subtitles in the generated footage.",
            ].filter(Boolean).join("\n"), },
            narration, timing: options.hybrid || options.mode !== "pexels" ? { fixedDuration: durationSec } : {},
          } };
        };
        const record = (value: unknown, firstRecord: boolean): VideoPlanPart | undefined => {
          const part = object(value);
          const recovered = firstRecord && !brief && index === 0 ? recoverFirstBrief(part, planningSlotSec, options.hybrid, options.mediaLed) : undefined;
          if (recovered) {
            brief = recovered;
            acceptMusic(brief);
            options.publishOpening(options.hybrid && !options.openingLine ? undefined : { line: brief.opening, keyword: brief.subject });
            return;
          }
          if (part?.type === "answer") {
            if (brief) throw new Error("Chat answer brief was emitted more than once");
            brief = { intent: compileVisualDirection(part).intent, musicMood: readMusicMood(part.musicMood), opening: text(part.opening, 300), subject: text(part.subject, 80), visualDirection: text(part.visualDirection, 600), development: text(part.development, 2_000) };
            acceptMusic(brief);
            if (Object.hasOwn(part, "ending")) { try { brief.ending = readShot(part.ending, planningSlotSec, brief.subject, options.hybrid, options.onVisualRecovery, options.mediaLed); } catch (cause) { reject(cause); } }
            options.publishOpening(brief.opening && (!options.hybrid || options.openingLine) ? { line: brief.opening, keyword: brief.subject } : undefined);
            return;
          }
          if (part?.type === "ending") {
            if (!brief) throw new Error("Chat ending arrived before its answer brief");
            if (brief.ending) throw new Error("Chat ending was emitted more than once");
            const ending = readShot(part, planningSlotSec, brief.subject, options.hybrid, options.onVisualRecovery, options.mediaLed);
            if (dispatchedNarrations.has(ending.narration)) throw new Error("Chat ending repeats an already dispatched shot");
            // The first developing shot can already be generating. Keep the
            // authored payoff for EOF/error recovery without dispatching it now.
            brief.ending = ending;
            return;
          }
          if (part?.type !== "shot") throw planShapeError(value);
          if (!brief) throw new Error("Chat shot arrived before its answer brief");
          const shot = prepareShot(readShot(part, index === 0 ? firstSlotSec : planningSlotSec, brief.subject, options.hybrid, options.onVisualRecovery, options.mediaLed));
          if (shot.narration === brief.ending?.narration) return;
          if (firstBody && (!options.hybrid || options.openingLine) && !continueAfterOpening(shot.narration, [options.openingLine ?? brief.opening])) return;
          if (options.hybrid && index >= 9) throw new Error("Hybrid answer reserves its tenth scene for the ending");
          const endingDuration = brief.ending ? prepareShot(brief.ending, true).durationSec : planningSlotSec;
          const budget = (context.request.input.maxDurationSec ?? 40) - endingDuration;
          if (bodyDuration + shot.durationSec > budget) throw new Error("Chat shot exceeds the answer duration budget");
          bodyDuration += shot.durationSec;
          return scenePart(shot);
        };
        const line = function* (raw: string): Generator<VideoPlanPart> {
          const trimmed = raw.trim();
          if (!trimmed || /^```(?:json|ndjson)?$/i.test(trimmed)) return;
          const firstRecord = recordsSeen++ === 0;
          const value: unknown = JSON.parse(trimmed);
          // Models occasionally wrap the requested records in one JSON array.
          // Accept only a complete initial answer/shot/ending sequence; never dig into
          // arbitrary containers or bypass the normal content and budget checks.
          if (Array.isArray(value) && (!firstRecord || object(value[0])?.type !== "answer"
            || !value.slice(1).every(item => object(item)?.type === "shot" || object(item)?.type === "ending"))) throw planShapeError(value);
          const records: unknown[] = Array.isArray(value) ? value : [value];
          for (const [position, item] of records.entries()) {
            try {
              const part = record(item, firstRecord && position === 0);
              if (part) yield part;
            } catch (cause) { reject(cause); }
          }
        };
        let cursor = 0, depth = 0, quoted = false, escaped = false;
        const takeFrame = (): string | undefined => {
          if (cursor === 0) {
            buffer = buffer.trimStart();
            if (!buffer) return;
            if (buffer[0] !== "{" && buffer[0] !== "[") {
              const newline = buffer.indexOf("\n");
              if (newline < 0) return;
              const raw = buffer.slice(0, newline);
              buffer = buffer.slice(newline + 1);
              return raw;
            }
          }
          // Frame complete JSON containers, not physical lines. Arrays remain
          // whole until their syntax and record sequence can be validated.
          // Each character is scanned once across deltas.
          for (; cursor < buffer.length; cursor++) {
            const character = buffer[cursor];
            if (quoted) {
              // After a valid brief, a physical newline inside a top-level
              // string is never valid JSON.
              // Reject this record without consuming the following independent one.
              // Nested/array values stay whole; never extract their inner records.
              if ((character === "\n" || character === "\r") && brief && depth === 1 && buffer[0] === "{") {
                const raw = buffer.slice(0, cursor + 1);
                buffer = buffer.slice(cursor + 1);
                cursor = depth = 0; quoted = escaped = false;
                return raw;
              }
              if (escaped) escaped = false;
              else if (character === "\\") escaped = true;
              else if (character === '"') quoted = false;
            } else if (character === '"') quoted = true;
            else if (character === "{" || character === "[") depth++;
            else if (character === "}" || character === "]") {
              depth--;
              if (depth === 0) {
                const raw = buffer.slice(0, cursor + 1);
                buffer = buffer.slice(cursor + 1);
                cursor = 0;
                return raw;
              }
            }
          }
        };
        try {
          for await (const delta of upstream) {
            context.signal.throwIfAborted();
            if (typeof delta !== "string") throw new Error("The LLM adapter returned a non-text delta");
            // Provider chunk boundaries are arbitrary. Bound the unfinished
            // record, not a chunk that can contain many complete records.
            for (let offset = 0; offset < delta.length;) {
              const capacity = 32_768 - buffer.length;
              if (capacity <= 0) throw new Error("Chat plan line exceeds the bounded stream limit");
              const piece = delta.slice(offset, offset + capacity);
              buffer += piece;
              offset += piece.length;
              let raw = takeFrame();
              while (raw !== undefined) {
                try { for (const part of line(raw)) yield JSON.stringify(part) + "\n"; } catch (cause) { reject(cause); }
                raw = takeFrame();
              }
            }
          }
          if (buffer.trim()) { try { for (const part of line(buffer)) yield JSON.stringify(part) + "\n"; } catch (cause) { reject(cause); } }
          if (brief?.development && bodyDuration === 0) incomplete.add(context);
          if (brief?.ending && brief.ending.narration !== lastNarration) yield JSON.stringify(scenePart(brief.ending, true)) + "\n";
          else if (!brief?.ending) incomplete.add(context);
        } catch (cause) {
          if (!context.signal.aborted && brief?.ending && brief.ending.narration !== lastNarration) {
            yield JSON.stringify(scenePart(brief.ending, true)) + "\n";
          }
          throw cause;
        } finally { options.publishOpening(undefined); }
      })();
      return replaceStream(source, translated);
    },
  });
  return async function* (context) {
    let completed = false;
    for await (const part of resolveShots(planner(context), context, options)) {
      if (part.type === "plan.complete") completed = true;
      yield part;
    }
    if (!completed) {
      if (incomplete.has(context)) getGenerationLifecycleSink(context)?.reportWarning?.({ code: "plan_incomplete", category: "provider", message: "Some authored answer content could not be completed.", recoverable: true });
      yield { type: "plan.complete", ...(incomplete.has(context) ? { finishReason: "other" as const } : {}) };
    }
  };
}

/** Resolve ahead with bounded work, but emit in narrative order. */
async function* resolveShots(parts: AsyncIterable<VideoPlanPart>, context: VideoGenerationContext, options: ShotResolutionOptions): AsyncGenerator<VideoPlanPart> {
  const generatedLook = options.mode === "pexels" ? context.request.input.style?.generatedLook
    : compileVisualDirection({}, context.request.input.style?.generatedLook).generatedLook;
  type Result = { part: VideoPlanPart } | { error: unknown };
  const queue: Promise<Result>[] = [];
  const iterator = parts[Symbol.asyncIterator]();
  const limit = Number.isFinite(options.mediaConcurrency) ? Math.min(5, Math.max(1, Math.floor(options.mediaConcurrency))) : 1;
  let done = false, closed = false, producerError: unknown;
  let playbackOffsetSec = 0;
  let notify: (() => void) | undefined, space: (() => void) | undefined;
  const resolve = async (part: VideoPlanPart): Promise<VideoPlanPart> => {
    if (part.type !== "scene.add") return part;
    const sceneOffsetSec = playbackOffsetSec;
    playbackOffsetSec += part.scene.timing.fixedDuration ?? 5;
    const mixed = isEditorialMediaTemplate(part.scene.templateId);
    if (options.hybrid && part.scene.templateId !== "cinemaMedia" && !part.scene.variables.mediaKeyword) {
      context.signal.throwIfAborted();
      options.prepareScene?.({ sceneId: part.scene.id, narration: part.scene.narration ?? "" });
      return part;
    }
    const stock = options.mode === "pexels" || (options.hybrid && part.scene.variables.footageSource === "stock");
    const original = part.scene.narration ?? "";
    let durationSec = (mixed || options.hybrid) && typeof part.scene.variables.requestedClipDurationSec === "number" ? part.scene.variables.requestedClipDurationSec : part.scene.timing.fixedDuration ?? 5;
    let narration = original;
    const { mediaKeyword } = part.scene.variables;
    const mediaScene = part.scene;
    const resolveMedia = async () => typeof mediaKeyword === "string" && mediaKeyword && options.resolveMedia
      ? options.resolveMedia(mediaKeyword, {
        input: context.request.input, requestId: context.request.requestId, ...(options.hybrid ? { playbackOffsetSec: sceneOffsetSec } : {}), scene: mediaScene, templateId: mediaScene.templateId, preferredType: "video", generatedLook: stock && options.hybrid ? undefined : generatedLook, signal: context.signal,
      }) : undefined;
    // Search is not a paid generation submission. Resolve stock first so fit
    // and any single rewrite use the selected clip, not a generated-video cap.
    let media = stock ? await resolveMedia() : undefined;
    context.signal.throwIfAborted();
    // Generated footage depends on authored shot direction, not its speech
    // repair. Start the same bounded job now and handle rejection immediately,
    // even if narration preparation fails or the response is cancelled first.
    const pendingMedia = !stock
      ? resolveMedia().then(media => ({ media }), error => ({ error })) : undefined;
    if (stock) durationSec = media?.durationSec ?? Math.max(durationSec, estimateNarrationSeconds(narration) + CLIP_NARRATION_TAIL_SEC);
    if (!options.hybrid && !narrationFitsClip(narration, durationSec) && options.resolveMedia && options.rewriteNarration) {
      const rewriteStartedAt = Date.now();
      let reason: Parameters<NonNullable<ShotResolutionOptions["onNarrationRewrite"]>>[0]["reason"];
      try {
        const rewritten = (await options.rewriteNarration(original, durationSec, context.signal)).trim();
        reason = !/[\p{L}\p{N}]/u.test(rewritten) ? "empty" : rewritten.length > 2000 || !narrationFitsClip(rewritten, durationSec) ? "oversized" : "rewritten";
        if (reason === "rewritten") narration = rewritten;
      } catch (cause) {
        reason = context.signal.aborted ? "cancelled" : cause instanceof DOMException && cause.name === "TimeoutError" ? "timeout" : "provider-error";
      }
      options.onNarrationRewrite?.({ sceneId: part.scene.id, clipDurationSec: durationSec, durationMs: Math.max(0, Date.now() - rewriteStartedAt), reason });
    }
    context.signal.throwIfAborted();
    const fits = narrationFitsClip(narration, durationSec);
    const clipBudget = options.hybrid || mixed || (stock && !media?.durationSec) ? undefined : durationSec;
    if (clipBudget !== undefined) options.onNarrationFit?.(part.scene.id, estimateNarrationSeconds(narration), clipBudget, !fits ? "oversized" : narration === original ? "fit" : "rewritten");
    part = { ...part, scene: { ...part.scene, narration } };
    options.prepareScene?.({ sceneId: part.scene.id, narration, clipDurationSec: clipBudget });
    // A speech estimate can request one shortening pass, never discard usable
    // footage. The player covers the final measured line with the same clip.
    if (pendingMedia) {
      const result = await pendingMedia;
      if ("error" in result) throw result.error;
      media = result.media;
    }
    context.signal.throwIfAborted();
    if (!media) getGenerationLifecycleSink(context)?.reportWarning?.({ code: "provider_warning", category: "provider", message: MEDIA_RECOVERY_NOTICE, recoverable: true });
    if (mixed) {
      const { mediaKeyword: _keyword, shotDirection: _direction, footageSource: _source, stockSelection: _selection,
        requestedClipDurationSec: _duration, animateScreenshot: _animate, ...variables } = part.scene.variables;
      const scene = { ...part.scene, variables: { ...variables, ...(media ? { mediaUrl: media.url, mediaType: media.type === "image" ? "photo" : "video", mediaKind: "illustration", ...(media.posterUrl ? { mediaPoster: media.posterUrl } : {}), ...(media.durationSec ? { mediaDurationSec: media.durationSec } : {}) } : {}) } };
      if (media) options.prepareScene?.({ sceneId: scene.id, narration, media });
      return { ...part, scene };
    }
    const title = part.scene.variables.fallbackText;
    const scene: VideoScene = media
      ? { ...part.scene, variables: { fallbackText: title, mediaType: media.type === "image" ? "photo" : "video", mediaUrl: media.url, ...(media.posterUrl ? { mediaPoster: media.posterUrl } : {}), ...(media.durationSec ? { mediaDurationSec: media.durationSec } : {}), ...(media.type === "video" && media.audio === "ambient" ? { mediaAudio: "ambient" } : {}) } }
      : { ...part.scene, templateId: "chapterTitle", variables: { title } };
    if (media) options.prepareScene?.({ sceneId: scene.id, narration, media, clipDurationSec: clipBudget });
    return { ...part, scene };
  };
  const producer = (async () => {
    try {
      while (!closed) {
        if (queue.length >= limit) await new Promise<void>(r => { space = r; });
        if (closed) break;
        const next = await iterator.next();
        if (next.done) break;
        queue.push(resolve(next.value).then(part => ({ part }), error => ({ error })));
        notify?.(); notify = undefined;
      }
    } catch (error) { producerError = error; }
    finally { done = true; notify?.(); notify = undefined; }
  })();
  try {
    while (!done || queue.length) {
      if (!queue.length) await new Promise<void>(r => { notify = r; });
      const item = queue[0]; if (!item) continue;
      const result = await item; queue.shift(); space?.(); space = undefined;
      if ("error" in result) throw result.error;
      yield result.part;
    }
    if (producerError) throw producerError;
  } finally {
    closed = true; space?.();
    void iterator.return?.().catch(() => undefined);
    void producer;
  }
}
