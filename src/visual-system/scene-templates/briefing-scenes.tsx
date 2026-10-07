import { useEffect, useRef, useState } from "react";
import type { SceneTemplateProps } from "./types";
import { EditorialSurface } from "./editorial-background";
import { editorialFont, fade, editorialType, editorialEntrance, paginateEditorialText, editorialPage } from "./editorial-typography";

/** One pass of illustrative footage; the authored text remains after it ends. */
function BriefingMedia({ variables, isPlaying = true, progress }: Pick<SceneTemplateProps, "variables" | "isPlaying" | "progress">) {
  const video = useRef<HTMLVideoElement>(null);
  const previousProgress = useRef(progress);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [variables.mediaUrl]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (isPlaying && !element.ended) void element.play().catch(() => setFailed(true));
    else element.pause();
  }, [isPlaying, variables.mediaUrl]);
  useEffect(() => {
    const element = video.current;
    if (element && progress < previousProgress.current - .1) {
      element.currentTime = 0;
      if (isPlaying) void element.play().catch(() => setFailed(true));
    }
    previousProgress.current = progress;
  }, [progress, isPlaying]);
  if (failed || !variables.mediaUrl) return <div data-media-fallback="text" style={{ height: "100%", display: "grid", placeContent: "center", color: "#737378", fontSize: 14 }}>Your briefing continues.</div>;
  return variables.mediaType === "video"
    ? <video ref={video} src={String(variables.mediaUrl)} poster={variables.mediaPoster ? String(variables.mediaPoster) : undefined} muted playsInline preload="auto" onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    : <img src={String(variables.mediaUrl)} alt="Illustrative visual" onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
}

const surface = { position: "absolute", inset: 0, background: "#090a0b", color: "#fff", fontFamily: editorialFont, overflow: "hidden" } as const;
const paragraph = { margin: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" } as const;

/** Fixed, readable type. Extra authored copy receives time, never smaller type. */
function copyPages(text: string, width: number, height: number, font: number, lineHeight: number) {
  return paginateEditorialText(text, width, height, font, lineHeight);
}

export function TextMediaScene(props: SceneTemplateProps) {
  const { variables, width, height, progress, motionProgress = progress, sceneDuration } = props;
  const unit = Math.min(width, height), type = editorialType(unit), column = width * (height > width ? .84 : .72);
  const titles = copyPages(String(variables.title ?? ""), column, height * .27, type.title, 1.04);
  const bodies = copyPages(String(variables.body ?? ""), column, height * .25, type.body, 1.42);
  const page = editorialPage(progress, Math.max(titles.length, bodies.length));
  return <EditorialSurface {...props} template="textMedia" treatment="bottom">
    <div data-briefing-composition="headline" style={{ position: "absolute", left: "8%", bottom: "20%", width: column, opacity: editorialEntrance(motionProgress, sceneDuration), display: "flex", flexDirection: "column", gap: unit * .045 }}>
      <div data-editorial-text="title" data-copy-field="title" data-copy-page={Math.min(page, titles.length - 1)} style={{ ...paragraph, fontSize: type.title, lineHeight: 1.04, fontWeight: 600, letterSpacing: "-.045em" }}>{titles[Math.min(page, titles.length - 1)]}</div>
      <div data-editorial-text="body" data-copy-field="body" data-copy-page={Math.min(page, bodies.length - 1)} style={{ ...paragraph, maxWidth: column * .94, fontSize: type.body, lineHeight: 1.42, color: "#d4d4d4" }}>{bodies[Math.min(page, bodies.length - 1)]}</div>
    </div>
  </EditorialSurface>;
}

export function PersonalRelevanceScene(props: SceneTemplateProps) {
  const { variables, width, height, progress, motionProgress = progress, sceneDuration } = props;
  const unit = Math.min(width, height), type = editorialType(unit), column = width * .84;
  const people = copyPages(`For ${String(variables.person ?? "")}`, column, height * .08, type.label, 1.3);
  const goals = copyPages(String(variables.goal ?? ""), column, height * .29, type.title, 1.04);
  const reasons = copyPages(String(variables.why ?? ""), column, height * .24, type.body, 1.42);
  const page = editorialPage(progress, Math.max(people.length, goals.length, reasons.length));
  return <EditorialSurface {...props} template="personalRelevance" treatment="bottom">
    <div data-briefing-composition="outcome" style={{ position: "absolute", left: "8%", bottom: "20%", width: column, opacity: editorialEntrance(motionProgress, sceneDuration) }}>
      <div data-editorial-text="person" data-copy-field="person" data-copy-page={Math.min(page, people.length - 1)} style={{ ...paragraph, fontSize: type.label, lineHeight: 1.3, color: "#b6b6b6", marginBottom: unit * .045 }}>{people[Math.min(page, people.length - 1)]}</div>
      <div data-editorial-text="goal" data-copy-field="goal" data-copy-page={Math.min(page, goals.length - 1)} style={{ ...paragraph, fontSize: type.title, lineHeight: 1.04, fontWeight: 600, letterSpacing: "-.045em" }}>{goals[Math.min(page, goals.length - 1)]}</div>
      <div data-editorial-text="why" data-copy-field="why" data-copy-page={Math.min(page, reasons.length - 1)} style={{ ...paragraph, marginTop: unit * .05, fontSize: type.body, lineHeight: 1.42, color: "#d4d4d4" }}>{reasons[Math.min(page, reasons.length - 1)]}</div>
    </div>
  </EditorialSurface>;
}

export function ActionStepsScene(props: SceneTemplateProps) {
  const { variables, width, height, progress, motionProgress = progress, sceneDuration } = props;
  const unit = Math.min(width, height), type = editorialType(unit), column = width * .84;
  const steps = (Array.isArray(variables.steps) ? variables.steps : []) as Array<{ label: string; detail: string }>;
  const title = String(variables.title ?? "");
  const headings = copyPages(title, column, height * .09, type.label, 1.3);
  const pages = steps.flatMap((step, stepIndex) => {
    const labels = copyPages(step.label, column, height * .27, type.title, 1.04);
    const details = copyPages(step.detail, column, height * .22, type.body, 1.42);
    return Array.from({ length: Math.max(labels.length, details.length) }, (_, page) => ({ stepIndex,
      label: labels[Math.min(page, labels.length - 1)], labelPage: Math.min(page, labels.length - 1),
      detail: details[Math.min(page, details.length - 1)], detailPage: Math.min(page, details.length - 1) }));
  });
  const page = editorialPage(progress, pages.length), current = pages[page];
  const headingPage = editorialPage(progress, headings.length);
  return <EditorialSurface {...props} template="actionSteps" treatment="bottom">
    <div style={{ position: "absolute", left: "8%", bottom: "20%", width: column, opacity: editorialEntrance(motionProgress, sceneDuration) }}>
      <div data-editorial-text="title" data-copy-field="title" data-copy-page={headingPage} style={{ ...paragraph, color: "#b6b6b6", fontSize: type.label, lineHeight: 1.3, marginBottom: unit * .065 }}>{headings[headingPage]}</div>
      {current && <div data-action-step={current.stepIndex + 1} data-active-action="true">
        <div data-editorial-text="label" data-copy-field={`step-${current.stepIndex}-label`} data-copy-page={current.labelPage} style={{ ...paragraph, fontSize: type.title, fontWeight: 600, letterSpacing: "-.045em", lineHeight: 1.04 }}>{current.label}</div>
        <div data-editorial-text="detail" data-copy-field={`step-${current.stepIndex}-detail`} data-copy-page={current.detailPage} style={{ ...paragraph, fontSize: type.body, lineHeight: 1.42, color: "#d4d4d4", marginTop: unit * .05 }}>{current.detail}</div>
      </div>}
      <div data-action-rail="true" aria-label={`Step ${(current?.stepIndex ?? 0) + 1} of ${steps.length}`} style={{ display: "flex", alignItems: "center", gap: unit * .025, marginTop: unit * .065 }}>
        {steps.map((_step, index) => <span key={index} aria-current={current?.stepIndex === index ? "step" : undefined} style={{ width: unit * .085, height: 2, background: current?.stepIndex === index ? "#fff" : "#676767" }} />)}
        <span style={{ fontSize: type.label, color: "#b6b6b6", marginLeft: unit * .015 }}>{(current?.stepIndex ?? 0) + 1} / {steps.length}</span>
      </div>
    </div>
  </EditorialSurface>;
}

export function ScreenshotSpotlightScene(props: SceneTemplateProps) {
  const { variables, width, height, progress, motionProgress = progress } = props;
  const [ratio, setRatio] = useState(16 / 9), unit = Math.min(width, height), type = editorialType(unit);
  const illustrative = variables.mediaType === "video" && Boolean(variables.mediaUrl);
  const column = width * .88, viewportW = width * (illustrative ? .64 : .88), viewportH = height * (height > width ? .43 : .55);
  // Keep the stage generous. Contain the complete original inside it first;
  // its aspect ratio must not shrink the stage used by the focused view.
  const imageW = Math.min(viewportW, viewportH * ratio), imageH = imageW / ratio;
  const raw = variables.highlight as { x: number; y: number; width: number; height: number } | undefined;
  const highlight = raw && [raw.x, raw.y, raw.width, raw.height].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)
    && raw.width > 0 && raw.height > 0 && raw.x + raw.width <= 1 && raw.y + raw.height <= 1 ? raw : undefined;
  const focus = highlight ? fade((motionProgress - .3) / .3) : 0;
  const targetScale = highlight ? Math.max(1, Math.min(4,
    .9 * Math.min(viewportW / (imageW * highlight.width), viewportH / (imageH * highlight.height)))) : 1;
  const scale = 1 + (targetScale - 1) * focus;
  const centerX = highlight ? highlight.x + highlight.width / 2 : .5;
  const centerY = highlight ? highlight.y + highlight.height / 2 : .5;
  // Center a contained image; once it covers an axis, clamp its translation
  // to source edges. Highlight coordinates are relative to actual source pixels.
  const position = (viewport: number, pixels: number, center: number) => pixels * scale <= viewport
    ? (viewport - pixels * scale) / 2
    : Math.max(viewport - pixels * scale, Math.min(0, viewport / 2 - pixels * scale * (.5 + (center - .5) * focus)));
  const translateX = position(viewportW, imageW, centerX), translateY = position(viewportH, imageH, centerY);
  const titles = copyPages(String(variables.title ?? ""), column, height * .13, type.body * 1.35, 1.12);
  const page = editorialPage(progress, titles.length);
  return <div data-template="screenshotSpotlight" style={surface}>
    <div data-editorial-text="title" data-copy-field="title" data-copy-page={Math.min(page, titles.length - 1)} style={{ ...paragraph, position: "absolute", left: "6%", top: "7%", width: column, textAlign: "center", fontSize: type.body * 1.35, lineHeight: 1.12, fontWeight: 550, letterSpacing: "-.025em" }}>{titles[Math.min(page, titles.length - 1)]}</div>
    <div data-source-viewport="true" data-source-focus={highlight ? "authored-region" : "overview"} style={{ position: "absolute", left: width * .06, top: height * .23, width: viewportW, height: viewportH, overflow: "hidden", background: "#151515" }}>
      <div data-screenshot-original="true" style={{ position: "absolute", width: imageW, height: imageH, transformOrigin: "top left", transform: `translate(${translateX}px, ${translateY}px) scale(${scale})` }}>
        <img src={typeof variables.sourceImageUrl === "string" ? variables.sourceImageUrl : undefined} alt={String(variables.screenshotAlt ?? "Source screenshot")} onLoad={event => setRatio(event.currentTarget.naturalWidth / Math.max(1, event.currentTarget.naturalHeight))} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        {highlight && <div data-screenshot-highlight="true" style={{ position: "absolute", left: `${highlight.x * 100}%`, top: `${highlight.y * 100}%`, width: `${highlight.width * 100}%`, height: `${highlight.height * 100}%`, boxSizing: "border-box", border: `${Math.max(1, unit * .003 / scale)}px solid #fff`, opacity: fade((motionProgress - .12) / .15) * (1 - focus * .7), pointerEvents: "none" }} />}
      </div>
    </div>
    {illustrative && <div data-illustrative-animation="true" style={{ position: "absolute", right: "5%", top: "23%", width: width * .23, height: height * .16, border: "1px solid #888", background: "#080808" }}><BriefingMedia {...props} /><div style={{ position: "absolute", bottom: 0, width: "100%", background: "#000c", padding: "4px", color: "#fff", fontSize: type.label }}>Illustrative AI animation</div></div>}
  </div>;
}
