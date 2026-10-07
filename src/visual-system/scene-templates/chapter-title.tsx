import type { SceneTemplateProps } from "./types";
import { EditorialSurface } from "./editorial-background";
import { editorialType, editorialEntrance, editorialPage, paginateEditorialText } from "./editorial-typography";

/** A held editorial headline, not a title slide fading away before the voice. */
export function TitleSceneTemplate(props: SceneTemplateProps) {
  const { variables, width, height, progress, sceneDuration } = props;
  const unit = Math.min(width, height), type = editorialType(unit), portrait = height > width;
  const textWidth = width * (portrait ? .84 : .68);
  const pages = paginateEditorialText(String(variables.title ?? "A different perspective"), textWidth, height * .5, type.title, 1.12);
  const page = editorialPage(progress, pages.length);
  return <EditorialSurface {...props} template="title" treatment="left">
    <div data-title-treatment="editorial-hold" data-title-composition="anchored" style={{ position: "absolute", left: "8%", bottom: "24%", width: textWidth, opacity: editorialEntrance(progress, sceneDuration) }}>
      <div data-editorial-text="title" data-editorial-page={editorialPage(progress, pages.length)} style={{ fontSize: type.title, fontWeight: 550, lineHeight: 1.12, letterSpacing: "-.035em", overflowWrap: "anywhere", textWrap: "balance" }}>{pages[page]}</div>
    </div>
  </EditorialSurface>;
}
