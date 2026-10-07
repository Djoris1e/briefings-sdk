import { EditorialSurface } from "./editorial-background";
import type { SceneTemplateProps } from "./types";
import { editorialType, editorialEntrance, editorialPage, paginateEditorialText } from "./editorial-typography";

/** One exact voice: long quotations continue at the same readable scale. */
export function QuoteSceneTemplate(props: SceneTemplateProps) {
  const { variables, width, height, progress, sceneDuration } = props;
  const unit = Math.min(width, height), type = editorialType(unit), portrait = height > width;
  const textWidth = width * (portrait ? .84 : .64), size = unit * .075;
  const pages = paginateEditorialText(`“${String(variables.quote ?? "") }”`, textWidth, height * .41, size, 1.24);
  const attribution = String(variables.attribution ?? "");
  return <EditorialSurface {...props} template="quote" treatment="left">
    <div style={{ position: "absolute", left: "8%", top: "18%", width: textWidth, opacity: editorialEntrance(progress, sceneDuration) }}>
      <div data-editorial-text="quote" data-editorial-page={editorialPage(progress, pages.length)} style={{ fontSize: size, fontWeight: 500, lineHeight: 1.24, letterSpacing: "-.025em", overflowWrap: "anywhere" }}>{pages[editorialPage(progress, pages.length)]}</div>
    </div>
    <div data-editorial-text="attribution" style={{ position: "absolute", left: "8%", top: "65%", width: textWidth, fontSize: type.label, lineHeight: 1.3, color: "#e4e4e4", overflowWrap: "anywhere" }}>{attribution}</div>
  </EditorialSurface>;
}
