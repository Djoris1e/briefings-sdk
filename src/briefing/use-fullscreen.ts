import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createFullscreenController, type FullscreenController } from "../player/fullscreen";

/** Fullscreen the composed scene, captions and controls together, never a stock clip alone. */
export function useFullscreen(root: RefObject<HTMLElement | null>, enabled: boolean) {
  const controller = useRef<FullscreenController | undefined>(undefined);
  const modeRef = useRef<"none" | "native" | "fallback">("none");
  const [mode, setMode] = useState(modeRef.current);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const instance = createFullscreenController(element, next => {
      modeRef.current = next;
      setMode(next);
      element.querySelector<HTMLButtonElement>(".po-fullscreen")?.focus({ preventScroll: true });
    });
    controller.current = instance;
    return () => { instance.dispose(); controller.current = undefined; };
  }, [root]);
  useEffect(() => {
    if (!enabled && modeRef.current !== "none") void controller.current?.toggle();
  }, [enabled]);
  useEffect(() => {
    if (mode !== "fallback") return;
    const element = root.current;
    if (!element) return;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = [...element.querySelectorAll<HTMLElement>("button:not(:disabled),textarea,a[href],[tabindex='0']")].filter(node => node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    element.addEventListener("keydown", trapFocus);
    return () => element.removeEventListener("keydown", trapFocus);
  }, [mode, root]);
  const toggle = useCallback(() => { void controller.current?.toggle(); }, []);
  return { mode, active: mode !== "none", toggle };
}
