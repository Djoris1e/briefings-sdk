import { forwardRef, useEffect, useImperativeHandle, useId, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { useVideoChatSession } from "../video-chat/use-video-chat";
import { CaptionWords } from "../video-chat/caption-words";
import { OpeningChapter } from "../video-chat/opening-chapter";
import { isNarrationWarning } from "../video-chat/recovery";
import { Play, Stop as PauseIcon, Replay, Send, Sound, Muted } from "../video-chat/icons";
import { VideoPlayer } from "../player/video-player";
import { usePromptOutput } from "./use-prompt-output";
import { PodcastPlayer } from "./PodcastPlayer";
import { useFullscreen } from "./use-fullscreen";
import { ArticleView } from "./ArticleView";
import "./prompt-output.css";
import { MAX_PROMPT_CHARACTERS } from "../protocol/prompt-limits";
import { buildBriefingPrompt } from "./context";
import type { PreparedBriefing, ScreenshotAsset } from "./types";

export type OutputFormat = "text" | "podcast" | "video";
export interface PromptOutputGenerateOptions { screenshots?: readonly ScreenshotAsset[] }
export interface PromptOutputHandle {
  generate(prompt: string, format: OutputFormat, options?: PromptOutputGenerateOptions): Promise<void>;
  cancel(): void;
}
export interface PromptExample {
  id: string; title: string; description: string; prompt: string;
  sources?: readonly { title: string; url: string }[];
  screenshots?: readonly ScreenshotAsset[];
}
export interface PromptOutputTheme {
  scheme?: "light" | "dark";
  accent?: string; surface?: string; text?: string; muted?: string; border?: string;
  fontFamily?: string; radius?: string; density?: "comfortable" | "compact";
}
export interface PromptOutputProps {
  theme?: PromptOutputTheme;
  /** Customer-facing publisher label; independent of SDK ownership. */
  publisher?: string;
  endpoint?: string;
  initialPrompt?: string;
  screenshots?: readonly ScreenshotAsset[];
  defaultFormat?: OutputFormat;
  showComposer?: boolean;
  examples?: readonly PromptExample[];
  exampleNote?: string;
  className?: string;
}
const formats: { id: OutputFormat; label: string }[] = [
  { id: "video", label: "Video" }, { id: "podcast", label: "Podcast" }, { id: "text", label: "Text" },
];
const MAX_PROMPT = MAX_PROMPT_CHARACTERS;
const BRIEFING_AUDIO = { musicMood: "auto", musicVolume: .24 } as const;

/** Briefing output surface. The host owns context; this component owns presentation. */
export const PromptOutput = forwardRef<PromptOutputHandle, PromptOutputProps>(function PromptOutput({
  endpoint = "/api/video-chat", initialPrompt = "", defaultFormat = "video", showComposer = true,
  className = "", theme = {}, examples = [], screenshots = [], publisher = "Product updates", exampleNote = "Sample customer context · Supplied product updates",
}, ref) {
  const promptId = useId();
  const exampleSources = [...new Map(examples.flatMap(example => example.sources ?? []).map(source => [source.url, source])).values()];
  const container = useRef<HTMLElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => setOrientation(element.getBoundingClientRect().width <= 600 ? "portrait" : "landscape");
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [followup, setFollowup] = useState("");
  const [format, setFormat] = useState<OutputFormat>(defaultFormat);
  const formatRef = useRef<OutputFormat>(defaultFormat);
  const [started, setStarted] = useState(false);
  const fullscreen = useFullscreen(container, started && format === "video");
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [videoPending, setVideoPending] = useState(false);
  const [presentedVideo, setPresentedVideo] = useState<string>();
  const [validation, setValidation] = useState<string>();
  const [videoFailure, setVideoFailure] = useState<string>();
  const [selectedExample, setSelectedExample] = useState<PromptExample>();
  const [stopped, setStopped] = useState(false);
  const [schemeOverride, setSchemeOverride] = useState<{ host: PromptOutputTheme["scheme"]; scheme: "light" | "dark" }>();
  const scheme = schemeOverride && schemeOverride.host === theme.scheme ? schemeOverride.scheme : theme.scheme ?? "dark";
  const generation = useRef(0);
  const activePrompt = useRef("");
  const originalPrompt = useRef("");
  const currentQuestion = useRef("");
  const history = useRef<Array<{ prompt: string; answer?: string }>>([]);
  const hasVideo = useRef(false);
  const outputPrompt = useRef("");
  const prepared = useRef<PreparedBriefing | undefined>(undefined);
  const generationAssets = useRef<readonly ScreenshotAsset[]>(screenshots);
  const output = usePromptOutput({ endpoint });
  const { chat: video, getCaptionProgress, captionKey } = useVideoChatSession({ endpoint, orientation, audio: BRIEFING_AUDIO, initialMuted: false,
    // This surface renders neither welcome cards nor follow-up suggestion cards.
    prompts: { welcome: false, suggestions: false } });
  // The embed owns this mix; update a currently playing response after HMR too.
  useEffect(() => video.setAudioPreferences(BRIEFING_AUDIO), [video.setAudioPreferences]);
  const busy = format === "video" ? videoPending : output.status === "writing" || (format === "podcast" && output.status === "preparing");
  const videoDisplayKey = `${generation.current}:${video.playerKey}`;
  const showOpening = started && ((!hasVideo.current && videoPending) || (hasVideo.current && presentedVideo !== videoDisplayKey && !["error", "cancelled", "ended"].includes(video.status)));
  const narrationNeedsRetry = video.warnings.some(isNarrationWarning);
  const cancel = () => {
    generation.current++; output.stop(); video.cancel(); setVideoPending(false); setStarted(false);
  };
  useEffect(() => () => { generation.current++; }, []);
  const createVideo = async (source: string, assets: readonly ScreenshotAsset[], run: number) => {
    if (run !== generation.current) return;
    hasVideo.current = true;
    flushSync(() => { video.reset(); setVideoPending(true); });
    try {
      // Apply this component's mix before Ask reads it, including after HMR.
      video.setAudioPreferences(BRIEFING_AUDIO);
      const playing = video.ask(source, { screenshots: assets });
      // Generation prepares the hidden video too, but it must never narrate
      // over the podcast or consume playback while another format is visible.
      if (formatRef.current !== "video") video.pause();
      await playing;
    } finally { if (run === generation.current) setVideoPending(false); }
  };
  const retryVideo = () => {
    const run = generation.current;
    setVideoFailure(undefined); setStopped(false);
    // A retried video may reuse an earlier player key; show the opening again
    // until the new stream presents its first frame.
    setPresentedVideo(undefined);
    void createVideo(activePrompt.current, generationAssets.current, run).catch(() => {
      if (run === generation.current) setVideoFailure("The video could not finish. Please try again.");
    });
  };
  const revealResult = () => {
    const element = result.current;
    if (!element) return;
    const view = element.ownerDocument.defaultView;
    if (!view) return;
    const targetTop = element.getBoundingClientRect().top;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (!/(auto|scroll)/u.test(view.getComputedStyle(parent).overflowY) || parent.scrollHeight <= parent.clientHeight) continue;
      const bounds = parent.getBoundingClientRect();
      const top = Math.max(0, bounds.top + parent.clientTop);
      const bottom = Math.min(view.innerHeight, bounds.top + parent.clientTop + parent.clientHeight);
      if (targetTop < top || targetTop >= bottom) parent.scrollTo({ top: parent.scrollTop + targetTop - top, behavior: "instant" });
      return;
    }
    if (targetTop < 0 || targetTop >= view.innerHeight) view.scrollTo({ top: view.scrollY + targetTop, behavior: "instant" });
  };
  const runPrompt = async (value: string, kind: OutputFormat) => {
    if (!value.trim() || value.length > MAX_PROMPT || !formats.some(item => item.id === kind)) {
      setValidation("Enter a prompt of up to 12,000 characters and choose an output format."); return;
    }
    cancel(); hasVideo.current = false; prepared.current = undefined;
    activePrompt.current = value; outputPrompt.current = value;
    const run = generation.current;
    formatRef.current = kind;
    setValidation(undefined); setVideoFailure(undefined); setStopped(false); setFollowup(""); setFormat(kind); setStarted(true); setVideoPending(true);
    // Video streams from the same supplied source while the reading/podcast
    // preparation runs independently. A slow or failed preparation cannot
    // prevent the video from starting or interrupt its playback.
    const videoWork = createVideo(value, generationAssets.current, run).catch(() => {
      if (run === generation.current) setVideoFailure("The video could not finish. Please try again.");
    });
    // createVideo synchronously mounts the result. Reveal it only for this
    // explicit generation, never on a passive resize or format switch.
    revealResult();
    const outputWork = output.generate(value, "podcast", {
      screenshots: generationAssets.current,
      onPrepared: briefing => {
        if (run !== generation.current) return;
        prepared.current = briefing;
      },
    });
    await Promise.all([videoWork, outputWork]);
  };
  // Host generation starts a fresh briefing; the result composer continues it.
  const generate = async (value: string, kind: OutputFormat, options: PromptOutputGenerateOptions = {}) => {
    if (!value.trim() || value.length > MAX_PROMPT || !formats.some(item => item.id === kind)) {
      setValidation("Enter a prompt of up to 12,000 characters and choose an output format."); return;
    }
    originalPrompt.current = value; currentQuestion.current = "Create the initial briefing."; history.current = [];
    generationAssets.current = options.screenshots ?? screenshots;
    setPrompt(value);
    await runPrompt(value, kind);
  };
  const askFollowup = async () => {
    if (!followup.trim()) return;
    // Conversation continuity uses the shared factual summary, never a
    // modality-specific retelling or the podcast's conversational filler.
    const nextHistory = [...history.current, { prompt: currentQuestion.current, answer: prepared.current?.summary }].slice(-8);
    try {
      const contextualPrompt = buildBriefingPrompt(originalPrompt.current, nextHistory, followup, MAX_PROMPT);
      history.current = nextHistory; currentQuestion.current = followup;
      await runPrompt(contextualPrompt, format);
    } catch (cause) {
      setValidation(cause instanceof Error ? cause.message : "Please shorten your follow-up.");
    }
  };
  useImperativeHandle(ref, () => ({ generate, cancel }));
  const retryOutput = () => {
    const run = generation.current;
    setValidation(undefined); setStopped(false);
    void output.generate(activePrompt.current, "podcast", {
      screenshots: generationAssets.current,
      onPrepared: briefing => { if (run === generation.current) prepared.current = briefing; },
    });
  };
  const chooseFormat = (kind: OutputFormat) => {
    if (kind === format) return;
    video.pause(); output.pause();
    formatRef.current = kind;
    setFormat(kind); setValidation(undefined);
    // Every format derives from the supplied source. Switching does not make
    // another briefing request or regenerate the video.
    if (kind === "video" && hasVideo.current) {
      if (video.playbackEnded) video.replay(); else video.resume();
    }
  };
  const error = validation ?? (format === "video" ? videoFailure ?? video.error?.message : format === "text" && output.text ? undefined : output.error);
  const playbackEnded = format === "video" ? video.playbackEnded : output.status === "ended";
  const playbackPaused = format === "video" ? video.status === "paused" : output.status !== "playing";
  const playbackLabel = playbackEnded ? `Replay ${format}` : playbackPaused ? (format === "podcast" && output.status !== "paused" ? "Play podcast" : "Resume") : "Pause";
  const playbackEnabled = format === "video" ? Boolean(video.playerProps && !showOpening) : ["ready", "playing", "paused", "ended"].includes(output.status);
  const togglePlayback = () => {
    if (format === "video") { if (playbackEnded) video.replay(); else if (playbackPaused) video.resume(); else video.pause(); }
    else if (output.status === "playing") output.pause();
    else if (output.status === "paused") output.resume();
    else void output.play();
  };
  const themeStyle = {
    "--po-accent": theme.accent, "--po-surface": theme.surface, "--po-ink": theme.text,
    "--po-muted": theme.muted, "--po-border": theme.border, "--po-radius": theme.radius, fontFamily: theme.fontFamily,
  } as CSSProperties;

  return <section ref={container} data-orientation={orientation} className={`prompt-output ${className}`} aria-label="Personalized product updates"
    data-theme={scheme} data-fullscreen={fullscreen.mode} data-started={started} data-format={format} data-density={theme.density ?? "comfortable"} style={themeStyle}>
    <header className="po-chrome">
      <button className="po-theme-switch" type="button" aria-label={`Switch to ${scheme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${scheme === "dark" ? "light" : "dark"} mode`}
        onClick={() => setSchemeOverride({ host: theme.scheme, scheme: scheme === "dark" ? "light" : "dark" })}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          {scheme === "dark" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.5 13.5A8.5 8.5 0 0 1 10.5 3a8.5 8.5 0 1 0 10 10.5Z" />}
        </svg>
      </button>
    </header>
    {!started && showComposer && <form className="po-composer" onSubmit={event => { event.preventDefault(); setSelectedExample(undefined); void generate(prompt, defaultFormat, { screenshots }); }}>
      <div className="po-welcome"><p className="po-eyebrow">{publisher}</p><h1>What’s new.<br /><em>For you.</em></h1><p>Product updates connected to your goals, the tools you use, and what interests you.<br />Watch, listen, or read.</p></div>
      {examples.length > 0 && <div className="po-examples"><p className="po-eyebrow">Start with an example</p>
        <div className="po-example-grid">{examples.map((example, index) => <button type="button" key={example.id}
          onClick={() => { setSelectedExample(example); void generate(example.prompt, defaultFormat, { screenshots: example.screenshots ?? screenshots }); }}>
          <span className="po-example-index" aria-hidden="true">0{index + 1}<span>↗</span></span><strong>{example.title}</strong><span>{example.description}</span>
        </button>)}</div>
        <p className="po-example-note">{exampleNote}</p>
        {exampleSources.length > 0 && <details className="po-sources"><summary>Release notes behind these examples</summary><ul>{exampleSources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></details>}
      </div>}
      <div className="po-input-card">
      <label htmlFor={promptId} className="po-label">What should this person know?</label>
      <textarea id={promptId} value={prompt} maxLength={MAX_PROMPT} rows={prompt.length > 1000 ? 6 : 2}
        placeholder="Add customer goals, product adoption, interests, and release notes…"
        onChange={event => { setPrompt(event.target.value); setSelectedExample(undefined); setValidation(undefined); }} />
      <div className="po-composer-footer"><span className="po-character-count">{prompt.length.toLocaleString()} / {MAX_PROMPT.toLocaleString()}</span>
        <button className="po-create" type="submit" disabled={!prompt.trim()}>Create briefing<span aria-hidden="true">↑</span></button>
      </div>
      </div>
    </form>}
    {!started && !showComposer && <div className="po-empty"><p>Ready for a prompt from the host.</p></div>}
    {!started && validation && <p role="alert" className="po-error">{validation}</p>}
    {started && <div ref={result} className="po-result">
      <div role="tabpanel" id={`${promptId}-text`} aria-labelledby={`${promptId}-tab-text`} hidden={format !== "text"}>
        {outputPrompt.current === activePrompt.current && (output.text || output.status === "writing") && <ArticleView publisher={publisher} pending={!output.text && output.status === "writing"} article={output.briefing?.article} summary={output.text} title={selectedExample?.title ?? "Your briefing"} briefingId={output.briefing?.id} />}
      </div>
      <div role="tabpanel" id={`${promptId}-podcast`} aria-labelledby={`${promptId}-tab-podcast`} hidden={format !== "podcast"}>
        {outputPrompt.current === activePrompt.current && <PodcastPlayer publisher={publisher}
          title={output.briefing?.article?.title ?? selectedExample?.title ?? "Your updates"} turns={output.briefing?.podcast.turns ?? []}
          status={output.status} turnIndex={output.turnIndex} currentTime={output.currentTime}
          duration={output.duration} durationEstimated={output.durationEstimated} seekableDuration={output.seekableDuration}
          playbackRate={output.playbackRate} getAudioLevel={output.getAudioLevel}
          onToggle={togglePlayback} onSeek={output.seek} onRate={output.setPlaybackRate}
        />}
      </div>
      <div role="tabpanel" id={`${promptId}-video`} aria-labelledby={`${promptId}-tab-video`} hidden={format !== "video"}>
        <div className="po-video-result">
          <div className="po-video">
            <button type="button" className="po-fullscreen" aria-label={fullscreen.active ? "Exit fullscreen" : "Enter fullscreen"} title={fullscreen.active ? "Exit fullscreen" : "Enter fullscreen"} onClick={fullscreen.toggle}>
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={fullscreen.active ? "M8 3v5H3m13-5v5h5M8 21v-5H3m13 5v-5h5" : "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"} /></svg>
            </button>
            {hasVideo.current && video.playerProps && <VideoPlayer key={video.playerKey} {...video.playerProps} orientation={orientation} onFramePresented={() => { video.playerProps?.onFramePresented?.(); setPresentedVideo(videoDisplayKey); }} />}
            {showOpening && <OpeningChapter title={selectedExample?.title ?? "Your briefing."} preparing />}
            {subtitlesEnabled && video.caption && !video.playbackEnded && !showOpening && <div className="po-caption"><CaptionWords presentation="subtitles" key={`${video.shownTurn?.id}:${captionKey}`} text={video.caption} getProgress={getCaptionProgress} paused={video.status === "paused"} silent={!video.speaking} muted={video.muted} /></div>}
          </div>
        </div>
      </div>
      <div className="po-conversation-controls">
        {error && <div role="alert" className="po-error">{error}{format !== "video" && output.error && !validation && <button type="button" className="po-retry" onClick={retryOutput}>Retry text and podcast</button>}</div>}
        {format === "video" && !videoPending && (videoFailure || video.error) && <button type="button" className="po-create" onClick={retryVideo}>Retry video</button>}
        {stopped && !error && <div role="status" className="po-note po-stopped">Generation stopped.
          <button type="button" className="po-retry" onClick={format === "video" ? retryVideo : retryOutput}>{format === "video" ? "Retry video" : "Retry text and podcast"}</button></div>}
        <form className="po-followup" aria-label="Briefing controls" onSubmit={event => { event.preventDefault(); if (!busy) void askFollowup(); }}>
          {format === "video" && <button className="po-playback" type="button" aria-label={playbackLabel} title={playbackLabel} disabled={!playbackEnabled} onClick={togglePlayback}>{playbackEnded ? <Replay /> : playbackPaused ? <Play /> : <PauseIcon />}</button>}
          {showComposer && <textarea aria-label="Ask a follow-up" value={followup} maxLength={MAX_PROMPT} rows={1} placeholder="Ask a follow-up…"
            onChange={event => { setFollowup(event.target.value); setValidation(undefined); }}
            onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy) void askFollowup(); } }} />}
          {format === "video" && <button className="po-subtitles" type="button" aria-label="Subtitles" aria-pressed={subtitlesEnabled} title={subtitlesEnabled ? "Turn subtitles off" : "Turn subtitles on"} onClick={() => setSubtitlesEnabled(enabled => !enabled)}><span aria-hidden="true">CC</span></button>}
          {format === "video" && narrationNeedsRetry && <button className="po-sound" type="button" aria-label="Retry narration" title="Retry narration" disabled={!video.shownTurn?.completed} onClick={() => video.retryNarration()}><Replay /></button>}
          {format === "video" && <button className="po-sound" type="button" aria-label={video.muted ? "Unmute" : "Mute"} title={video.muted ? "Unmute" : "Mute"} onClick={() => video.setMuted(!video.muted)}>{video.muted ? <Muted /> : <Sound />}</button>}
          {busy ? <button type="button" aria-label="Stop generation" onClick={() => { generation.current++; output.stop(); video.cancel(); setVideoPending(false); setStopped(true); }}>■</button>
            : showComposer && <button type="submit" aria-label="Send follow-up" disabled={!followup.trim()}><Send /></button>}
        </form>
        <div className="po-result-tabs" role="tablist" aria-label="Output format">{formats.map(item => <button key={item.id} role="tab" aria-selected={format === item.id} aria-controls={`${promptId}-${item.id}`} id={`${promptId}-tab-${item.id}`} onClick={() => void chooseFormat(item.id)}>{item.label}</button>)}</div>
      </div>
    </div>}
  </section>;
});
