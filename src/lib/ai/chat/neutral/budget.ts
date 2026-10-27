/**
 * Token budget helper. This is an ESTIMATE, not a tokenizer: no tokenizer ships
 * with the app. Latin text is about 4 characters per token, Arabic script about
 * 2.2 (Arabic splits into more tokens). It is used to compare request sizes
 * against a provider's per-minute limit, never to bill or to cut a message.
 */

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const arabic = (text.match(ARABIC_SCRIPT) ?? []).length;
  const other = text.length - arabic;
  // arabic / 2.2 written as arabic * 5 / 11 so 220 characters are exactly 100.
  return Math.ceil(other / 4 + (arabic * 5) / 11);
}
