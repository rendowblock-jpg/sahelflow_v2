// Seller and customer text can mix scripts in one line ("Nike حذاء رياضي").
// On a French or English page the whole line has no language of its own, so
// its Arabic words get the page's font choice and spacing. The words are
// tagged one run at a time, which also works when Latin comes first.

export interface TextRun {
  text: string;
  /** True for a run of Arabic words that should carry lang="ar". */
  arabic: boolean;
}

// Arabic letters, marks and the stretching stroke, plus the spaces, signs and
// digits between two Arabic words. Script_Extensions keeps the Arabic comma
// and the stretching stroke with the words around them.
const ARABIC_RUN = /\p{scx=Arabic}+(?:[\s\p{P}\p{N}]+\p{scx=Arabic}+)*/gu;
const LETTER = /\p{L}/u;
const ANY_ARABIC = /\p{scx=Arabic}/u;

/** Quick check so plain Latin text costs one test and nothing else. */
export function hasArabic(text: string): boolean {
  return ANY_ARABIC.test(text);
}

/**
 * Cut text into runs that join back to the exact same string. A stretch of
 * only digits or signs from the Arabic block (no letter) stays untagged:
 * there is no word in it to shape.
 */
export function splitArabicRuns(text: string): TextRun[] {
  if (!text) return [];
  const runs: TextRun[] = [];
  let cursor = 0;
  for (const match of text.matchAll(ARABIC_RUN)) {
    const found = match[0];
    if (!LETTER.test(found)) continue;
    const start = match.index ?? 0;
    if (start > cursor) runs.push({ text: text.slice(cursor, start), arabic: false });
    runs.push({ text: found, arabic: true });
    cursor = start + found.length;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), arabic: false });
  return runs;
}
