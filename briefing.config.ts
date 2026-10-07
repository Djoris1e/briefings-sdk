import { defineBriefingConfig } from "./src/briefing/config";

/** Edit models/voices here; put credentials only in .dev.vars or server secrets. */
export default defineBriefingConfig({
  planner: { model: "claude-sonnet-4-6", briefingTimeoutMs: 90_000 },
  speech: { narrator: "eve", host: "eve", analyst: "leo", language: "auto" },
  video: {
    model: "minimax/h3-max-turbo/text-to-video",
    screenshotModel: "minimax/h3-max-turbo/image-to-video",
    // Each screenshot must also carry animate:true. Static is faithful and fast.
    animateScreenshots: false,
    timeoutMs: 45_000, // Capped further by when this scene is due for playback.
  },
});
