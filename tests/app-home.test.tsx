// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Home } from "../app/pages/Home";

vi.mock("../src/briefing/PromptOutput", () => ({
  PromptOutput: ({ publisher, theme }: { publisher: string; theme: { scheme: string } }) =>
    <div data-testid="prompt-output" data-publisher={publisher} data-scheme={theme.scheme} />,
}));
afterEach(() => cleanup());

it("previews the SDK component with the Microsoft publisher label and no network setup call", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<Home />);
  const output = screen.getByTestId("prompt-output");
  expect(output.getAttribute("data-publisher")).toBe("Microsoft updates");
  expect(["dark", "light"]).toContain(output.getAttribute("data-scheme"));
  expect(screen.getByText("Component preview")).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
