// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextMediaScene, ScreenshotSpotlightScene, ActionStepsScene, PersonalRelevanceScene } from "../src/visual-system/scene-templates/briefing-scenes";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const base = { width: 1280, height: 720, progress: .2, sceneDuration: 5, isPlaying: true };
describe("useful briefing rendering", () => {
  it("uses one managed decoder, pauses with its host and resets on replay without losing text", () => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const variables = { title: "Review first", body: "Keep the qualification and human approval.", mediaUrl: "https://media.example/clip.mp4", mediaType: "video" };
    const view = render(createElement(TextMediaScene, { ...base, variables }));
    const video = view.container.querySelector("video")!;
    expect(view.container.querySelectorAll("video")).toHaveLength(1);
    expect(video.loop).toBe(false);
    expect(play).toHaveBeenCalledOnce();
    view.rerender(createElement(TextMediaScene, { ...base, variables, progress: .8 }));
    expect(play).toHaveBeenCalledOnce();
    expect(view.container.textContent).toContain(variables.body);
    view.rerender(createElement(TextMediaScene, { ...base, variables, progress: .8, isPlaying: false }));
    expect(pause).toHaveBeenCalledOnce();
    video.currentTime = 5;
    view.rerender(createElement(TextMediaScene, { ...base, variables, progress: 0 }));
    expect(video.currentTime).toBe(0);
  });
  it("keeps original screenshot pixels beneath an explicitly labeled illustrative animation", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const variables = { screenshotId: "ui", title: "The actual interface", caption: "Review the source.", sourceImageUrl: "https://images.example/ui.png", screenshotAlt: "Approved interface", mediaUrl: "https://media.example/animation.mp4", mediaType: "video", highlight: { x: .1, y: .2, width: .3, height: .2 } };
    const view = render(createElement(ScreenshotSpotlightScene, { ...base, variables }));
    expect(view.getByAltText("Approved interface").getAttribute("src")).toBe(variables.sourceImageUrl);
    expect(view.container.textContent).toContain("Illustrative AI animation");
    const highlight = view.container.querySelector<HTMLElement>("[data-screenshot-highlight]")!;
    expect(highlight.style.left).toBe("10%");
    expect(highlight.style.width).toBe("30%");
    fireEvent.error(view.container.querySelector("video")!);
    expect(view.getByAltText("Approved interface")).toBeTruthy();
    expect(view.container.textContent).not.toContain("Review the source.");
    expect(view.container.querySelector('[data-copy-field="caption"]')).toBeNull();
  });
  it.each([{ width: 390, height: 844 }, { width: 1280, height: 720 }])("renders relevance and ordered actions at $width pixels", dimensions => {
    const relevance = render(createElement(PersonalRelevanceScene, { ...base, ...dimensions, variables: { person: "Maya", goal: "Review renewal commitments", why: "Keep a human owner responsible for the result." } }));
    expect(relevance.container.textContent).toContain("For Maya");
    expect(relevance.container.innerHTML).not.toMatch(/NaN|Infinity/);
    const actions = render(createElement(ActionStepsScene, { ...base, ...dimensions, variables: { title: "Next steps", steps: [{ label: "Choose", detail: "Select a synthetic account." }, { label: "Verify", detail: "Check every statement." }] } }));
    expect([...actions.container.querySelectorAll("[data-action-step]")].map(node => node.textContent)).toEqual(["ChooseSelect a synthetic account."]);
    actions.rerender(createElement(ActionStepsScene, { ...base, ...dimensions, progress: .8, variables: { title: "Next steps", steps: [{ label: "Choose", detail: "Select a synthetic account." }, { label: "Verify", detail: "Check every statement." }] } }));
    expect([...actions.container.querySelectorAll("[data-action-step]")].map(node => node.textContent)).toEqual(["VerifyCheck every statement."]);
    expect(actions.container.querySelector("[aria-current=step]")).toBeTruthy();
    expect(actions.container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
  it("keeps every authored character across deterministic pages without shrinking mobile body text", () => {
    const variables = { person: "A fictional leader with a carefully bounded mission", goal: "Review renewal commitments without losing any qualifications or the owner's responsibility for review.", why: "Keep the original caveats visible. ".repeat(5) };
    const view = render(createElement(PersonalRelevanceScene, { ...base, width: 390, height: 844, variables }));
    const fields = new Map<string, Map<number, string>>();
    for (let step = 0; step <= 100; step++) {
      view.rerender(createElement(PersonalRelevanceScene, { ...base, width: 390, height: 844, progress: step / 100, variables }));
      for (const node of view.container.querySelectorAll<HTMLElement>("[data-copy-field]")) {
        const field = node.dataset.copyField!;
        if (!fields.has(field)) fields.set(field, new Map());
        fields.get(field)!.set(Number(node.dataset.copyPage), node.textContent!);
        if (field === "why") expect(parseFloat(node.style.fontSize)).toBeGreaterThanOrEqual(17.9);
      }
    }
    const full = (field: string) => [...fields.get(field)!].sort(([a], [b]) => a - b).map(([, text]) => text).join("");
    expect(full("person")).toBe(`For ${variables.person}`);
    expect(full("goal")).toBe(variables.goal);
    expect(full("why")).toBe(variables.why);
  });
  it("seeks among one active action at a time and restores the same frame", () => {
    const variables = { title: "The next steps", steps: ["Choose", "Compare", "Decide"].map(label => ({ label, detail: `${label} a bounded next step with a human owner.` })) };
    const view = render(createElement(ActionStepsScene, { ...base, progress: .5, variables }));
    const middle = view.container.querySelector("[data-action-step]")!.innerHTML;
    expect(view.container.querySelectorAll("[data-action-step]")).toHaveLength(1);
    expect(view.container.querySelector("[data-action-step]")!.getAttribute("data-action-step")).toBe("2");
    view.rerender(createElement(ActionStepsScene, { ...base, progress: 1, variables }));
    expect(view.container.querySelector("[data-action-step]")!.getAttribute("data-action-step")).toBe("3");
    view.rerender(createElement(ActionStepsScene, { ...base, progress: .5, variables }));
    expect(view.container.querySelector("[data-action-step]")!.innerHTML).toBe(middle);
    expect(view.container.querySelectorAll("[aria-current=step]")).toHaveLength(1);
  });
  it("zooms only an authored source region and restores the original overview on seek", () => {
    const variables = { title: "Original view", caption: "Inspect the supplied detail.", sourceImageUrl: "https://images.example/source.png", highlight: { x: .1, y: .2, width: .3, height: .2 } };
    const view = render(createElement(ScreenshotSpotlightScene, { ...base, progress: 0, variables }));
    const image = () => view.container.querySelector<HTMLElement>("[data-screenshot-original]")!;
    const overview = image().style.transform;
    expect(overview).toContain("scale(1)");
    expect(parseFloat(view.container.querySelector<HTMLElement>("[data-source-viewport]")!.style.width)).toBeCloseTo(base.width * .88);
    expect(parseFloat(view.container.querySelector<HTMLElement>("[data-source-viewport]")!.style.height)).toBeCloseTo(base.height * .55);
    view.rerender(createElement(ScreenshotSpotlightScene, { ...base, progress: .9, variables }));
    expect(image().style.transform).not.toContain("scale(1)");
    expect(view.container.querySelector("img")!.getAttribute("src")).toBe(variables.sourceImageUrl);
    view.rerender(createElement(ScreenshotSpotlightScene, { ...base, progress: 0, variables }));
    expect(image().style.transform).toBe(overview);
    view.rerender(createElement(ScreenshotSpotlightScene, { ...base, progress: .9, variables: { ...variables, highlight: undefined } }));
    expect(image().style.transform).toBe(overview);
    expect(view.container.querySelector("[data-screenshot-highlight]")).toBeNull();
    expect(view.container.querySelector("[data-source-label]")).toBeNull();
  });
});
