import { MAX_PROMPT_CHARACTERS } from "../protocol/prompt-limits.js";

export interface BriefingSource { id: string; text: string }
/** Fixed IDs keep the provider grammar stable across requests and source lengths. */
export const BRIEFING_SOURCE_IDS = Array.from({ length: 41 }, (_, index) => `source${index + 1}`);
const FACT_IDS = Array.from({ length: 6 }, (_, index) => `f${index + 1}`);

/** Preserve whole paragraphs/sentences where possible and every original code unit. */
export function splitBriefingSources(prompt: string): BriefingSource[] {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_CHARACTERS) {
    throw new RangeError("Briefing source is outside the prompt bounds.");
  }
  const sources: BriefingSource[] = [];
  let offset = 0;
  while (offset < prompt.length) {
    let maximum = Math.min(offset + 600, prompt.length);
    const last = prompt.charCodeAt(maximum - 1), next = prompt.charCodeAt(maximum);
    if (maximum < prompt.length && last >= 0xD800 && last <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) maximum--;
    // Reserve enough capacity for all remaining input, even for many tiny
    // paragraphs. 599 leaves room to avoid splitting any surrogate pair.
    const slotsAfter = BRIEFING_SOURCE_IDS.length - sources.length - 1;
    const minimum = Math.max(offset + 1, prompt.length - slotsAfter * 599);
    const window = prompt.slice(offset, maximum);
    const boundary = (match: RegExpMatchArray) => offset + match.index! + match[0].length;
    const paragraphs = [...window.matchAll(/\r?\n[ \t]*\r?\n(?:[ \t]*\r?\n)*/gu)].map(boundary);
    // A short paragraph is its own source, so named products and their caveats
    // remain distinct instead of sharing an arbitrary fixed-width evidence span.
    let end = paragraphs.find(end => end >= minimum);
    if (end === undefined && maximum < prompt.length) {
      const sentences = [...window.matchAll(/[.!?。！？]["'”’\])]*\s+/gu)].map(boundary);
      end = sentences.filter(end => end >= minimum).at(-1);
      if (end === undefined) end = [...window.matchAll(/\s+/gu)].map(boundary).filter(end => end >= minimum).at(-1);
    }
    end ??= maximum;
    sources.push({ id: BRIEFING_SOURCE_IDS[sources.length]!, text: prompt.slice(offset, end) });
    offset = end;
  }
  return sources;
}
const object = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const string = (description: string) => ({ type: "string", description });
const factIds = { type: "array", items: { type: "string", enum: FACT_IDS }, description: "Only IDs of facts included in this response. No duplicates. At least one when facts exist." };

/** Provider-compatible grammar; semantic, size and source checks remain local. */
export function createBriefingOutputSchema(): Record<string, unknown> {
  return object({
    summary: string("Plain-text overview, preferably 60–90 words; at most 1800 characters."),
    article: object({
      title: string("One clear editorial title, at most 120 characters. Plain text; no invented byline or date."),
      dek: string("A short introduction explaining why the supplied facts matter, at most 320 characters. Plain text."),
      sections: { type: "array", description: "3–5 purposeful sections. Target 400–650 article words only when sources support depth; use shorter sections for sparse input, never filler. All article text together at most 8000 characters.", items: object({
        heading: string("Specific plain-text section heading, at most 120 characters."),
        paragraphs: { type: "array", description: "1–5 plain-text paragraphs, each at most 1800 characters. Develop supplied goals, tradeoffs and suggested next steps using only canonical facts; preserve attribution and qualifications. No HTML, Markdown, fabricated quotations, byline or date.", items: string("One complete plain-text paragraph.") },
      }) },
    }),
    facts: { type: "array", description: "3–5 essential facts, at most 6. Empty only when supplied material has no usable facts.", items: object({
      id: { type: "string", enum: FACT_IDS, description: "Unique sequential fact ID: f1, f2, etc." },
      text: string("One product-specific supported fact: explicitly name the product, its capability and all applicable release/eligibility qualifications. Never transfer attributes from a neighboring product. At most 400 characters."),
      sourceId: { type: "string", enum: BRIEFING_SOURCE_IDS, description: "An actual supplied source ID supporting this fact. Adjacent source chunks remain context. Do not copy source text." },
    }) },
    priorities: { type: "array", description: "1–2 priorities, at most 3. Empty when facts are empty.", items: object({
      factIds, relevance: string("Why these facts matter for the supplied audience. One concise sentence, roughly 10–18 words; aim at most 180 characters, hard limit 350."),
      action: string("A suggested practical next step, not a claimed observed outcome. One concise sentence, roughly 10–18 words; aim at most 180 characters, hard limit 350."),
    }) },
    // Fixed slots enforce the exchange count without unsupported array limits.
    podcast: object({ exchanges: object({
      opening: exchangeSchema(),
      detail: { anyOf: [exchangeSchema(), { type: "null" }], description: "Second exchange, or null when one exchange fully answers the request." },
      closing: { anyOf: [exchangeSchema(), { type: "null" }], description: "Third exchange, or null for a shorter conversation. Use null if detail is null." },
    }) }),
  });
}
function exchangeSchema() {
  return object({
    host: string("Host's spoken question or framing; no speaker label or stage directions; at most 700 characters."),
    analyst: string("Analyst's answer using only the exchange's cited facts for factual claims. Name each product explicitly with its own release/eligibility qualifications; recommended actions must be presented as suggestions. No speaker label or stage directions; at most 700 characters."),
    factIds,
  });
}
