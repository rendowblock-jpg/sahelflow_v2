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
  else if (label.includes(query)) score = 760;
  else if (sublabel.includes(query)) score = 680;
  else if (keywords.some((entry) => entry.includes(query))) score = 620;
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

  if (score === 0) return 0;
  return score + recentBonus(candidate.updatedAt) + (candidate.rankBoost ?? 0);
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
