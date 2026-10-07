// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Video } from "../src/protocol/types";
import { VideoFrame } from "../src/player/video-frame";
import { getBuiltinSceneRenderer, preloadBuiltinTemplate } from "../src/visual-system/catalog/builtin-player";

afterEach(cleanup);

describe("built-in scene loading", () => {
  it("prepares the exact chapter renderer used by the player without a custom registry", async () => {
    await preloadBuiltinTemplate("chapterTitle");
    const config: Video = { schemaVersion: "0.2", orientation: "landscape", style: {}, scenes: [
      { id: "chapter", templateId: "chapterTitle", variables: { title: "A new perspective" }, timing: { fixedDuration: 5 } },
    ] };
    const view = render(createElement(VideoFrame, { config, time: 1.5, width: 960, height: 540 }));
    expect(view.container.querySelector('[data-template-loading]')).toBeNull();
    expect(view.container.querySelector('[data-title-composition]')?.textContent).toBe("A new perspective");
  });

  it("preloads every restored editorial renderer and keeps unsupported layouts unavailable", async () => {
    for (const id of ["comparison", "editorialTimeline", "keyFigure", "quote"]) {
      expect(getBuiltinSceneRenderer(id)).toBeDefined();
      await expect(preloadBuiltinTemplate(id)).resolves.toBeUndefined();
    }
    expect(getBuiltinSceneRenderer("mobileMessage")).toBeUndefined();
    expect(preloadBuiltinTemplate("mobileMessage")).toBeUndefined();
  });
});
