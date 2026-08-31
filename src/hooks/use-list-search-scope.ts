"use client";

/**
 * Shared URL-state access for the list scoped-search param (`q`) across
 * surfaces (orders/products/customers). Writers reset `page` to 1 so a new
 * search scope never strands the seller on a page that no longer exists.
 */

import { useQueryStates } from "nuqs";

const qParser = {
  parse: (value: string | null) => value ?? null,
  serialize: (value: string | null) => value ?? "",
};
const pageParser = {
  parse: (value: string | null) =>
    value ? Math.max(1, Number.parseInt(value, 10) || 1) : 1,
  serialize: (value: number) => String(value),
};

export function useListSearchScope() {
  const [{ q }, setParams] = useQueryStates(
    { q: qParser, page: pageParser },
    { shallow: true },
  );
  const hasActiveFilters = Boolean(q);

  function clearFilters() {
    void setParams({ q: null, page: 1 });
  }

  return {
    /** Committed search text (null when the param is absent). */
    q,
    hasActiveFilters,
    setParams,
    clearFilters,
  };
}
