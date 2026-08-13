export interface ProtectedOperationalDetailAccess {
  contact: boolean;
  financials: boolean;
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
 * Merge independently ranked search families without allowing an earlier family
 * to consume the complete global budget. The first result from every non-empty
 * family is considered before any family's second result, preserving each
 * family's internal order while keeping the global result set representative.
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
