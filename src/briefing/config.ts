/** Server-owned provider settings. Never accept this object from a browser request. */
export interface BriefingProviderConfig {
  planner: { provider: "anthropic"; model: string; briefingTokens: number; briefingTimeoutMs: number; videoTokens: number };
  speech: { provider: "xai"; narrator: string; host: string; analyst: string; language: string };
  video: { provider: "fal"; model: "minimax/h3-max-turbo/text-to-video";
    screenshotModel: "minimax/h3-max-turbo/image-to-video"; animateScreenshots: boolean; resolution: "768P"; timeoutMs: number };
  stock: { provider: "pexels" };
}
export type BriefingProviderOptions = { [K in keyof BriefingProviderConfig]?: Partial<BriefingProviderConfig[K]> };
export const DEFAULT_PROVIDER_CONFIG: BriefingProviderConfig = {
  planner: { provider: "anthropic", model: "claude-haiku-4-5", briefingTokens: 6144, briefingTimeoutMs: 90_000, videoTokens: 4096 },
  speech: { provider: "xai", narrator: "eve", host: "eve", analyst: "leo", language: "auto" },
  video: { provider: "fal", model: "minimax/h3-max-turbo/text-to-video", screenshotModel: "minimax/h3-max-turbo/image-to-video", animateScreenshots: false, resolution: "768P", timeoutMs: 45_000 },
  stock: { provider: "pexels" },
};
export function defineBriefingConfig(options: BriefingProviderOptions = {}): BriefingProviderConfig {
  const config = {
    planner: { ...DEFAULT_PROVIDER_CONFIG.planner, ...options.planner },
    speech: { ...DEFAULT_PROVIDER_CONFIG.speech, ...options.speech },
    video: { ...DEFAULT_PROVIDER_CONFIG.video, ...options.video },
    stock: { ...DEFAULT_PROVIDER_CONFIG.stock, ...options.stock },
  };
  if (config.planner.provider !== "anthropic" || config.speech.provider !== "xai" || config.video.provider !== "fal" || config.stock.provider !== "pexels") throw new Error("Unsupported provider: supply a custom SDK provider adapter instead.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(config.planner.model)) throw new Error("Invalid planner model.");
  for (const key of ["briefingTokens", "videoTokens"] as const) {
    if (!Number.isInteger(config.planner[key]) || config.planner[key] < 512 || config.planner[key] > 8192) throw new Error("Planner tokens must be between 512 and 8192.");
  }
  if (!Number.isInteger(config.planner.briefingTimeoutMs) || config.planner.briefingTimeoutMs < 1000 || config.planner.briefingTimeoutMs > 120_000) throw new Error("Briefing timeout must be between 1000 and 120000 milliseconds.");
  for (const key of ["narrator", "host", "analyst"] as const) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(config.speech[key])) throw new Error("Invalid configured voice ID.");
  }
  if (config.speech.host.toLowerCase() === config.speech.analyst.toLowerCase()) throw new Error("Podcast speakers must use different voices.");
  if (!/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{2,8})*$/.test(config.speech.language)) throw new Error("Invalid speech language.");
  if (config.video.model !== DEFAULT_PROVIDER_CONFIG.video.model || config.video.screenshotModel !== DEFAULT_PROVIDER_CONFIG.video.screenshotModel || config.video.resolution !== "768P") throw new Error("Unsupported fal schema: supply a custom SDK video adapter instead.");
  if (!Number.isInteger(config.video.timeoutMs) || config.video.timeoutMs < 1000 || config.video.timeoutMs > 60_000) throw new Error("Video timeout must be between 1000 and 60000 milliseconds.");
  if (typeof config.video.animateScreenshots !== "boolean") throw new Error("animateScreenshots must be a boolean.");
  return config;
}
