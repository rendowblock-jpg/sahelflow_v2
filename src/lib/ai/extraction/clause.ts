/**
 * One clause of an order message → its product line (FD-064).
 *
 * A clause is a stretch between commas, newlines, sentence stops and item
 * conjunctions ("w", "و", "et", "and"). Quantities, prices and the words
 * around them are blanked in place — in the original and the folded view
 * together — so whatever is left is the product name, in the customer's own
 * spelling.
 */
import {
  ADDRESS_CONTINUATIONS,
  ADDRESS_KEYWORDS,
  ARTICLE_WORDS,
  ATTRIBUTE_CUES,
  CURRENCIES,
  EDGE_STOPWORDS,
  EXCHANGE_TARGET,
  EXCHANGE_VERBS,
  FILLERS,
  GREETINGS,
  NON_PRODUCT_WORDS,
  NUMBER_WORDS,
  ORDER_INTENTS,
  PRICE_CUES,
  QUANTITY_UNITS,
  SPEC_UNITS,
  THOUSAND_WORDS,
  TOTAL_CUES,
  UNIT_PRICE_MARKERS,
} from "./lexicon";
import { B_AFTER, B_BEFORE, fold, phraseAlternation } from "./text";

export interface ClauseReading {
  name?: string;
  quantity?: number;
  /** True when the customer actually wrote a quantity (not an article). */
  quantityStated: boolean;
  price?: number;
  total: boolean;
  unitMarker: boolean;
  intent: boolean;
  exchange: boolean;
  attribute?: string;
  address?: string;
  addressContinuation?: string;
}

const alt = phraseAlternation;
const NUMBER_WORD_ALT = alt(Object.keys(NUMBER_WORDS));
const LEADING_NOISE = new RegExp(
  `^[\\s\\-–—*•.]*(?:(?<intent>${alt(ORDER_INTENTS)})|${alt(GREETINGS)}|${alt(FILLERS)})${B_AFTER}`,
  "u",
);
const EXCHANGE = new RegExp(`${B_BEFORE}(?:${alt(EXCHANGE_VERBS)})${B_AFTER}`, "u");
const EXCHANGE_TARGET_RE = new RegExp(`${B_BEFORE}(?:${alt(EXCHANGE_TARGET)})${B_AFTER}`, "gu");
const ATTRIBUTE = new RegExp(`^\\s*(?:${alt(ATTRIBUTE_CUES)})${B_AFTER}\\s*[:：=\\-]?\\s*`, "u");
const ADDRESS_START = new RegExp(`^\\s*(?:${alt(ADDRESS_KEYWORDS)})${B_AFTER}`, "u");
const ADDRESS_CONTINUE = new RegExp(`^\\s*(?:${alt(ADDRESS_CONTINUATIONS)})${B_AFTER}`, "u");
const TOTAL = new RegExp(`${B_BEFORE}(?:${alt(TOTAL_CUES)})${B_AFTER}\\s*[:=]?`, "u");
const UNIT_MARKER = new RegExp(`${B_BEFORE}(?:${alt(UNIT_PRICE_MARKERS)})${B_AFTER}`, "u");
const FILLER_ANYWHERE = new RegExp(`${B_BEFORE}(?:${alt(FILLERS)})${B_AFTER}`, "gu");

const NUM = "\\d{1,3}(?:[.,]\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?";
const CURRENCY = `(?:${alt(CURRENCIES)})(?![\\p{L}])\\.?`;
const THOUSANDS = `(?:${alt(THOUSAND_WORDS)})${B_AFTER}`;
const SPEC_AFTER = `(?!\\s*(?:${alt(SPEC_UNITS)})${B_AFTER})`;
const UNIT_AFTER = `(?!\\s*(?:${alt(QUANTITY_UNITS)})${B_AFTER})`;

const PRICE_WITH_THOUSANDS = new RegExp(`${B_BEFORE}(?<num>\\d+(?:[.,]\\d+)?)\\s*${THOUSANDS}(?:\\s*${CURRENCY})?`, "u");
const PRICE_WITH_CURRENCY = new RegExp(`${B_BEFORE}(?<num>${NUM})\\s*${CURRENCY}`, "u");
const PRICE_IN_WORDS = new RegExp(
  `${B_BEFORE}(?:(?<word>${NUMBER_WORD_ALT})\\s*)?(?<thousand>${alt(THOUSAND_WORDS.filter((word) => word !== "k"))})${B_AFTER}(?<half>\\s*(?:w|o|و|et)\\s*(?:nos|nass|nes|نص|نصف|demi))?(?:\\s*${CURRENCY})?`,
  "u",
);
const PRICE_AFTER_CUE = new RegExp(
  `${B_BEFORE}(?:${alt(PRICE_CUES)})\\s*[:：]?\\s*(?<num>\\d{1,3}(?:[.,]\\d{3})+|\\d{3,7})(?!\\d)${SPEC_AFTER}${UNIT_AFTER}`,
  "u",
);
const BARE_PRICE = new RegExp(
  `${B_BEFORE}(?<num>\\d{1,3}(?:[.,]\\d{3})+|\\d{3,7})(?![\\p{L}\\p{N}])${SPEC_AFTER}${UNIT_AFTER}`,
  "gu",
);
/** "3 500 DA" / "prix: 3 500" — a space as thousands separator. */
const SPACED_THOUSANDS = new RegExp(
  `(?<![\\d.,])(\\d{1,3}) (\\d{3})(?=\\s*(?:${alt(CURRENCIES)})${B_AFTER})|(?<=^\\s*|[:：]\\s*|${B_BEFORE}(?:${alt(PRICE_CUES)})\\s+)(\\d{1,3}) (\\d{3})(?=\\s*$)`,
  "u",
);

const QTY_UNIT = new RegExp(`${B_BEFORE}(?<num>\\d{1,3})\\s*(?:${alt(QUANTITY_UNITS)})(?![\\p{L}\\p{N}])`, "u");
const QTY_REVERSE = new RegExp(`${B_BEFORE}(?:x|×|\\*)\\s*(?<num>\\d{1,3})(?!\\d)`, "u");
const QTY_LABEL = new RegExp(`${B_BEFORE}(?:qte|qty|quantite|quantity|nombre|الكميه|كميه)\\s*[:=]?\\s*(?<num>\\d{1,3})(?!\\d)`, "u");
const QTY_WORD = new RegExp(`^\\s*(?<word>${NUMBER_WORD_ALT})(?:\\s*(?:${alt(QUANTITY_UNITS)}))?${B_AFTER}`, "u");
const QTY_LEADING = new RegExp(`^\\s*(?<num>\\d{1,3})\\s+(?=\\p{L})`, "u");

const EDGE_WORDS = new Set(
  [...EDGE_STOPWORDS, ...FILLERS, ...CURRENCIES, ...PRICE_CUES, ...GREETINGS].map((word) => fold(word)),
);
const NON_PRODUCT = new Set(
  [...NON_PRODUCT_WORDS, ...EDGE_STOPWORDS, ...GREETINGS, ...ORDER_INTENTS, ...FILLERS]
    .flatMap((word) => fold(word).split(" ")),
);

export function parsePriceNumber(raw: string): number | undefined {
  const compact = raw.replace(/\s/g, "");
  const decimal = compact.match(/^(.*),(\d{1,2})$/);
  const value = decimal
    ? Math.round(Number.parseFloat(`${decimal[1]!.replace(/[.,]/g, "")}.${decimal[2]}`))
    : Number.parseInt(compact.replace(/[.,]/g, ""), 10);
  return Number.isFinite(value) ? value : undefined;
}

class Workspace {
  constructor(
    public original: string,
    public folded: string,
  ) {}

  blank(start: number, end: number): void {
    const pad = " ".repeat(end - start);
    this.original = this.original.slice(0, start) + pad + this.original.slice(end);
    this.folded = this.folded.slice(0, start) + pad + this.folded.slice(end);
  }

  take(pattern: RegExp): RegExpExecArray | null {
    pattern.lastIndex = 0;
    const match = pattern.exec(this.folded);
    if (match) this.blank(match.index, match.index + match[0].length);
    return match;
  }

  rest(): string {
    return this.original.replace(/\s+/g, " ").trim();
  }
}

function trimEdges(name: string): string {
  let words = name.split(" ").filter(Boolean);
  const edge = (word: string) => EDGE_WORDS.has(fold(word).replace(/[^\p{L}\p{N}'.]+/gu, ""));
  let changed = true;
  while (changed && words.length > 0) {
    changed = false;
    if (edge(words[0]!)) { words = words.slice(1); changed = true; }
    if (words.length > 0 && edge(words[words.length - 1]!)) { words = words.slice(0, -1); changed = true; }
  }
  return words.join(" ").replace(/^[\s,،:;.\-–—*•()]+|[\s,،:;\-–—*•(]+$/gu, "").trim();
}

function isProductName(name: string): boolean {
  const tokens = fold(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!tokens.some((token) => /\p{L}{2,}/u.test(token))) return false;
  return tokens.some((token) => !NON_PRODUCT.has(token) && !/^\d+$/.test(token));
}

export function readClause(original: string, folded: string): ClauseReading {
  const reading: ClauseReading = { quantityStated: false, total: false, unitMarker: false, intent: false, exchange: false };
  const work = new Workspace(original, folded);

  // Leading greetings, fillers and order verbs ("salam, bghit nchri …").
  for (let guard = 0; guard < 8; guard += 1) {
    const match = work.take(LEADING_NOISE);
    if (!match) break;
    if (match.groups?.intent) reading.intent = true;
  }
  if (ADDRESS_CONTINUE.test(work.folded) && !ADDRESS_START.test(work.folded)) {
    reading.addressContinuation = work.rest();
    return reading;
  }
  if (ADDRESS_START.test(work.folded)) {
    reading.address = work.rest();
    return reading;
  }
  const attribute = work.take(ATTRIBUTE);
  if (attribute) {
    reading.attribute = work.rest();
    return reading;
  }

  const exchange = EXCHANGE.exec(work.folded);
  if (exchange) {
    reading.exchange = true;
    reading.intent = true;
    const targets = [...work.folded.matchAll(EXCHANGE_TARGET_RE)].filter((m) => (m.index ?? 0) > exchange.index);
    const target = targets.at(-1);
    work.blank(0, target ? (target.index ?? 0) + target[0].length : exchange.index + exchange[0].length);
  }

  if (work.take(TOTAL)) reading.total = true;
  if (work.take(UNIT_MARKER)) reading.unitMarker = true;
  work.folded = work.folded.replace(SPACED_THOUSANDS, (_all, a, b, c, d) => (a ? `${a}.${b}` : `${c}.${d}`));

  // Stated quantities first: "2x", "x3", "3 pièces", "qte: 2".
  for (const pattern of [QTY_LABEL, QTY_UNIT, QTY_REVERSE]) {
    const match = work.take(pattern);
    if (match?.groups?.num) {
      reading.quantity = Number(match.groups.num);
      reading.quantityStated = true;
      break;
    }
  }

  const thousands = work.take(PRICE_WITH_THOUSANDS);
  if (thousands?.groups?.num) {
    reading.price = Math.round(Number(thousands.groups.num.replace(",", ".")) * 1000);
  }
  if (reading.price === undefined) {
    const currency = work.take(PRICE_WITH_CURRENCY);
    if (currency?.groups?.num) reading.price = parsePriceNumber(currency.groups.num);
  }
  if (reading.price === undefined) {
    const words = work.take(PRICE_IN_WORDS);
    if (words?.groups?.thousand) {
      const thousand = fold(words.groups.thousand);
      const multiplier = words.groups.word ? NUMBER_WORDS[fold(words.groups.word).replace(/\s+/g, "")] ?? 1 : 1;
      const base = /^(alfin|الفين)$/u.test(thousand) ? 2000 : multiplier * 1000;
      reading.price = base + (words.groups.half ? 500 : 0);
    }
  }
  if (reading.price === undefined) {
    const cue = work.take(PRICE_AFTER_CUE);
    if (cue?.groups?.num) reading.price = parsePriceNumber(cue.groups.num);
  }
  if (reading.price === undefined) {
    const bare = [...work.folded.matchAll(BARE_PRICE)].filter((m) => Number(parsePriceNumber(m.groups?.num ?? "")) >= 100).at(-1);
    if (bare?.groups?.num) {
      reading.price = parsePriceNumber(bare.groups.num);
      work.blank(bare.index ?? 0, (bare.index ?? 0) + bare[0].length);
    }
  }
  if (reading.price !== undefined && reading.price < 50) reading.price = undefined;

  if (!reading.quantityStated) {
    const word = work.take(QTY_WORD);
    if (word?.groups?.word) {
      const key = fold(word.groups.word).replace(/\s+/g, "");
      reading.quantity = NUMBER_WORDS[key] ?? 1;
      reading.quantityStated = !ARTICLE_WORDS.has(key);
    } else {
      const leading = work.take(QTY_LEADING);
      if (leading?.groups?.num && Number(leading.groups.num) > 0) {
        reading.quantity = Number(leading.groups.num);
        reading.quantityStated = true;
      }
    }
  }

  const name = trimEdges(work.rest().replace(FILLER_ANYWHERE, " ").replace(/\s+/g, " "));
  if (name && isProductName(name)) reading.name = name;
  return reading;
}
