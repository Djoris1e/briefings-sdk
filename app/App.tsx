import { lazy, Suspense } from "react";
import { examples, exampleSourceNote } from "./example-prompts";
import { Home } from "./pages/Home";
import { PromptOutput } from "../src/briefing/PromptOutput";

const TemplateGallery = lazy(() => import("./pages/TemplateGallery"));

export function App() {
  if (window.location.pathname === "/templates") return <Suspense fallback={<p>Loading template gallery…</p>}><TemplateGallery /></Suspense>;
  const format = new URLSearchParams(window.location.search).get("format");
  const defaultFormat = format === "text" || format === "podcast" ? format : "video";
  const embed = window.location.pathname === "/embed";
  return <><a className="skip-link" href="#content">Skip to content</a>{embed
    ? <main id="content" className="embed-only" tabIndex={-1}><PromptOutput publisher="Microsoft updates" exampleNote={exampleSourceNote} examples={examples} defaultFormat={defaultFormat} /></main>
    : <Home />}</>;
}
