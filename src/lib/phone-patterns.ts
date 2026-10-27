/**
 * The one place that knows what an Algerian phone number looks like in text.
 * Both maskers (audit/storage in redact-pii.ts, remote-model path in
 * ai/redact.ts) call it, so they cannot drift apart. No imports: it must stay
 * usable from code that is not server-only.
 */

// Phone shapes people really type: 0555123456, 0555 12 34 56, 0555-12-34-56,
// 0555.12.34.56, 0555 123 456, (0555) 12 34 56, +213 555 12 34 56 (also with
// "(0)"), 00213555123456, and Arabic-Indic digits. One separator character is
// used all the way through a number, so "05-10-2026 14" (a date and an hour)
// is not read as a phone. A number glued to more digits (a 13-digit id) is not
// a phone either.
const DIGIT = "[0-9\\u0660-\\u0669\\u06F0-\\u06F9]";
const ZERO = "[0\\u0660\\u06F0]";
const SEP = "[\\p{Zs}\\t.-]";
const NOT_AFTER_WORD = "(?<![A-Za-z0-9_\\u0660-\\u0669\\u06F0-\\u06F9])";
const NOT_BEFORE_DIGIT = `(?!${DIGIT})`;
const INTL_REST = `${SEP}?(?:\\(${ZERO}\\)${SEP}?)?${DIGIT}(?:${SEP}?${DIGIT}{2}){4}`;
const PHONE_REGEX = new RegExp(
  `${NOT_AFTER_WORD}(?:` +
    `${ZERO}${DIGIT}${DIGIT}{8}` +
    `|\\(?${ZERO}${DIGIT}${SEP}?${DIGIT}{2}\\)?(?<twos>${SEP})${DIGIT}{2}\\k<twos>${DIGIT}{2}\\k<twos>${DIGIT}{2}` +
    `|\\(?${ZERO}${DIGIT}${DIGIT}{2}\\)?(?<threes>${SEP})${DIGIT}{3}\\k<threes>${DIGIT}{3}` +
    `)${NOT_BEFORE_DIGIT}`,
  "gu",
);
const INT_PHONE_REGEX = new RegExp(
  `(?:\\+|${NOT_AFTER_WORD}${ZERO}{2})[2\\u0662\\u06F2][1\\u0661\\u06F1][3\\u0663\\u06F3]${INTL_REST}`,
  "gu",
);

/**
 * Replace every phone number in `text` with `replacer(match)`. International
 * forms (+213, 00213) are replaced first, then local ones (05..., (05..)).
 */
export function replacePhoneNumbers(
  text: string,
  replacer: (match: string) => string,
): string {
  return text.replace(INT_PHONE_REGEX, replacer).replace(PHONE_REGEX, replacer);
}

/** Arabic-Indic and extended Arabic-Indic digits to 0-9; everything else stays. */
export function toAsciiDigits(text: string): string {
  return text.replace(/[\u0660-\u0669\u06F0-\u06F9]/gu, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}
