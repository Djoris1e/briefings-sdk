import { useCallback, useEffect, useRef, useState } from "react";
import { estimateNarrationSeconds } from "../protocol/clip-budget";
import { MAX_PROMPT_CHARACTERS } from "../protocol/prompt-limits";
import { createVideoChatVoice, type VideoChatVoice, type VideoChatPreparedSpeech } from "../video-chat/voice";
import { withDeadline } from "../video-chat/deadline";
import { validatePreparedBriefing, validateScreenshotAssets } from "./prepare";
import type { BriefingSpeaker, PreparedBriefing, ScreenshotAsset } from "./types";

type Status = "idle" | "writing" | "preparing" | "ready" | "playing" | "paused" | "ended" | "error";
type State = { text: string; status: Status; error?: string; briefing?: PreparedBriefing; speaker?: BriefingSpeaker; turnIndex: number };
export interface PromptGenerationOptions {
  screenshots?: readonly ScreenshotAsset[];
  /** Runs as soon as the shared facts are ready, before audio preparation. */
  onPrepared?: (briefing: PreparedBriefing) => void;
}
type Run = {
  controller: AbortController;
  voices?: Record<BriefingSpeaker, VideoChatVoice>;
  briefing?: PreparedBriefing;
  prepared: Map<number, Promise<void>>;
  ready: boolean;
  paused: boolean;
  index: number;
  wake?: () => void;
  playback?: Promise<void>;
  playbackController?: AbortController;
  durations: Map<number, VideoChatPreparedSpeech>;
  offset: number;
  sounding?: number;
  rate: number;
};
const voiceError = "Podcast speech is unavailable. Your briefing is still available to read or watch.";
const briefingError = "Could not prepare the briefing. Please try again.";
/** Covers the server's maximum briefing deadline (120 s) plus transport slack. */
const BRIEFING_REQUEST_TIMEOUT_MS = 130_000;
/** The only error text shown to users; every other failure maps to a fixed message. */
class BriefingRequestError extends Error {}
function describeFailure(cause: unknown): string {
  if (cause instanceof BriefingRequestError) return cause.message;
  if (cause instanceof DOMException && cause.name === "TimeoutError") return "Preparing the briefing took too long. Please try again.";
  return briefingError;
}

/** Cancellation settles our work even if a host transport ignores its signal. */
async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason ?? new DOMException("Cancelled", "AbortError"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([work, cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}

/** One factual preparation feeds reading, the two-speaker podcast and video. */
export function usePromptOutput(options: { endpoint?: string } = {}) {
  const endpoint = options.endpoint ?? "/api/video-chat";
  const [state, setState] = useState<State>({ text: "", status: "idle", turnIndex: -1 });
  const [timing, setTiming] = useState({ currentTime: 0, duration: 0, durationEstimated: true, seekableDuration: 0 });
  const [playbackRate, setRate] = useState(1);
  const rateRef = useRef(1);
  const mounted = useRef(true);
  const current = useRef<Run | undefined>(undefined);
  const briefs = useRef(new Map<string, PreparedBriefing>());
  const active = useCallback((run: Run) => mounted.current && current.current === run && !run.controller.signal.aborted, []);
  const cancel = useCallback(() => {
    const run = current.current;
    current.current = undefined;
    if (!run) return;
    run.controller.abort(new DOMException("Cancelled", "AbortError"));
    run.playbackController?.abort();
    run.wake?.();
    for (const voice of Object.values(run.voices ?? {})) { voice.pause(); voice.dispose?.(); }
  }, []);
  const fail = useCallback((run: Run, message: string) => {
    if (!active(run)) return;
    cancel();
    setState(previous => ({ ...previous, status: "error", error: message, speaker: undefined }));
  }, [active, cancel]);
  const updateTiming = useCallback((run: Run) => {
    if (!active(run) || !run.briefing) return;
    const lengths = run.briefing.podcast.turns.map((turn, index) => run.durations.get(index)?.seconds ?? Math.max(1, estimateNarrationSeconds(turn.text)));
    let seekableDuration = 0;
    for (let index = 0; index < lengths.length; index++) {
      if (!run.durations.get(index)?.supportsOffsets) break;
      seekableDuration += lengths[index];
    }
    const prefix = lengths.slice(0, run.index).reduce((sum, seconds) => sum + seconds, 0);
    const speaker = run.briefing.podcast.turns[run.index]?.speaker;
    const clock = run.sounding === run.index && speaker ? run.voices?.[speaker].getCurrentTime?.() : undefined;
    setTiming({ currentTime: prefix + Math.min(lengths[run.index] ?? 0, clock ?? run.offset), duration: lengths.reduce((sum, seconds) => sum + seconds, 0), durationEstimated: run.durations.size !== lengths.length || [...run.durations.values()].some(value => !value.supportsOffsets), seekableDuration });
  }, [active]);
  const prepare = useCallback((run: Run, index: number): Promise<void> => {
    const existing = run.prepared.get(index);
    if (existing) return existing;
    const turn = run.briefing!.podcast.turns[index]!;
    const promise = abortable(run.voices![turn.speaker].prepare(turn.text, { signal: run.controller.signal }), run.controller.signal).then(duration => {
      if (!active(run)) return;
      run.durations.set(index, duration);
      updateTiming(run);
    });
    run.prepared.set(index, promise);
    return promise;
  }, [active, updateTiming]);

  useEffect(() => {
    mounted.current = true;
    setState(previous => ({ ...previous, status: "idle", turnIndex: -1, speaker: undefined }));
    setTiming({ currentTime: 0, duration: 0, durationEstimated: true, seekableDuration: 0 });
    return () => { mounted.current = false; cancel(); };
  }, [cancel, endpoint]);

  const generate = useCallback(async (prompt: string, _format: "text" | "podcast" = "podcast", generation: PromptGenerationOptions = {}): Promise<void> => {
    cancel();
    const input = prompt.trim();
    if (!input || input.length > MAX_PROMPT_CHARACTERS) {
      setState(previous => ({ ...previous, status: "error", error: "Enter a prompt of up to 12,000 characters." }));
      return;
    }
    const run: Run = { controller: new AbortController(), prepared: new Map(), ready: false, paused: false, index: 0, durations: new Map(), offset: 0, rate: rateRef.current };
    current.current = run;
    setTiming({ currentTime: 0, duration: 0, durationEstimated: true, seekableDuration: 0 });
    setState({ text: "", status: "writing", turnIndex: -1 });
    try {
      const screenshots = validateScreenshotAssets(generation.screenshots ?? []);
      const cacheKey = JSON.stringify([endpoint, input, screenshots]);
      let briefing = briefs.current.get(cacheKey);
      if (!briefing) {
        // A stalled connection must end in a visible error with a retry, never
        // an indefinite "Preparing…" state.
        briefing = await withDeadline(async signal => {
          const response = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}action=briefing`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ prompt: input, screenshots }), signal,
          });
          if (response.status === 429) throw new BriefingRequestError("Too many requests right now. Please try again shortly.");
          if (!response.ok) throw new BriefingRequestError(briefingError);
          const result = validatePreparedBriefing(await response.json());
          if (result.prompt !== input) throw new BriefingRequestError("The briefing did not match this request. Please try again.");
          return result;
        }, BRIEFING_REQUEST_TIMEOUT_MS, run.controller.signal);
        if (!active(run)) return;
        briefs.current.set(cacheKey, briefing);
        if (briefs.current.size > 8) briefs.current.delete(briefs.current.keys().next().value!);
      }
      if (!active(run)) return;
      run.briefing = briefing;
      updateTiming(run);
      setState({ text: briefing.summary, briefing, status: "preparing", turnIndex: -1 });
      generation.onPrepared?.(briefing);
      if (!active(run)) return;
      const voice = (speaker: BriefingSpeaker) => createVideoChatVoice({ endpoint, speaker, enableAudioLevel: true, onFallback: () => fail(run, voiceError) });
      run.voices = { host: voice("host"), analyst: voice("analyst") };
      for (const sink of Object.values(run.voices)) sink.setPlaybackRate?.(run.rate);
      // Only the first two turns prepare initially. As playback advances, one
      // following turn joins the cache; a slow later turn cannot fan out work.
      const first = prepare(run, 0);
      if (briefing.podcast.turns.length > 1) void prepare(run, 1).catch(() => fail(run, voiceError));
      await first;
      if (!active(run)) return;
      run.ready = true;
      setState(previous => ({ ...previous, status: "ready" }));
    } catch (cause) {
      fail(run, run.briefing ? voiceError : describeFailure(cause));
    }
  }, [active, cancel, endpoint, fail, prepare, updateTiming]);

  const play = useCallback(async (): Promise<void> => {
    const run = current.current;
    if (!run || !active(run) || !run.voices || !run.briefing || !run.ready) return;
    if (run.playback) {
      if (run.paused) {
        run.paused = false;
        for (const voice of Object.values(run.voices)) voice.resume();
        run.wake?.(); run.wake = undefined;
        setState(previous => ({ ...previous, status: "playing" }));
      }
      return run.playback;
    }
    if (run.index >= run.briefing.podcast.turns.length) { run.index = 0; run.offset = 0; }
    run.paused = false;
    const controller = new AbortController();
    run.playbackController = controller;
    const valid = () => active(run) && run.playbackController === controller && !controller.signal.aborted;
    // Both sinks unlock inside the user's gesture; only one turn speaks at a time.
    for (const voice of Object.values(run.voices)) voice.resume();
    updateTiming(run);
    setState(previous => ({ ...previous, status: "playing" }));
    run.playback = (async () => {
      try {
        while (valid() && run.index < run.briefing!.podcast.turns.length) {
          await abortable(prepare(run, run.index), controller.signal);
          if (!valid()) return;
          if (run.paused) await abortable(new Promise<void>(resolve => { run.wake = resolve; }), controller.signal);
          if (!valid()) return;
          if (run.index + 1 < run.briefing!.podcast.turns.length) void prepare(run, run.index + 1).catch(() => fail(run, voiceError));
          const turnIndex = run.index, turn = run.briefing!.podcast.turns[turnIndex]!;
          run.sounding = undefined;
          setState(previous => ({ ...previous, turnIndex, speaker: turn.speaker }));
          await abortable(Promise.resolve(run.voices![turn.speaker].speak(turn.text, {
            signal: controller.signal,
            ...(run.offset > 0 ? { offsetSeconds: run.offset } : {}),
            onStart: () => { if (valid()) run.sounding = turnIndex; },
          })), controller.signal);
          if (!valid()) return;
          run.index++; run.offset = 0; run.sounding = undefined;
          updateTiming(run);
        }
        if (valid()) setState(previous => ({ ...previous, status: "ended", speaker: undefined }));
      } catch { if (valid()) fail(run, voiceError); }
      finally { if (run.playbackController === controller) { run.playback = undefined; run.playbackController = undefined; } }
    })();
    return run.playback;
  }, [active, fail, prepare, updateTiming]);
  const resume = useCallback(() => { void play(); }, [play]);
  const pause = useCallback(() => {
    const run = current.current;
    if (!run || !active(run) || !run.playback || run.paused) return;
    updateTiming(run);
    run.paused = true;
    for (const voice of Object.values(run.voices ?? {})) voice.pause();
    setState(previous => ({ ...previous, status: "paused" }));
  }, [active, updateTiming]);
  const seek = useCallback((seconds: number) => {
    const run = current.current;
    if (!run || !active(run) || !run.ready || !run.briefing || !Number.isFinite(seconds)) return;
    let available = 0;
    for (let index = 0; index < run.briefing.podcast.turns.length; index++) {
      const duration = run.durations.get(index);
      if (!duration?.supportsOffsets) break;
      available += duration.seconds;
    }
    if (available <= 0) return;
    let offset = Math.max(0, Math.min(seconds, available - .01)), index = 0;
    while (offset >= run.durations.get(index)!.seconds) { offset -= run.durations.get(index)!.seconds; index++; }
    const wasPlaying = !!run.playback && !run.paused;
    run.playbackController?.abort(); run.playbackController = undefined; run.playback = undefined;
    run.wake?.(); run.wake = undefined;
    for (const voice of Object.values(run.voices ?? {})) voice.pause();
    run.index = index; run.offset = offset; run.sounding = undefined; run.paused = !wasPlaying;
    updateTiming(run);
    setState(previous => ({ ...previous, status: "paused", turnIndex: index, speaker: run.briefing!.podcast.turns[index].speaker }));
    if (wasPlaying) void play();
  }, [active, play, updateTiming]);
  const setPlaybackRate = useCallback((rate: number) => {
    if (!Number.isFinite(rate)) return;
    const value = Math.max(.5, Math.min(2, rate));
    rateRef.current = value; setRate(value);
    const run = current.current;
    if (run) { run.rate = value; for (const voice of Object.values(run.voices ?? {})) voice.setPlaybackRate?.(value); }
  }, []);
  const getAudioLevel = useCallback(() => {
    const run = current.current;
    const speaker = run?.briefing?.podcast.turns[run.index]?.speaker;
    return run && active(run) && !run.paused && run.sounding === run.index && speaker ? run.voices?.[speaker].getAudioLevel?.() ?? 0 : 0;
  }, [active]);
  useEffect(() => {
    if (state.status !== "playing") return;
    const timer = setInterval(() => { const run = current.current; if (run) updateTiming(run); }, 100);
    return () => clearInterval(timer);
  }, [state.status, updateTiming]);
  const stop = useCallback(() => {
    cancel();
    if (mounted.current) {
      setState(previous => ({ ...previous, status: "idle", error: undefined, speaker: undefined, turnIndex: -1 }));
      setTiming({ currentTime: 0, duration: 0, durationEstimated: true, seekableDuration: 0 });
    }
  }, [cancel]);
  return { ...state, ...timing, playbackRate, getAudioLevel, setPlaybackRate, seek, generate, play, pause, resume, stop };
}
