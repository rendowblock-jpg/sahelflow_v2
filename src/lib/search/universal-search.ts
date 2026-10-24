export interface ProtectedOperationalDetailAccess {
  contact: boolean;
  financials: boolean;
}

export type UniversalSearchKind =
  | "navigation"
  | "action"
  | "order"
  | "customer"
  | "product"
  | "conversation"
  | "delivery"
  | "return";

export interface UniversalSearchCandidate {
  id: string;
  kind: UniversalSearchKind;
  label: string;
  sublabel?: string;
  href: string;
  keywords?: readonly string[];
  updatedAt?: string | number | Date | null;
  /** Small deterministic tie-breaker only. Match quality always dominates. */
  rankBoost?: number;
}

export interface RankedUniversalSearchCandidate extends UniversalSearchCandidate {
  score: number;
}

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

/**
 * Arabic letters that sellers spell in more than one way, folded to one form:
 * alef wasla to alef, alef maqsura and Persian yeh to ya, ta marbuta to ha,
 * Persian kaf to Arabic kaf. (Hamza on alef, waw and ya is already removed by
 * NFKD + mark removal below.)
 */
const ARABIC_LETTER_FOLDS: Record<string, string> = {
  "ٱ": "ا",
  "ى": "ي",
  "ی": "ي",
  "ة": "ه",
  "ک": "ك",
};

/** Bidi marks, embeddings, isolates, zero-width spaces and the BOM. */
const INVISIBLE_MARKS = /[\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu;

export interface SearchFoldOptions {
  /**
   * Fold Arabic letter variants and drop invisible bidi marks. Default true.
   * Turn off ONLY for the keyed tokens of the persisted customer/order index:
   * they were written without this fold and are not rebuilt yet.
   */
  foldLetters?: boolean;
  /** Read +213 / 00213 / 213 as the national 0 in compactSearchText. Default true. */
  nationalPhone?: boolean;
}

/**
 * Normalize seller input consistently across Arabic, French, English and mixed
 * technical values. NFKD + mark removal deliberately makes French accents and
 * Arabic hamza/diacritics search-insensitive while preserving the displayed
 * source value. Search must also not fail because the seller typed Arabic-Indic
 * digits, tatweel, compatibility-width characters, bidi marks, ya/alef-maqsura
 * or ha/ta-marbuta variants, or repeated whitespace.
 */
export function normalizeSearchText(
  value: string,
  options: SearchFoldOptions = {},
): string {
  let text = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[٠-٩۰-۹]/gu, (digit) => ARABIC_DIGITS[digit] ?? digit)
    .replace(/ـ/gu, "")
    .replace(/[’‘`´]/gu, "'");
  if (options.foldLetters !== false) {
    text = text
      .replace(INVISIBLE_MARKS, "")
      .replace(/[ٱىیةک]/gu, (letter) => ARABIC_LETTER_FOLDS[letter] ?? letter);
  }
  return text.toLocaleLowerCase().trim().replace(/\s+/gu, " ");
}

/**
 * Digits-only phone typed with the country code: "+213 655 12 34 56",
 * "00213655123456", a bare 12-digit "213655123456" or "+213 (0) 655 ..."
 * become the national "0655123456". Anything with letters, or a bare number
 * of another length, is left alone so order and tracking numbers are safe.
 */
function toNationalPhone(normalized: string, compact: string): string {
  if (!/^\d+$/u.test(compact)) return compact;
  let rest: string | null = null;
  if (compact.startsWith("00213")) rest = compact.slice(5);
  else if (compact.startsWith("213")) {
    const typedWithPlus = /^\+\s*213/u.test(normalized);
    if (typedWithPlus || compact.length === 12) rest = compact.slice(3);
  }
  if (rest === null) return compact;
  if (rest.length === 10 && rest.startsWith("0")) rest = rest.slice(1);
  return `0${rest}`;
}

/** Normalize phone/order/tracking forms while preserving letters and digits. */
export function compactSearchText(
  value: string,
  options: SearchFoldOptions = {},
): string {
  const normalized = normalizeSearchText(value, options);
  const compact = normalized.replace(/[^\p{L}\p{N}]+/gu, "");
  return options.nationalPhone === false
    ? compact
    : toNationalPhone(normalized, compact);
}

/**
 * Does the seller's typed text match any of these stored values? Folds both
 * sides (see normalizeSearchText), reads phones and SKUs across separators
 * and country codes, and for several words needs every word in one value.
 * This is the one predicate for lists filtered in memory (pickers, inbox).
 */
export function matchesSearchQuery(
  query: string,
  fields: ReadonlyArray<string | null | undefined>,
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const compactQuery = compactSearchText(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);

  for (const field of fields) {
    if (!field) continue;
    const label = normalizeSearchText(field);
    if (!label) continue;
    if (label.includes(normalizedQuery)) return true;
    // Phones and SKUs match across separators: "0555 12" -> "055512".
    if (compactQuery && compactSearchText(field).includes(compactQuery)) return true;
    // Multi-word queries match when every token is present in one field.
    if (tokens.length > 1 && tokens.every((token) => label.includes(token))) {
      return true;
    }
  }
  return false;
}

function tokenPrefixMatch(haystack: string, query: string): boolean {
  return haystack.split(/\s+/u).some((token) => token.startsWith(query));
}

function recentBonus(value: UniversalSearchCandidate["updatedAt"]): number {
  if (value === null || value === undefined) return 0;
  const timestamp =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);
  if (!Number.isFinite(timestamp)) return 0;
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  return Math.max(0, 24 - Math.floor(ageDays));
}

export interface UniversalSearchScoreOptions {
  /**
   * Also accept words that are one or two typos away. Off by default: the
   * strict tiers alone decide the normal pass. The server turns it on only for
   * a search that found nothing.
   */
  fuzzy?: boolean;
}

const FUZZY_MIN_TOKEN_LENGTH = 4;
const FUZZY_MAX_TOTAL_DISTANCE = 2;
const FUZZY_BASE_SCORE = 540;
const FUZZY_DISTANCE_PENALTY = 45;

/**
 * Edit distance (insert, delete, substitute and adjacent transposition) that
 * gives up as soon as it must exceed `max`, so a miss costs almost nothing.
 * Returns `max + 1` for "too far".
 */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let beforePrevious: number[] = new Array<number>(b.length + 1).fill(0);
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current: number[] = new Array<number>(b.length + 1).fill(0);
    current[0] = row;
    let rowMinimum = row;
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a.charCodeAt(row - 1) === b.charCodeAt(column - 1) ? 0 : 1;
      let value = Math.min(
        previous[column]! + 1,
        current[column - 1]! + 1,
        previous[column - 1]! + cost,
      );
      if (
        row > 1 &&
        column > 1 &&
        a.charCodeAt(row - 1) === b.charCodeAt(column - 2) &&
        a.charCodeAt(row - 2) === b.charCodeAt(column - 1)
      ) {
        value = Math.min(value, beforePrevious[column - 2]! + 1);
      }
      current[column] = value;
      if (value < rowMinimum) rowMinimum = value;
    }
    if (rowMinimum > max) return max + 1;
    beforePrevious = previous;
    previous = current;
  }
  const distance = previous[b.length]!;
  return distance > max ? max + 1 : distance;
}

function fuzzyBudget(length: number): number {
  if (length >= 8) return 2;
  return length >= FUZZY_MIN_TOKEN_LENGTH ? 1 : 0;
}

/**
 * Closest candidate word to one typed word, or null when none is close enough.
 * Digits never match loosely (a wrong phone digit is a different customer), a
 * short word never does, and the first letter must agree: that single rule
 * removes most false positives.
 */
function closestWordDistance(
  typed: string,
  words: readonly string[],
): number | null {
  const budget = fuzzyBudget(typed.length);
  if (budget === 0 || /\d/u.test(typed)) return null;
  let best: number | null = null;
  for (const word of words) {
    if (word.charCodeAt(0) !== typed.charCodeAt(0)) continue;
    // Compare against the whole word and against its same-length start, so a
    // typo in a word that is still being typed counts too.
    const distance = Math.min(
      boundedEditDistance(typed, word, budget),
      boundedEditDistance(typed, word.slice(0, typed.length), budget),
    );
    if (distance <= budget && (best === null || distance < best)) best = distance;
  }
  return best;
}

function fuzzyScore(
  queryTokens: readonly string[],
  fields: readonly string[],
): number {
  if (queryTokens.length === 0 || queryTokens.length > 3) return 0;
  const words = new Set<string>();
  for (const field of fields) {
    for (const word of field.split(" ")) if (word.length >= 3) words.add(word);
  }
  const candidateWords = [...words];
  let totalDistance = 0;
  let loose = false;
  for (const typed of queryTokens) {
    if (candidateWords.some((word) => word.startsWith(typed))) continue;
    const distance = closestWordDistance(typed, candidateWords);
    if (distance === null) return 0;
    totalDistance += distance;
    loose = true;
  }
  if (!loose || totalDistance > FUZZY_MAX_TOTAL_DISTANCE) return 0;
  return FUZZY_BASE_SCORE - FUZZY_DISTANCE_PENALTY * totalDistance;
}

/**
 * Shorter spellings of a query to try once when it found nothing. The longest
 * word is cut to a prefix, because a typo is usually near the end of a word
 * and the index answers prefixes: "mohamad" has no match, but "mohama" finds
 * "Mohamed", which the caller then re-ranks by closeness to what was typed.
 */
export function typoBackoffQueries(rawQuery: string): string[] {
  const tokens = normalizeSearchText(rawQuery).split(" ").filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return [];
  let index = -1;
  let longest = 0;
  tokens.forEach((token, position) => {
    if (!/\d/u.test(token) && token.length >= 5 && token.length > longest) {
      longest = token.length;
      index = position;
    }
  });
  if (index < 0) return [];
  const target = tokens[index]!;
  const lengths = new Set(
    [target.length - 1, Math.ceil(target.length * 0.6)].filter(
      (length) => length >= 3 && length < target.length,
    ),
  );
  return [...lengths]
    .sort((left, right) => right - left)
    .map((length) => {
      const copy = [...tokens];
      copy[index] = target.slice(0, length);
      return copy.join(" ");
    });
}

/**
 * Wall-clock budget for the extra "shorter spelling" passes of ONE search that
 * found nothing. The first widened pass always runs, however slow the machine
 * is, so typo tolerance never switches itself off on slow hardware. A further
 * pass starts only while the widened phase has used less than this budget, so
 * the work added to a miss is bounded by this constant plus one pass instead
 * of growing with every spelling tried.
 */
export const TYPO_PASS_BUDGET_MS = 300;

export function mayStartTypoPass(startedPasses: number, elapsedMs: number): boolean {
  return startedPasses <= 0 || elapsedMs < TYPO_PASS_BUDGET_MS;
}

/**
 * Search quality authority. Exact primary matches dominate exact metadata,
 * prefixes dominate token/contains matches, and recency is only a bounded
 * tie-breaker. This avoids the old round-robin behavior where a weak result from
 * another family could outrank the exact record the seller typed.
 */
export function scoreUniversalSearchCandidate(
  rawQuery: string,
  candidate: UniversalSearchCandidate,
  options: UniversalSearchScoreOptions = {},
): number {
  const query = normalizeSearchText(rawQuery);
  if (!query) return 0;

  const label = normalizeSearchText(candidate.label);
  const sublabel = normalizeSearchText(candidate.sublabel ?? "");
  const keywords = (candidate.keywords ?? []).map((keyword) =>
    normalizeSearchText(keyword),
  );
  const compactQuery = compactSearchText(query);
  const compactLabel = compactSearchText(label);
  const compactSublabel = compactSearchText(sublabel);
  const haystack = [label, sublabel, ...keywords].filter(Boolean).join(" ");
  const queryTokens = query.split(" ").filter(Boolean);

  let score = 0;
  if (label === query) score = 1_200;
  else if (keywords.includes(query)) score = 1_120;
  else if (sublabel === query) score = 1_080;
  else if (compactQuery.length >= 2 && compactLabel === compactQuery) score = 1_060;
  else if (compactQuery.length >= 2 && compactSublabel === compactQuery) score = 1_040;
  else if (label.startsWith(query)) score = 980;
  else if (sublabel.startsWith(query)) score = 900;
  else if (keywords.some((entry) => entry.startsWith(query))) score = 880;
  else if (tokenPrefixMatch(label, query)) score = 850;
  else if (query.length >= 2 && label.includes(query)) score = 760;
  else if (query.length >= 2 && sublabel.includes(query)) score = 680;
  else if (query.length >= 2 && keywords.some((entry) => entry.includes(query)))
    score = 620;
  else if (
    queryTokens.length > 1 &&
    queryTokens.every((token) => haystack.includes(token))
  ) {
    score = 600;
  } else if (
    compactQuery.length >= 3 &&
    (compactLabel.includes(compactQuery) || compactSublabel.includes(compactQuery))
  ) {
    score = 580;
  }

  // Last and lowest tier: a word one or two typos away. Every strict tier
  // above scores at least 580, this one at most 540, so a loose match can
  // never outrank a real one.
  if (score === 0 && options.fuzzy) {
    score = fuzzyScore(queryTokens, [label, sublabel, ...keywords]);
  }

  if (score === 0) return 0;
  return score + recentBonus(candidate.updatedAt) + (candidate.rankBoost ?? 0);
}

const EXCERPT_LEAD = 28;
const EXCERPT_LENGTH = 96;

/**
 * The part of a message that matched, so a conversation found by its text says
 * why it was found. Offsets come from the normalized text; they line up with
 * the original closely enough for a display excerpt.
 */
export function messageExcerpt(body: string, query: string): string | undefined {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return undefined;
  const text = body.replace(/\s+/gu, " ").trim();
  const index = normalizeSearchText(text).indexOf(normalizedQuery);
  if (index < 0) return undefined;
  const start = Math.max(0, index - EXCERPT_LEAD);
  const slice = text.slice(start, start + EXCERPT_LENGTH).trim();
  return `${start > 0 ? "…" : ""}${slice}${start + EXCERPT_LENGTH < text.length ? "…" : ""}`;
}

export function rankUniversalSearchCandidates<T extends UniversalSearchCandidate>(
  query: string,
  candidates: readonly T[],
  limit: number,
  options: UniversalSearchScoreOptions = {},
): Array<T & { score: number }> {
  if (!Number.isSafeInteger(limit) || limit <= 0) return [];

  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreUniversalSearchCandidate(query, candidate, options),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.index - right.index ||
        left.candidate.label.localeCompare(right.candidate.label),
    )
    .slice(0, limit)
    .map(({ candidate, score }) => ({ ...candidate, score }));
}

/**
 * Detail workbenches expose customer/contact and financial data together.
 * A universal-search result may deep-link only when the canonical projection
 * proves the current actor can read both protected dimensions.
 */
export function canOpenProtectedOperationalDetail(
  access: ProtectedOperationalDetailAccess,
): boolean {
  return access.contact && access.financials;
}

/**
 * Legacy family merge retained for callers outside the new command center. New
 * universal search should rank a unified candidate set with
 * rankUniversalSearchCandidates instead of relying on family position.
 */
export function mergeUniversalSearchFamilies<T>(
  families: readonly (readonly T[])[],
  limit: number,
): T[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) return [];

  const merged: T[] = [];
  let rank = 0;

  while (merged.length < limit) {
    let appended = false;

    for (const family of families) {
      if (rank >= family.length) continue;
      merged.push(family[rank]!);
      appended = true;
      if (merged.length >= limit) return merged;
    }

    if (!appended) break;
    rank += 1;
  }

  return merged;
}
