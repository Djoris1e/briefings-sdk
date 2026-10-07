import type { ReactNode } from "react";
import type { SceneTemplateProps } from "./types";
import { editorialFont, editorialType } from "./editorial-typography";
import { SceneBackground, getMediaBackgroundProps } from "./scene-background";

export type EditorialTreatment = "bottom" | "left" | "center" | "none";
const treatments: Record<EditorialTreatment, string> = {
  bottom: "linear-gradient(180deg, transparent 15%, rgb(0 0 0 / 15%) 35%, rgb(0 0 0 / 88%) 78%, rgb(0 0 0 / 65%) 100%)",
  left: "linear-gradient(90deg, rgb(0 0 0 / 88%) 0%, rgb(0 0 0 / 76%) 38%, rgb(0 0 0 / 36%) 70%, transparent 100%)",
  center: "radial-gradient(ellipse at 50% 43%, rgb(0 0 0 / 88%) 0%, rgb(0 0 0 / 70%) 35%, transparent 80%)",
  none: "none",
};

/** The treatment follows the text anchor; footage has no global wash or shadow. */
export function EditorialSurface({ children, template, treatment = "bottom", ...props }: SceneTemplateProps & { children: ReactNode; template: string; treatment?: EditorialTreatment }) {
  const hasMedia = Boolean(props.variables.mediaUrl);
  return <div data-template={template} data-editorial-media={hasMedia ? "full-bleed" : undefined} data-editorial-treatment={treatment} style={{ position: "absolute", inset: 0, overflow: "hidden", color: "#fff", fontFamily: editorialFont }}>
    <SceneBackground progress={props.progress} sceneDuration={props.sceneDuration} isPlaying={props.isPlaying} {...getMediaBackgroundProps(props.variables)} />
    {hasMedia && treatment !== "none" && <div data-editorial-scrim="true" aria-hidden="true" style={{ position: "absolute", inset: 0, background: treatments[treatment], pointerEvents: "none" }} />}
    {children}
    {hasMedia && props.variables.mediaKind === "source" && <div data-source-label="true" style={{ position: "absolute", right: "5%", top: "4%", fontSize: editorialType(Math.min(props.width, props.height)).label, color: "#fff", background: "#000", padding: ".2em .45em" }}>Source screenshot</div>}
  </div>;
}
