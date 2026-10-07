import { EditorialSurface } from "./editorial-background";
import type { SceneTemplateProps } from "./types";
import { editorialType, editorialEntrance, editorialPage, paginateEditorialText } from "./editorial-typography";

/** The current milestone carries the meaning; the rail only communicates order. */
export function TimelineSceneTemplate(props: SceneTemplateProps) {
  const { variables, width, height, progress, sceneDuration = 6 } = props;
  const unit = Math.min(width, height), type = editorialType(unit), portrait = height > width;
  const textWidth = width * (portrait ? .84 : .68);
  const events = (Array.isArray(variables.events) ? variables.events : []).slice(0, 5).map(event => String(event?.label ?? ""));
  const sequence = events.flatMap((label, step) => paginateEditorialText(label, textWidth, height * .38, type.title, 1.16).map(text => ({ text, step })));
  const index = editorialPage(progress, sequence.length), active = sequence[index] ?? { text: "", step: 0 };
  const entrance = editorialEntrance(Math.min(1, Math.max(0, progress * sequence.length - index)), sceneDuration / Math.max(1, sequence.length));
  return <EditorialSurface {...props} template="editorialTimeline" treatment="left">
    <div style={{ position: "absolute", left: "8%", top: "13%", fontSize: type.label, color: "#e4e4e4", fontVariantNumeric: "tabular-nums" }}>{String(active.step + 1).padStart(2, "0")} / {String(events.length).padStart(2, "0")}</div>
    <div data-template-item="steps" data-active-step={active.step} style={{ position: "absolute", left: "8%", top: "29%", width: textWidth, opacity: entrance, transform: `translateY(${(1 - entrance) * unit * .018}px)` }}>
      <div data-editorial-text="event" data-editorial-page={index} style={{ fontSize: type.title, fontWeight: 500, lineHeight: 1.16, letterSpacing: "-.035em", overflowWrap: "anywhere" }}>{active.text}</div>
    </div>
    <div aria-hidden="true" style={{ position: "absolute", left: "8%", top: "73%", width: textWidth, display: "flex", gap: unit * .018 }}>
      {events.map((_, step) => <div key={step} data-step-connector="true" style={{ flex: 1, height: Math.max(2, unit * .004), background: step <= active.step ? "#fff" : "#555" }} />)}
    </div>
  </EditorialSurface>;
}
