/**
 * Text preparation for the offline order extractor (FD-064).
 *
 * Two views of one message are used side by side:
 *  - `normalizeMessage` gives the working text: Latin digits for every digit
 *    family, no Arabic diacritics/tatweel, no emoji, one space between words.
 *    Product and customer names are sliced from this view so they keep the
 *    customer's own spelling and casing.
 *  - `fold` gives a comparison view of EXACTLY the same length: lowercase,
 *    accents removed, Arabic letter variants unified. Every pattern runs on
 *    the folded view and its offsets are valid in the working text, so a
 *    match found case- and accent-insensitively is cut out of the original.
 */

const ARABIC_INDIC_DIGITS = /[٠-٩]/g;
const PERSIAN_DIGITS = /[۰-۹]/g;
/** Harakat, superscript alef and tatweel carry no meaning for extraction. */
const ARABIC_MARKS = /[ً-ٰٟـ]/g;
const BIDI_CONTROLS = /[​-‏‪-‮⁦-⁩﻿]/g;
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{FE0F}\u{1F3FB}-\u{1F3FF}]/gu;

export function normalizeMessage(body: string): string {
  return body
    .normalize("NFC")
    .replace(ARABIC_INDIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(ARABIC_MARKS, "")
    .replace(BIDI_CONTROLS, "")
    .replace(PICTOGRAPHS, " ")
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[  ]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n")
    .trim();
}

const ARABIC_FOLDS: Record<string, string> = {
  "أ": "ا",
  "إ": "ا",
  "آ": "ا",
  "ٱ": "ا",
  "ى": "ي",
  "ی": "ي",
  "ئ": "ي",
  "ة": "ه",
  "ؤ": "و",
  "ک": "ك",
};

function foldUnit(unit: string): string {
  const arabic = ARABIC_FOLDS[unit];
  if (arabic) return arabic;
  const stripped = unit.normalize("NFKD").replace(/\p{M}/gu, "");
  const candidate = (stripped.length === 1 ? stripped : unit).toLowerCase();
  return candidate.length === 1 ? candidate : unit;
}

/** Same-length comparison view (see module note). */
export function fold(text: string): string {
  let out = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    // Surrogate halves pass through untouched so offsets never drift.
    out += code >= 0xd800 && code <= 0xdfff ? text[index] : foldUnit(text[index]!);
  }
  return out;
}

/** Fold for dictionary keys: also collapses spaces and punctuation. */
export function foldKey(text: string): string {
  return fold(normalizeMessage(text))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Blank a span in place, keeping every other offset valid. */
export function mask(text: string, start: number, end: number): string {
  return text.slice(0, start) + " ".repeat(Math.max(0, end - start)) + text.slice(end);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Letter-or-digit boundary usable with the `u` flag (works for Arabic too). */
export const B_BEFORE = "(?<![\\p{L}\\p{N}])";
export const B_AFTER = "(?![\\p{L}\\p{N}])";

/** An alternation of phrases, longest first, spaces matching any whitespace run. */
export function phraseAlternation(phrases: readonly string[]): string {
  return [...new Set(phrases.map((phrase) => fold(phrase)))]
    .sort((left, right) => right.length - left.length)
    .map((phrase) => escapeRegExp(phrase).replace(/ /g, "\\s*"))
    .join("|");
}

export function titleCaseLatin(word: string): string {
  if (!/^[\p{Script=Latin}'-]+$/u.test(word)) return word;
  const lower = word.toLocaleLowerCase("fr");
  if (word !== lower && word !== word.toLocaleUpperCase("fr")) return word;
  return lower.charAt(0).toLocaleUpperCase("fr") + lower.slice(1);
}
