/** Host-supplied public assets. Models select IDs; they never supply media URLs. */
export interface ScreenshotAsset {
  id: string;
  url: string;
  alt: string;
  sourceUrl?: string;
  animate?: boolean;
}
export interface BriefingFact { id: string; text: string; evidence: string }
export interface BriefingPriority { factIds: string[]; relevance: string; action: string }
export type BriefingSpeaker = "host" | "analyst";
export interface PodcastTurn { id: string; speaker: BriefingSpeaker; text: string; factIds: string[] }
/** Reading-only prose; canonical facts/summary remain the input to other formats. */
export interface BriefingArticle {
  title: string;
  dek: string;
  sections: { heading: string; paragraphs: string[] }[];
}
export interface PreparedBriefing {
  version: 1;
  id: string;
  prompt: string;
  summary: string;
  article?: BriefingArticle;
  facts: BriefingFact[];
  priorities: BriefingPriority[];
  podcast: { turns: PodcastTurn[] };
  screenshots: ScreenshotAsset[];
}
export interface BriefingRequest { prompt: string; screenshots?: ScreenshotAsset[] }
