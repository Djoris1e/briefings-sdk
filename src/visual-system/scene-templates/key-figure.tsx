import { EditorialSurface } from "./editorial-background";
import type { SceneTemplateProps } from "./types";
import { editorialType, editorialEntrance, editorialPage, paginateEditorialText } from "./editorial-typography";

/** Show the actual supplied value immediately, without an invented count-up. */
export function KeyFigureSceneTemplate(props: SceneTemplateProps) {
  const { variables, width, height, progress, sceneDuration } = props;
  const unit = Math.min(width, height), type = editorialType(unit), portrait = height > width;
  const value = String(variables.value ?? ""), label = String(variables.label ?? "");
  const textWidth = width * (portrait ? .84 : .66);
  const figureSize = [...value].length <= 8 ? type.figure : [...value].length <= 14 ? unit * .16 : type.title;
  const labels = paginateEditorialText(label, textWidth, height * .22, type.body, 1.35);
  return <EditorialSurface {...props} template="keyFigure" treatment="left">
    <div style={{ position: "absolute", left: "8%", top: "19%", width: textWidth, opacity: editorialEntrance(progress, sceneDuration) }}>
      <div data-editorial-text="value" style={{ fontSize: figureSize, fontWeight: 500, lineHeight: 1.03, letterSpacing: "-.05em", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere", textWrap: "balance" }}>{value}</div>
      <div data-editorial-text="label" data-editorial-page={editorialPage(progress, labels.length)} style={{ marginTop: unit * .06, fontSize: type.body, lineHeight: 1.35, color: "#f0f0f0", overflowWrap: "anywhere" }}>{labels[editorialPage(progress, labels.length)]}</div>
    </div>
  </EditorialSurface>;
}
