/**
 * Phone, customer-name and address location for the offline extractor
 * (FD-064). Each finder returns the value and the span it occupied, so the
 * caller can blank the span before items are read — a phone number must
 * never become a phantom price, and "Cité 1000 Logements" is not 1000 DA.
 */
import {
  ADDRESS_LABELS,
  EDGE_STOPWORDS,
  EXCHANGE_VERBS,
  FILLERS,
  GREETINGS,
  NAME_INTROS_STRONG,
  NAME_INTROS_WEAK,
  ORDER_INTENTS,
  PHONE_LABELS,
} from "./lexicon";
import { B_AFTER, B_BEFORE, fold, phraseAlternation, titleCaseLatin } from "./text";

export interface Located<T> {
  value: T;
  start: number;
  end: number;
}

// ─── Phone ───────────────────────────────────────────────────────────────────

const SEP = "[\\s.\\-]?";
const PHONE_LABEL = `(?:${B_BEFORE}(?:${phraseAlternation(PHONE_LABELS)})\\s*[:：\\-]?\\s*)?`;
const PHONE_PATTERN = new RegExp(
  [
    `${PHONE_LABEL}(?:\\+|00)\\s?213${SEP}(?:\\(0\\))?0?[5-7](?:${SEP}\\d){8}(?!\\d)`,
    `${PHONE_LABEL}(?<![\\d+])213${SEP}0?[5-7](?:${SEP}\\d){8}(?!\\d)`,
    `${PHONE_LABEL}(?<!\\d)0[5-7](?:${SEP}\\d){8}(?!\\d)`,
  ].join("|"),
  "gu",
);
/** "tel 555123456": nine digits are a phone only right after a label. */
const LABELLED_SHORT_PHONE = new RegExp(
  `${B_BEFORE}(?:${phraseAlternation(PHONE_LABELS)})\\s*[:：\\-]?\\s*(?<digits>[5-7](?:${SEP}\\d){8})(?!\\d)`,
  "gu",
);

function canonicalPhone(raw: string): string | undefined {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00213")) digits = digits.slice(2);
  if (digits.startsWith("2130")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("213")) digits = `0${digits.slice(3)}`;
  if (digits.length === 9 && /^[5-7]/.test(digits)) digits = `0${digits}`;
  return /^0[5-7]\d{8}$/.test(digits) ? digits : undefined;
}

/** Every phone-shaped span (all are masked); the first valid one is used. */
export function findPhones(folded: string): Located<string>[] {
  const found: Located<string>[] = [];
  for (const match of folded.matchAll(PHONE_PATTERN)) {
    const start = match.index ?? 0;
    const digits = match[0].replace(/^[^\d+]*/u, "");
    const value = canonicalPhone(digits);
    if (value) found.push({ value, start, end: start + match[0].length });
  }
  for (const match of folded.matchAll(LABELLED_SHORT_PHONE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (found.some((phone) => start < phone.end && end > phone.start)) continue;
    const value = canonicalPhone(match.groups?.digits ?? "");
    if (value) found.push({ value, start, end });
  }
  return found.sort((left, right) => left.start - right.start);
}

/** Normalize any phone string (e.g. a model answer) to 0XXXXXXXXX. */
export function normalizePhone(value: string | undefined | null): string | undefined {
  return value ? canonicalPhone(value) : undefined;
}

// ─── Customer name ───────────────────────────────────────────────────────────

const NAME_STOP = new Set(
  [
    ...ORDER_INTENTS, ...GREETINGS, ...FILLERS, ...EDGE_STOPWORDS, ...EXCHANGE_VERBS,
    "je", "i", "am", "suis", "men", "من", "min", "from", "rani", "راني", "hna",
    "هنا", "ici", "wa", "and", "et", "و", "w", "is", "my", "mon", "ma",
  ].flatMap((word) => fold(word).split(" ")),
);

const STRONG_INTRO = new RegExp(
  `${B_BEFORE}(?:${phraseAlternation(NAME_INTROS_STRONG)})\\s*[:：\\-]?\\s*`,
  "gu",
);
const WEAK_INTRO = new RegExp(`${B_BEFORE}(?:${phraseAlternation(NAME_INTROS_WEAK)})\\s+`, "gu");
const NAME_WORD = /^[\p{L}][\p{L}'\-]*/u;

function readName(
  original: string,
  folded: string,
  from: number,
  weak: boolean,
  stopAt: ReadonlySet<number>,
): Located<string> | undefined {
  const words: string[] = [];
  let cursor = from;
  let end = from;
  while (words.length < 3) {
    const gapStart = cursor;
    while (folded[cursor] === " ") cursor += 1;
    // A run of blanks is a removed phone; a wilaya after the name ends it.
    if (words.length > 0 && (cursor - gapStart > 1 || stopAt.has(cursor))) break;
    const match = NAME_WORD.exec(folded.slice(cursor));
    if (!match) break;
    const word = match[0].replace(/['-]+$/u, "");
    if (NAME_STOP.has(word)) break;
    words.push(original.slice(cursor, cursor + word.length));
    cursor += word.length;
    end = cursor;
  }
  if (words.length === 0) return undefined;
  if (weak) {
    // "ana Amina, …" is a name; "ana nheb …" or "ana f Oran" is not.
    const tail = folded.slice(end).trimStart();
    if (words.length > 2 || !(tail === "" || /^[,،.\n!]/u.test(tail))) return undefined;
  }
  const value = words.map(titleCaseLatin).join(" ");
  return value.replace(/\s/g, "").length >= 2 ? { value, start: from, end } : undefined;
}

export function findCustomerName(
  original: string,
  folded: string,
  stopAt: ReadonlySet<number> = new Set(),
): Located<string> | undefined {
  for (const [pattern, weak] of [
    [STRONG_INTRO, false],
    [WEAK_INTRO, true],
  ] as const) {
    for (const match of folded.matchAll(pattern)) {
      const introStart = match.index ?? 0;
      const name = readName(original, folded, introStart + match[0].length, weak, stopAt);
      if (name) return { ...name, start: introStart };
    }
  }
  return undefined;
}

// ─── Address ─────────────────────────────────────────────────────────────────

const ADDRESS_LABEL = new RegExp(
  `${B_BEFORE}(?:${phraseAlternation(ADDRESS_LABELS)})${B_AFTER}\\s*[:：\\-]?\\s*`,
  "gu",
);

/** "Adresse: Cité 1000 Logements Bât B, Bab Ezzouar. Tel: …" */
export function findLabelledAddress(original: string, folded: string): Located<string> | undefined {
  for (const match of folded.matchAll(ADDRESS_LABEL)) {
    const start = match.index ?? 0;
    const from = start + match[0].length;
    const rest = folded.slice(from);
    // Ends at a newline, a sentence stop, a masked run (a removed phone or
    // wilaya leaves 3+ spaces) or the end of the message.
    const stop = rest.search(/\n|;|\.(?=\s|$)|\s{3,}|[!?؟]/u);
    const end = stop === -1 ? folded.length : from + stop;
    const value = original
      .slice(from, end)
      .replace(/\s+/g, " ")
      .replace(/^[\s,،:.-]+|[\s,،:.-]+$/gu, "");
    if (value.length >= 3) return { value, start, end };
  }
  return undefined;
}
