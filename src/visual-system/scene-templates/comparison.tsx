import { EditorialSurface } from "./editorial-background";
import type { SceneTemplateProps } from "./types";
import { editorialType, editorialEntrance, editorialPage, paginateEditorialText } from "./editorial-typography";

/** One side gets the frame; the quiet index retains the comparison context. */
export function ComparisonSceneTemplate(props: SceneTemplateProps) {
  const { variables, width, height, progress, sceneDuration = 6 } = props;
  const unit = Math.min(width, height), type = editorialType(unit), portrait = height > width;
  const textWidth = width * (portrait ? .84 : .64), size = unit * .075;
  const entries = [{ label: String(variables.leftLabel ?? ""), text: String(variables.leftText ?? "") }, { label: String(variables.rightLabel ?? ""), text: String(variables.rightText ?? "") }];
  const sequence = entries.flatMap((entry, side) => paginateEditorialText(entry.text, textWidth, height * .4, size, 1.2).map(text => ({ ...entry, text, side })));
  const index = editorialPage(progress, sequence.length), active = sequence[index];
  const entrance = editorialEntrance(Math.min(1, Math.max(0, progress * sequence.length - index)), sceneDuration / sequence.length);
  return <EditorialSurface {...props} template="comparison" treatment="left">
    <div style={{ position: "absolute", left: "8%", top: "11%", display: "flex", alignItems: "center", gap: unit * .045, fontSize: type.label, fontVariantNumeric: "tabular-nums" }}>
      <span style={{ color: active.side === 0 ? "#fff" : "#aaa" }}>01</span><span aria-hidden="true" style={{ width: unit * .12, height: Math.max(1, unit * .003), background: "#666" }} /><span style={{ color: active.side === 1 ? "#fff" : "#aaa" }}>02</span>
    </div>
    <div data-comparison-side={active.side === 0 ? "left" : "right"} style={{ position: "absolute", left: "8%", top: "24%", width: textWidth, opacity: entrance, transform: `translateY(${(1 - entrance) * unit * .018}px)` }}>
      <div data-editorial-text="label" style={{ fontSize: type.label, lineHeight: 1.3, marginBottom: unit * .05, color: "#e4e4e4", overflowWrap: "anywhere" }}>{active.label}</div>
      <div data-editorial-text="body" data-editorial-page={index} style={{ fontSize: size, fontWeight: 500, lineHeight: 1.2, letterSpacing: "-.025em", overflowWrap: "anywhere" }}>{active.text}</div>
    </div>
  </EditorialSurface>;
}
