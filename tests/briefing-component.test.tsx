// @vitest-environment jsdom
import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PromptOutput, type PromptOutputHandle } from "../src/briefing/PromptOutput";
import type { PreparedBriefing, ScreenshotAsset } from "../src/briefing/types";

const mocks = vi.hoisted(() => ({
  ask: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), reset: vi.fn(),
  prepare: vi.fn().mockResolvedValue({ seconds: 1 }), speak: vi.fn().mockResolvedValue(undefined),
  playerProps: null as null | { onFramePresented?: () => void },
  setAudioPreferences: vi.fn(), warnings: [] as string[],
}));
vi.mock("../src/video-chat/use-video-chat", () => ({ useVideoChatSession: () => ({
  chat: { setAudioPreferences: mocks.setAudioPreferences, ask: mocks.ask, pause: mocks.pause, resume: mocks.resume, cancel: mocks.cancel, reset: mocks.reset,
    warnings: mocks.warnings, playerKey: "player", status: "idle", playerProps: mocks.playerProps, muted: false, setMuted: vi.fn(), replay: vi.fn() },
  getCaptionProgress: () => 0,
}) }));
vi.mock("../src/video-chat/voice", () => ({ createVideoChatVoice: () => ({
  prepare: mocks.prepare, speak: mocks.speak, pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(), setMuted: vi.fn(),
}) }));
vi.mock("../src/player/video-player", () => ({ VideoPlayer: ({ onFramePresented }: { onFramePresented: () => void }) => <button onClick={onFramePresented}>Present video frame</button> }));
vi.mock("../src/video-chat/opening-chapter", () => ({ OpeningChapter: () => <div>Opening chapter</div> }));
vi.mock("../src/video-chat/caption-words", () => ({ CaptionWords: () => null }));
function brief(prompt: string, screenshots: ScreenshotAsset[] = []): PreparedBriefing {
  return { version: 1, id: "brief", prompt, summary: "Pilot the new tool with two customer teams.",
    facts: [{ id: "launch", text: "The tool launched.", evidence: prompt }],
    priorities: [{ factIds: ["launch"], relevance: "Improve onboarding.", action: "Start a pilot." }],
    podcast: { turns: [
      { id: "host", speaker: "host", text: "What should our team try?", factIds: [] },
      { id: "analyst", speaker: "analyst", text: "Run a small onboarding pilot.", factIds: ["launch"] },
    ] }, screenshots };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); mocks.playerProps = null; mocks.warnings = []; });

it("streams video immediately from the supplied source while preparing text/podcast and reuses outputs across switches and followups", async () => {
  const source = "The tool launched. Maya wants faster onboarding.";
  const screenshots = [{ id: "launch-screen", url: "https://example.com/screen.png", alt: "Product workspace" }];
  const canonical = brief(source, screenshots);
  let release!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  const fetcher = vi.fn().mockImplementationOnce(() => pending).mockImplementation((_url, options) => {
    const request = JSON.parse(options.body);
    return Promise.resolve(Response.json(brief(request.prompt, request.screenshots)));
  });
  vi.stubGlobal("fetch", fetcher);
  const ref = createRef<PromptOutputHandle>();
  render(<PromptOutput ref={ref} publisher="Microsoft updates" endpoint="/host/brief?tenant=demo" screenshots={screenshots} />);
  let generation!: Promise<void>;
  act(() => { generation = ref.current!.generate(source, "video"); });
  expect(screen.getByText("Opening chapter")).toBeTruthy();
  expect(mocks.ask).toHaveBeenCalledExactlyOnceWith(source, { screenshots });
  expect(fetcher.mock.calls[0][0]).toBe("/host/brief?tenant=demo&action=briefing");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ prompt: source, screenshots });
  await act(async () => { release(Response.json(canonical)); await generation; });
  expect(mocks.ask).toHaveBeenCalledExactlyOnceWith(source, { screenshots });
  expect(mocks.prepare).toHaveBeenCalledTimes(2);
  expect(mocks.speak).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("tab", { name: "Text" }));
  const textPanel = screen.getByRole("tabpanel", { name: "Text" });
  expect(within(textPanel).getByText(canonical.summary)).toBeTruthy();
  expect(within(textPanel).getByText("Microsoft updates")).toBeTruthy();
  expect(screen.queryByText("Briefings SDK")).toBeNull();
  expect(within(textPanel).queryByText(canonical.podcast.turns[0].text)).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Podcast" }));
  expect(screen.getByLabelText("Podcast speakers").textContent).toContain("Host");
  expect(screen.getByLabelText("Podcast speakers").textContent).toContain("Analyst");
  expect(screen.getByText("Read conversation")).toBeTruthy();
  expect(within(screen.getByRole("tabpanel", { name: "Podcast" })).getByText(/Microsoft updates/)).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Video" }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(mocks.ask).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("tab", { name: "Text" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Ask a follow-up" }), { target: { value: "Which team should start?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send follow-up" }));
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
  const next = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(next.prompt).toContain(source);
  expect(next.prompt).toContain(canonical.summary);
  expect(next.prompt).toContain("Which team should start?");
  expect(next.prompt).not.toContain(canonical.podcast.turns[0].text);
  expect(next.screenshots).toEqual(screenshots);
  expect(mocks.pause).toHaveBeenCalled();
});


it("keeps video playable and followups available when canonical preparation fails", async () => {
  mocks.playerProps = {};
  const fetcher = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  const ref = createRef<PromptOutputHandle>();
  render(<PromptOutput ref={ref} />);
  await act(() => ref.current!.generate("A supplied release and its limitations.", "video"));
  expect(mocks.ask).toHaveBeenCalledExactlyOnceWith("A supplied release and its limitations.", { screenshots: [] });
  fireEvent.click(screen.getByRole("button", { name: "Present video frame" }));
  expect(screen.queryByText("Opening chapter")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect((screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("tab", { name: "Podcast" }));
  expect(screen.getByRole("alert").textContent).toContain("Could not prepare the briefing");
  fireEvent.click(screen.getByRole("tab", { name: "Video" }));
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Ask a follow-up" }), { target: { value: "Explain those limitations." } });
  expect((screen.getByRole("button", { name: "Send follow-up" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Send follow-up" }));
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
  expect(mocks.ask.mock.calls[1][0]).toContain("A supplied release and its limitations.");
  expect(mocks.ask.mock.calls[1][0]).toContain("Explain those limitations.");
});


it("retries a failed video from the same source without rebuilding the brief or adding conversation", async () => {
  const source = "The release has a limited preview.";
  const screenshots = [{ id: "screen", url: "https://example.com/screen.png", alt: "Release preview" }];
  const fetcher = vi.fn().mockResolvedValue(Response.json(brief(source, screenshots)));
  vi.stubGlobal("fetch", fetcher);
  mocks.ask.mockRejectedValueOnce(new Error("Video transport failed"));
  const ref = createRef<PromptOutputHandle>();
  render(<PromptOutput ref={ref} />);
  await act(() => ref.current!.generate(source, "video", { screenshots }));
  expect(screen.getByRole("alert").textContent).toContain("The video could not finish");
  fireEvent.click(screen.getByRole("button", { name: "Retry video" }));
  await waitFor(() => expect(mocks.ask).toHaveBeenCalledTimes(2));
  expect(mocks.ask.mock.calls[1]).toEqual([source, { screenshots }]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).toBeNull();
});


it("opens an example immediately and passes its source images to both generation paths", async () => {
  const { examples } = await import("../app/example-prompts");
  const selected = examples[0];
  const fetcher = vi.fn().mockResolvedValue(Response.json(brief(selected.prompt, selected.screenshots)));
  vi.stubGlobal("fetch", fetcher);
  render(<PromptOutput examples={examples} />);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(selected.title) }));
  expect(screen.queryByRole("button", { name: /Create briefing/ })).toBeNull();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(mocks.ask).toHaveBeenCalledExactlyOnceWith(selected.prompt, { screenshots: selected.screenshots });
  expect(JSON.parse(fetcher.mock.calls[0][1].body).screenshots).toEqual(selected.screenshots);
  expect(mocks.setAudioPreferences).toHaveBeenCalledWith({ musicMood: "auto", musicVolume: .24 });
  expect(mocks.setAudioPreferences.mock.invocationCallOrder[0]).toBeLessThan(mocks.ask.mock.invocationCallOrder[0]);
  expect(screen.queryByText("Source images")).toBeNull();
  expect(screen.queryByText("Creating your video…")).toBeNull();
  for (const example of examples) {
    expect(example.screenshots.length).toBeGreaterThan(0);
    for (const asset of example.screenshots) {
      expect(["www.microsoft.com", "techcommunity.microsoft.com"]).toContain(new URL(asset.url).hostname);
      expect(asset.animate).toBe(false);
    }
  }
});


it("keeps internal provider recovery notices out of the customer view", async () => {
  mocks.warnings = ["Some parts were simplified so the response could continue.", "Some visuals were replaced so your response can continue.", "AI video credits are used up. Using Pexels footage instead."];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(brief("A supplied release."))));
  const ref = createRef<PromptOutputHandle>();
  render(<PromptOutput ref={ref} />);
  await act(() => ref.current!.generate("A supplied release.", "video"));
  expect(screen.queryByText(mocks.warnings[0])).toBeNull();
  expect(screen.queryByText(mocks.warnings[1])).toBeNull();
  expect(screen.queryByText(mocks.warnings[2])).toBeNull();
});

it("tells the user when generation was stopped and offers a retry that restarts the video", async () => {
  mocks.ask.mockReturnValueOnce(new Promise(() => {}));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(brief("A supplied release."))));
  const ref = createRef<PromptOutputHandle>();
  render(<PromptOutput ref={ref} />);
  act(() => { void ref.current!.generate("A supplied release.", "video"); });
  fireEvent.click(screen.getByRole("button", { name: "Stop generation" }));
  expect(screen.getByRole("status").textContent).toContain("Generation stopped.");
  expect(mocks.cancel).toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Retry video" }));
  expect(mocks.ask).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("status")).toBeNull();
});

 it("retries failed text and podcast preparation without restarting the video", async () => {
  const source = "The tool launched.";
  const screenshots = [{ id: "source", url: "https://example.com/source.png", alt: "Source interface" }];
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
    .mockResolvedValueOnce(Response.json(brief(source, screenshots)));
  vi.stubGlobal("fetch", fetcher);
  const ref = createRef<PromptOutputHandle>();
  render(<PromptOutput ref={ref} screenshots={screenshots} />);
  await act(async () => { await ref.current!.generate(source, "text"); });
  expect(screen.getByRole("alert").textContent).toContain("Could not prepare");
  fireEvent.click(screen.getByRole("button", { name: "Retry text and podcast" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("article", { name: "Generated text" }).textContent).toContain(brief(source).summary);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ prompt: source, screenshots });
  expect(mocks.ask).toHaveBeenCalledTimes(1);
 });
