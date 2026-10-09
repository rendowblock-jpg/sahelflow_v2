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
 * Normalize seller input consistently across Arabic, French, English and mixed
 * technical values. NFKD + mark removal deliberately makes French accents and
 * Arabic hamza/diacritics search-insensitive while preserving the displayed
 * source value. Search must also not fail because the seller typed Arabic-Indic
 * digits, tatweel, compatibility-width characters or repeated whitespace.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[٠-٩۰-۹]/gu, (digit) => ARABIC_DIGITS[digit] ?? digit)
    .replace(/ـ/gu, "")
    .replace(/[’‘`´]/gu, "'")
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/gu, " ");
}

/** Normalize phone/order/tracking forms while preserving letters and digits. */
export function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function tokenPrefixMatch(haystack: string, query: string): boolean {
  return haystack.split(/\s+/u).some((token) => token.startsWith(query));
}

const ALGERIAN_PHONE = /^(?:00213|213|0)?([567]\d{8}|[2-4]\d{7})$/u;

/**
 * The compact forms one Algerian phone number is stored under. Sellers type
 * "0661 98 76 54", "+213 661 98 76 54" or "00213661987654" for the same
 * person, and records hold either the local or the international form, so a
 * full number in any of these shapes searches both. Returns [] for anything
 * that is not a complete Algerian number.
 */
export function algerianPhoneSearchForms(query: string): string[] {
  const subscriber = ALGERIAN_PHONE.exec(compactSearchText(query))?.[1];
  return subscriber ? [`0${subscriber}`, `213${subscriber}`] : [];
}

/**
 * "58" means order ORD-0058: order numbers are zero-padded to four digits, so
 * a short number is looked up in its padded form. Longer numbers already are.
 */
export function paddedRecordNumber(query: string): string | null {
  const compact = compactSearchText(query);
  return /^\d{1,3}$/u.test(compact) ? compact.padStart(4, "0") : null;
}

/** The number a record reference ends with, without its zero padding. */
function trailingNumber(value: string): string | null {
  const digits = /(\d+)$/u.exec(value)?.[1];
  if (!digits) return null;
  return digits.replace(/^0+(?=\d)/u, "");
}

function numberMatches(query: string, value: string): boolean {
  return /^\d+$/u.test(query) && trailingNumber(value) === query.replace(/^0+(?=\d)/u, "");
}

/**
 * Optimal-string-alignment distance, bounded: returns max + 1 as soon as the
 * distance is known to exceed `max`. Covers a missing, extra, wrong or swapped
 * letter — the typos sellers make in a name ("Fatma", "benli").
 */
export function typoDistance(left: string, right: string, max: number): number {
  if (Math.abs(left.length - right.length) > max) return max + 1;
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let rowBest = row;
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      let value = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + cost,
      );
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        value = Math.min(value, (beforePrevious[column - 2] ?? 0) + 1);
      }
      current[column] = value;
      rowBest = Math.min(rowBest, value);
    }
    if (rowBest > max) return max + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[right.length] ?? max + 1;
}

/** Typos allowed in one word: none below four letters, one up to five, then two. */
export function typoBudget(word: string): number {
  if (word.length < 4 || /\d/u.test(word)) return 0;
  return word.length <= 5 ? 1 : 2;
}

/** Every typed word is a near-miss of (or a prefix of) a word of the label. */
function typoMatch(queryTokens: readonly string[], label: string): boolean {
  const words = label.split(" ").filter(Boolean);
  if (words.length === 0 || queryTokens.length === 0) return false;
  let corrected = false;
  for (const token of queryTokens) {
    if (words.some((word) => word.startsWith(token))) continue;
    const budget = typoBudget(token);
    if (budget === 0) return false;
    if (!words.some((word) => typoDistance(token, word, budget) <= budget)) return false;
    corrected = true;
  }
  return corrected;
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

/**
 * Search quality authority. Exact primary matches dominate exact metadata,
 * prefixes dominate token/contains matches, and recency is only a bounded
 * tie-breaker. This avoids the old round-robin behavior where a weak result from
 * another family could outrank the exact record the seller typed.
 */
export function scoreUniversalSearchCandidate(
  rawQuery: string,
  candidate: UniversalSearchCandidate,
): number {
  const query = normalizeSearchText(rawQuery);
  if (!query) return 0;

  const label = normalizeSearchText(candidate.label);
  const sublabel = normalizeSearchText(candidate.sublabel ?? "");
  const keywords = (candidate.keywords ?? []).map(normalizeSearchText);
  const compactQuery = compactSearchText(query);
  const compactLabel = compactSearchText(label);
  const compactSublabel = compactSearchText(sublabel);
  const haystack = [label, sublabel, ...keywords].filter(Boolean).join(" ");
  const queryTokens = query.split(" ").filter(Boolean);

  // A phone or reference means the same with or without its spaces and dashes,
  // so "0661 98 76 54" ranks exactly like "0661987654".
  const technical = compactQuery.length >= 2 && /^[\d\s()+\-./]+$/u.test(query);
  const equals = (value: string) =>
    technical ? compactSearchText(value) === compactQuery : value === query;

  let score = 0;
  if (equals(label)) score = 1_200;
  else if (keywords.some(equals)) score = 1_120;
  else if (equals(sublabel)) score = 1_080;
  else if (compactQuery.length >= 2 && compactLabel === compactQuery) score = 1_060;
  else if (compactQuery.length >= 2 && compactSublabel === compactQuery) score = 1_040;
  else if (numberMatches(compactQuery, compactLabel)) score = 1_030;
  else if (
    compactQuery.length >= 2 &&
    keywords.some((entry) => compactSearchText(entry) === compactQuery)
  )
    score = 1_020;
  else if (keywords.some((entry) => numberMatches(compactQuery, compactSearchText(entry))))
    score = 1_000;
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
  } else if (typoMatch(queryTokens, label)) {
    // A near miss ranks below every real match, so it fills an empty answer
    // without ever displacing what the seller typed correctly.
    score = 420;
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
): Array<T & { score: number }> {
  if (!Number.isSafeInteger(limit) || limit <= 0) return [];

  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreUniversalSearchCandidate(query, candidate),
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
