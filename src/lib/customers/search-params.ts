/**
 * Query-string bounds for GET /api/customers/search (S03c-19).
 *
 * `parseInt` of a missing or garbage value is NaN, and `Math.min(NaN, 100)` is
 * NaN, which then reached Prisma as `take: NaN` and failed as a 500.
 */

function boundedInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export const CUSTOMER_SEARCH_DEFAULT_LIMIT = 50;
export const CUSTOMER_SEARCH_MAX_LIMIT = 100;

export function parseCustomerSearchLimit(raw: string | null): number {
  return boundedInt(raw, CUSTOMER_SEARCH_DEFAULT_LIMIT, 1, CUSTOMER_SEARCH_MAX_LIMIT);
}

export function parseCustomerSearchOffset(raw: string | null): number {
  return boundedInt(raw, 0, 0, 1_000_000);
}
