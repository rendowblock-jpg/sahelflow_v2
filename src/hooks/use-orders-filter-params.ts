"use client";

/**
 * Shared URL-state access for the orders list scope (q / wilaya / from / to).
 *
 * One parser map so every reader/writer of these params (filter bar, data
 * table empty states, SWR hook) agrees on the same URL contract:
 *   /orders?q=ali&wilaya=16&from=2026-08-01&to=2026-08-29
 * All writes are shallow; changing a scope resets `page` to 1.
 */

import { useQueryStates } from "nuqs";

const nullableString = {
  parse: (value: string | null) => value ?? null,
  serialize: (value: string | null) => value ?? "",
};
const pageParser = {
  parse: (value: string | null) =>
    value ? Math.max(1, Number.parseInt(value, 10) || 1) : 1,
  serialize: (value: number) => String(value),
};

export const ordersFilterParsers = {
  q: nullableString,
  wilaya: nullableString,
  from: nullableString,
  to: nullableString,
  page: pageParser,
};

export function useOrdersFilterParams() {
  const [params, setParams] = useQueryStates(ordersFilterParsers, {
    shallow: true,
  });
  const hasActiveFilters = Boolean(
    params.q || params.wilaya || params.from || params.to,
  );

  function clearFilters() {
    void setParams({
      q: null,
      wilaya: null,
      from: null,
      to: null,
      page: 1,
    });
  }

  return {
    q: params.q,
    wilaya: params.wilaya,
    from: params.from,
    to: params.to,
    hasActiveFilters,
    setParams,
    clearFilters,
  };
}
