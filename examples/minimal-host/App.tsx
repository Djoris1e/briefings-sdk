/**
 * Minimal React host for the briefings component.
 *
 * The host owns the prompt (customer context plus release material) and any
 * screenshot assets; the component owns presentation and playback. Mount the
 * server handler from ./server.ts at the same `endpoint`.
 */
import { useRef, useState } from "react";
import { PromptOutput, type PromptOutputHandle } from "@djoris/briefings/react";
import type { ScreenshotAsset } from "@djoris/briefings";
import "@djoris/briefings/styles.css";

const screenshots: ScreenshotAsset[] = [{
  id: "release-settings",
  url: "https://cdn.example.com/briefings/settings.png",
  alt: "Settings page showing the new release toggle",
  sourceUrl: "https://example.com/release-notes",
}];

export function BriefingPanel() {
  const output = useRef<PromptOutputHandle>(null);
  const [source, setSource] = useState("");
  return (
    <section>
      <label>
        Customer context and release notes
        <textarea value={source} maxLength={12000} onChange={event => setSource(event.target.value)} />
      </label>
      {/* generate() must run inside a user gesture so browsers allow audible playback. */}
      <button disabled={!source.trim()} onClick={() => void output.current?.generate(source, "video", { screenshots })}>
        Create briefing
      </button>
      <button onClick={() => output.current?.cancel()}>Cancel</button>
      <PromptOutput
        ref={output}
        endpoint="/api/briefings"
        showComposer={false}
        publisher="Product updates"
        theme={{ scheme: "light", accent: "#0f6cbd" }}
      />
    </section>
  );
}
