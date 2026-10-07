/** Shared typography for quiet editorial scenes. */
export const editorialFont = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Roboto, Arial, sans-serif';
export const fade = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** Physical display sizes: at 390px wide these become 39/18/15px. */
export const editorialType = (unit: number) => ({ title: unit * .1, body: unit * .046, label: unit * .038, figure: unit * .24 });

/** A readable hold is independent of the length of the narration. */
export function editorialEntrance(progress: number, sceneDuration = 6, delaySec = 0): number {
  return fade((progress * Math.max(.1, sceneDuration) - delaySec) / .4);
}

export function editorialPage(progress: number, count: number): number {
  return Math.min(Math.max(0, count - 1), Math.floor(Math.max(0, Math.min(1, progress)) * count));
}

/** Estimate conservatively at the chosen type size, never shrink the type.
 * Whitespace stays in the strings so joining all pages reproduces the source. */
export function paginateEditorialText(text: string, width: number, height: number, font: number, lineHeight: number): string[] {
  if (!text) return [text];
  const maxLines = Math.max(1, Math.floor(height / (font * lineHeight)));
  const glyph = (character: string) => font * (/\s/u.test(character) ? .34 : /[MW@#%mw]/u.test(character) ? 1.05 : /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u.test(character) ? 1.15 : .75);
  const fits = (candidate: string) => {
    let lines = 1, used = 0;
    for (const word of candidate.match(/\s+|\S+/gu) ?? []) {
      if (/^\s/u.test(word)) { if (used) used += font * .34; continue; }
      const letters = [...word], length = letters.reduce((sum, letter) => sum + glyph(letter), 0);
      if (used && used + length > width) { lines++; used = 0; }
      for (const letter of letters) {
        const size = glyph(letter);
        if (used && used + size > width) { lines++; used = 0; }
        used += size;
      }
      if (lines > maxLines) return false;
    }
    return true;
  };
  const remaining = [...text], pages: string[] = [];
  let offset = 0;
  while (offset < remaining.length) {
    let low = 1, high = remaining.length - offset;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (fits(remaining.slice(offset, offset + mid).join(""))) low = mid;
      else high = mid - 1;
    }
    let count = low;
    if (offset + count < remaining.length && !/\s/u.test(remaining[offset + count])) {
      for (let index = count - 1; index >= count * .5; index--) {
        if (/\s/u.test(remaining[offset + index])) { count = index + 1; break; }
      }
    }
    pages.push(remaining.slice(offset, offset + count).join(""));
    offset += count;
  }
  return pages;
}
