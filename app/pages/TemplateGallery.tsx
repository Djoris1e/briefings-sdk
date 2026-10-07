import { Suspense, useEffect, useRef, useState } from "react";
import { SCENE_DEFINITIONS, type BuiltinSceneId } from "../../src/visual-system/catalog/builtin-metadata";
import { getBuiltinSceneRenderer, preloadBuiltinTemplate } from "../../src/visual-system/catalog/builtin-player";
import { examples } from "../example-prompts";
import { templateReviews, reviewSummary, selectionRules } from "../template-review";
import "./template-gallery.css";

const FOOTAGE = "https://videos.pexels.com/video-files/9464470/9464470-hd_1366_720_30fps.mp4";
const GENERATED_FOOTAGE = "https://v3b.fal.media/files/b/0aad5659/uQI9wmiurcnmF_o90SFqo_minimax-h3.mp4";
const screenshot = examples[0].screenshots[0];
const COLLECTION: BuiltinSceneId[] = ["chapterTitle", "cinemaMedia", "personalRelevance", "screenshotSpotlight", "textMedia", "keyFigure", "comparison", "editorialTimeline", "quote", "actionSteps"];
const previewDuration = (id: BuiltinSceneId) => id === "cinemaMedia" || id === "personalRelevance" ? 5 : id === "actionSteps" || id === "editorialTimeline" ? 12 : id === "comparison" || id === "screenshotSpotlight" ? 8 : 6;
const SAMPLES: Record<BuiltinSceneId, { label: string; use: string; variables: Record<string, unknown> }> = {
  cinemaMedia: { label: "Full-frame footage", use: "An illustrative filmed action or generated scene that supports the narration.", variables: { mediaUrl: GENERATED_FOOTAGE, mediaType: "video" } },
  chapterTitle: { label: "Chapter title", use: "Introduce one idea, mark a chapter, or keep the answer readable when optional media is unavailable.", variables: { title: "Less catching up. More moving forward." } },
  keyFigure: { label: "Key figure", use: "Emphasize one supplied number with its unit and meaning. The planner must not invent a statistic.", variables: { value: "10", label: "Account packs. One controlled pilot." } },
  comparison: { label: "Comparison", use: "Explain two distinct approaches or states using parallel, supported statements.", variables: { leftLabel: "Today", leftText: "Scattered notes. Repeated preparation.", rightLabel: "The experiment", rightText: "One reviewed brief. A clear next step." } },
  quote: { label: "Quotation", use: "Present an exact supplied quotation and its attribution, rather than inventing a testimonial.", variables: { quote: "Keep a person responsible for every customer commitment.", attribution: "Pilot principle · sample quotation" } },
  editorialTimeline: { label: "Timeline", use: "Show an ordered sequence of milestones or steps whose order matters.", variables: { events: [{ label: "Confirm access" }, { label: "Run a small pilot" }, { label: "Review the evidence" }] } },
  textMedia: { label: "Explanation", use: "Pair a short heading and explanation with illustrative footage, or let the text stand alone.", variables: { title: "Make the next meeting count.", body: "Bring the sources together. Keep a person responsible for the decision." } },
  personalRelevance: { label: "Personal relevance", use: "Connect supplied audience context to a goal, clearly distinguishing a proposed benefit from a measured result.", variables: { person: "Maya", goal: "More time with customers.", why: "Test whether a reviewed brief can reduce the work before each renewal." } },
  screenshotSpotlight: { label: "Source screenshot", use: "Discuss an actual host-supplied interface image. The planner references an asset ID; it does not invent the image URL.", variables: { screenshotId: screenshot.id, sourceImageUrl: screenshot.url, screenshotAlt: screenshot.alt, title: "Keep the source in view.", caption: "Original product image. Selected region in focus.", highlight: { x: .37, y: .39, width: .4, height: .34 } } },
  actionSteps: { label: "Next steps", use: "Close with a small set of concrete recommendations, keeping owners and review conditions explicit.", variables: { title: "Your next move.", steps: [{ label: "Start small.", detail: "Choose ten synthetic account packs." }, { label: "Review together.", detail: "Compare preparation time and correction work." }, { label: "Make the call.", detail: "Continue only if the evidence supports it." }] } },
};

function initialTemplate(): BuiltinSceneId {
  if (typeof window === "undefined") return "chapterTitle";
  const id = new URLSearchParams(window.location.search).get("template");
  return SCENE_DEFINITIONS.find(definition => definition.id === id)?.id ?? "chapterTitle";
}

function Preview({ id, portrait, media, progress, playing, duration }: {
  id: BuiltinSceneId; portrait: boolean; media: boolean; progress: number; playing: boolean; duration: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const width = portrait ? 720 : 1280, height = portrait ? 1280 : 720;
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const renderer = getBuiltinSceneRenderer(id)!;
  const Template = renderer.component;
  const variables = { ...renderer.defaults, ...SAMPLES[id].variables,
    ...(media && id !== "cinemaMedia" && id !== "screenshotSpotlight" ? { mediaUrl: id === "personalRelevance" ? GENERATED_FOOTAGE : FOOTAGE, mediaType: "video", mediaKind: "illustration" } : {}) };
  return <div className={`template-gallery__preview${portrait ? " template-gallery__preview--phone" : ""}`}>
    <div className="template-gallery__frame" ref={host} style={{ aspectRatio: `${width} / ${height}` }} aria-label={`${SAMPLES[id].label}, ${portrait ? "phone" : "desktop"}, ${media ? "with footage" : "without added footage"}`}>
      {availableWidth > 0 && <div style={{ position: "absolute", width, height, transformOrigin: "top left", transform: `scale(${availableWidth / width})`, overflow: "hidden" }}>
        <Suspense fallback={<div className="template-gallery__loading" role="status">Loading template…</div>}>
          <Template variables={variables} width={width} height={height} progress={progress} motionProgress={progress} sceneDuration={duration} isPlaying={playing} />
        </Suspense>
      </div>}
    </div>
    <p className="template-gallery__caption">{id === "screenshotSpotlight" ? "Original source image" : id === "cinemaMedia" || media ? "Full-frame illustrative footage" : "No media · original template"}</p>
  </div>;
}

/** Local developer route: actual registry renderers, with no generation calls. */
export default function TemplateGallery() {
  const [selected, setSelected] = useState<BuiltinSceneId>(initialTemplate);
  const [portrait, setPortrait] = useState(false);
  const [media, setMedia] = useState(true);
  const [compare, setCompare] = useState(false);
  const [progress, setProgress] = useState(.65);
  const [playing, setPlaying] = useState(false);
  const [tour, setTour] = useState(false);
  const progressRef = useRef(progress);
  const duration = previewDuration(selected);
  const hasMediaVariant = selected !== "cinemaMedia" && selected !== "screenshotSpotlight";
  const sample = SAMPLES[selected];
  const review = templateReviews[selected];

  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { void preloadBuiltinTemplate(selected)?.catch(() => undefined); }, [selected]);
  useEffect(() => {
    const restore = () => { setSelected(initialTemplate()); setTour(false); setPlaying(false); setProgress(.65); };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (!playing) return;
    let frame = 0, previous = performance.now();
    const tick = (now: number) => {
      const next = Math.min(1, progressRef.current + Math.min(now - previous, 100) / (duration * 1000));
      previous = now;
      progressRef.current = next;
      setProgress(next);
      if (next === 1) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);

  useEffect(() => {
    if (!tour || progress < 1) return;
    const next = COLLECTION[COLLECTION.indexOf(selected) + 1];
    if (!next) { setTour(false); return; }
    setSelected(next); progressRef.current = 0; setProgress(0); setPlaying(true);
    const url = new URL(window.location.href); url.searchParams.set("template", next);
    window.history.replaceState(null, "", url);
  }, [tour, progress, selected]);

  const select = (id: BuiltinSceneId) => {
    setTour(false); setSelected(id); setPlaying(false); setProgress(.65); progressRef.current = .65;
    const url = new URL(window.location.href); url.searchParams.set("template", id);
    window.history.replaceState(null, "", url);
  };
  const restart = () => { progressRef.current = 0; setProgress(0); setPlaying(true); };

  const playCollection = () => {
    if (tour) { setTour(false); setPlaying(false); return; }
    setSelected(COLLECTION[0]); setCompare(false); setMedia(true); setTour(true); restart();
  };

  return <main className="template-gallery">
    <header className="template-gallery__header">
      <div><p className="template-gallery__eyebrow">Motion system</p><h1>Every frame has a purpose.</h1><p>{SCENE_DEFINITIONS.length} live templates. One visual language. Desktop and phone.</p></div>
      <div className="template-gallery__header-actions"><button type="button" className="template-gallery__tour" onClick={playCollection}>{tour ? "Stop collection" : "Play collection"}</button><a href="/embed">Open briefing</a></div>
    </header>
    <p className="template-gallery__notice">Demonstration copy · Pexels and previously generated AI footage · Original Microsoft source image. The collection uses the live renderers without making generation requests.</p>
    <div className="template-gallery__layout">
      <nav className="template-gallery__list" aria-label="Choose a video template">
        {SCENE_DEFINITIONS.map((item, index) => <button key={item.id} type="button" aria-current={selected === item.id ? "true" : undefined} onClick={() => select(item.id)} onFocus={() => { void preloadBuiltinTemplate(item.id)?.catch(() => undefined); }} onPointerEnter={() => { void preloadBuiltinTemplate(item.id)?.catch(() => undefined); }}>
          <span className="template-gallery__number">{String(index + 1).padStart(2, "0")}</span>
          <span><strong>{SAMPLES[item.id].label}</strong><code>{item.id}</code><small className="template-gallery__verdict">{templateReviews[item.id]?.verdict}</small></span>
        </button>)}
      </nav>
      <section className="template-gallery__workspace" aria-label="Selected template">
        <div className="template-gallery__heading"><div><h2>{sample.label}</h2><code>{selected}</code></div><span>{duration}s preview</span></div>
        <p className="template-gallery__purpose">{sample.use}</p>
        <div className="template-gallery__toolbar">
          <div className="template-gallery__segment" role="group" aria-label="Preview dimensions"><button type="button" aria-pressed={!portrait} onClick={() => setPortrait(false)}>Desktop 16:9</button><button type="button" aria-pressed={portrait} onClick={() => setPortrait(true)}>Phone 9:16</button></div>
          {hasMediaVariant && <><label><input type="checkbox" checked={media} disabled={compare} onChange={event => setMedia(event.target.checked)} /> Add footage</label><label><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} /> Compare both</label></>}
        </div>
        <div className={`template-gallery__stages${compare && hasMediaVariant ? " template-gallery__stages--compare" : ""}`}>
          <Preview key={`${selected}-primary`} id={selected} portrait={portrait} media={hasMediaVariant ? compare || media : selected === "cinemaMedia"} progress={progress} playing={playing} duration={duration} />
          {compare && hasMediaVariant && <Preview key={`${selected}-plain`} id={selected} portrait={portrait} media={false} progress={progress} playing={playing} duration={duration} />}
        </div>
        <div className="template-gallery__transport">
          <button type="button" onClick={() => playing ? setPlaying(false) : progress >= 1 ? restart() : setPlaying(true)}>{playing ? "Pause" : "Play"}</button>
          <button type="button" onClick={restart}>Replay</button>
          <label className="template-gallery__scrubber"><span className="template-gallery__sr-only">Scene progress</span><input aria-label="Scene progress" type="range" min="0" max="1" step="0.001" value={progress} onChange={event => { const next = Number(event.target.value); setTour(false); setPlaying(false); progressRef.current = next; setProgress(next); }} /></label>
          <output>{(progress * duration).toFixed(1)} / {duration.toFixed(1)}s</output>
        </div>
        <p className="template-gallery__detail">Scrub to inspect each reveal. Footage is muted; this gallery previews composition and motion, without narration or subtitles.</p>
        {review && <section className="template-gallery__audit" aria-label="Selected template design review"><div className="template-gallery__audit-heading"><h3>Design contract</h3><span>{review.verdict}</span></div><p>{review.finding}</p><p><strong>Use it well:</strong> {review.next}</p></section>}
        <section className="template-gallery__audit" aria-label="Overall template audit"><h3>Across the collection</h3><ul>{reviewSummary.map(point => <li key={point}>{point}</li>)}</ul></section>
        <section className="template-gallery__audit" aria-label="Template selection rules"><h3>How templates are picked</h3><ul>{selectionRules.map(rule => <li key={rule}>{rule}</li>)}</ul></section>
        <p className="template-gallery__detail">Review lens: restraint, readable hierarchy, purposeful movement and an intentional edit. These are our design judgments, not Apple or Netflix certification. References: <a href="https://developer.apple.com/design/human-interface-guidelines/layout" target="_blank" rel="noreferrer">Apple layout guidance</a> and <a href="https://partnerhelp.netflixstudios.com/hc/en-us/articles/360051554394-Timed-Text-Style-Guide-Subtitle-Timing-Guidelines" target="_blank" rel="noreferrer">Netflix subtitle timing</a>.</p>
        <details className="template-gallery__data"><summary>Sample variables &amp; selection context</summary><p>The planner chooses a layout to fit the supplied information. Host policy can add footage or a matching source image; unavailable optional media leaves the authored content readable.</p><pre>{JSON.stringify(SAMPLES[selected].variables, null, 2)}</pre>{selected === "screenshotSpotlight" && <a href={screenshot.sourceUrl} target="_blank" rel="noreferrer">View the original Microsoft image source</a>}</details>
      </section>
    </div>
  </main>;
}
