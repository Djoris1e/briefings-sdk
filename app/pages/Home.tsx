import { examples, exampleSourceNote } from "../example-prompts";
import { useState } from "react";
import { PromptOutput } from "../../src/briefing/PromptOutput";
import "../home.css";

export function Home() {
  const [dark, setDark] = useState(true);
  const [width, setWidth] = useState<"wide" | "side">("wide");
  return <main id="content" className={`embed-preview${dark ? " preview-dark" : ""}`} tabIndex={-1}>
    <header className="preview-toolbar"><span><strong>Component preview</strong><span className="preview-badge">Local</span></span>
      <div role="group" aria-label="Preview size"><button aria-pressed={dark} onClick={() => setDark(value => !value)}>{dark ? "Light host" : "Dark host"}</button><button aria-pressed={width === "wide"} onClick={() => setWidth("wide")}>Inline</button><button aria-pressed={width === "side"} onClick={() => setWidth("side")}>Side panel</button><a href="/embed">Open embed ↗</a></div>
    </header>
    <div className={`preview-stage preview-${width}`}><PromptOutput publisher="Microsoft updates" exampleNote={exampleSourceNote} examples={examples} theme={{ scheme: dark ? "dark" : "light", density: width === "side" ? "compact" : "comfortable" }} /></div>
    <p className="preview-footnote">Component preview · Microsoft product integration is a separate adapter.</p>
  </main>;
}
