import type { VideoChatMode } from "./types";

export interface VisualMode {
  id: VideoChatMode;
  label: string;
  note: string;
}
export const visualModes: VisualMode[] = [
  { id: "cinematic", label: "AI video", note: "Animated layouts with optional AI footage" },
  { id: "pexels", label: "Pexels", note: "Animated layouts with stock footage" },
];
