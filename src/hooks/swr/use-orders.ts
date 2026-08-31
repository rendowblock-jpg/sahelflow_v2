"use client";

import { useEffect, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useQueryState } from "nuqs";

import { fetcher } from "@/lib/swr/fetcher";
import type { OrderStatus } from "@/types/domain";
import type {
  OrderListItem as WorkbenchOrderListItem,
  OrdersWorkbenchResponse,
} from "@/types/workbench";

export type OrderListItem = WorkbenchOrderListItem;
export type OrdersResponse = OrdersWorkbenchResponse;

interface UseOrdersOptions {
  status?: OrderStatus | "all";
  pageSize?: number;
  fallback?: OrdersResponse;
}

function normalizeClientSort(raw: string, canReadFinancials: boolean): string {
  switch (raw) {
    case "createdAt.asc":
    case "createdAt.desc":
    case "orderNumber.asc":
    case "orderNumber.desc":
      return raw;
    case "totalPrice.asc":
    case "totalPrice.desc":
      return canReadFinancials ? raw : "createdAt.desc";
    default:
      return "createdAt.desc";
  }
}

/** Normalize a raw wilaya param to its canonical numeric string ("06" → "6"). */
function normalizeWilayaParam(raw: string): string {
  const code = Number.parseInt(raw, 10);
  return Number.isSafeInteger(code) && code > 0 ? String(code) : "";
}

export function useOrders(opts: UseOrdersOptions = {}) {
  const [page, setPage] = useQueryState("page", {
    defaultValue: "1",
    shallow: true,
  });
  const [sort] = useQueryState("sort", {
    defaultValue: "createdAt.desc",
    shallow: true,
  });
  const [q] = useQueryState("q", { defaultValue: "", shallow: true });
  const [wilaya] = useQueryState("wilaya", {
    defaultValue: "",
    shallow: true,
  });
  const [from] = useQueryState("from", { defaultValue: "", shallow: true });
  const [to] = useQueryState("to", { defaultValue: "", shallow: true });
  const { cache } = useSWRConfig();
  const currentPage = Number.parseInt(page, 10) || 1;
  const pageSize = opts.pageSize ?? 25;
  const normalizedSort = normalizeClientSort(
    sort,
    opts.fallback?.fieldAccess.financials ?? true,
  );
  const trimmedQ = q.trim();
  const wilayaCode = normalizeWilayaParam(wilaya);
  const trimmedFrom = from.trim();
  const trimmedTo = to.trim();
  const statusParam =
    opts.status && opts.status !== "all" ? `&status=${opts.status}` : "";
  const sortParam = `&sort=${encodeURIComponent(normalizedSort)}`;
  const qParam = trimmedQ ? `&q=${encodeURIComponent(trimmedQ)}` : "";
  const wilayaParam = wilayaCode ? `&wilaya=${wilayaCode}` : "";
  const fromParam = trimmedFrom ? `&dateFrom=${encodeURIComponent(trimmedFrom)}` : "";
  const toParam = trimmedTo ? `&dateTo=${encodeURIComponent(trimmedTo)}` : "";
  const key = `/api/orders?page=${currentPage}&pageSize=${pageSize}${statusParam}${sortParam}${qParam}${wilayaParam}${fromParam}${toParam}`;

  // The RSC fallback is only authoritative while the URL filters still match
  // what the server actually applied — after a shallow filter change the old
  // first paint must not masquerade as the filtered result.
  const applied = opts.fallback?.appliedFilters;
  const filtersMatch =
    (applied?.q ?? null) === (trimmedQ || null) &&
    (applied?.wilaya ?? null) === (wilayaCode || null) &&
    (applied?.dateFrom ?? null) === (trimmedFrom || null) &&
    (applied?.dateTo ?? null) === (trimmedTo || null);
  const fallbackData =
    opts.fallback &&
    opts.fallback.page === currentPage &&
    opts.fallback.pageSize === pageSize &&
    opts.fallback.sort === normalizedSort &&
    filtersMatch
      ? opts.fallback
      : undefined;
  const hasCachedData = cache.get(key)?.data !== undefined;

  const { data, error, isLoading, mutate } = useSWR<OrdersResponse>(key, fetcher, {
    fallbackData,
    // The exact server fallback can skip the duplicate first-hydration request
    // only when this SWR key has no older cached data. On a later revisit SWR
    // prefers cached data over fallbackData, so revalidate that mount instead of
    // letting an older list remain authoritative after a fresh server render.
    revalidateOnMount: fallbackData ? hasCachedData : undefined,
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });
  const response = data ?? fallbackData;
  const knownTotal = response?.total ?? opts.fallback?.total;
  const lastPage = Math.max(1, Math.ceil((knownTotal ?? 0) / pageSize));

  // Changing the scope of a list must never keep the seller on a page that no
  // longer exists: any filter change snaps back to page 1.
  const filterKey = `${trimmedQ}\u0000${wilayaCode}\u0000${trimmedFrom}\u0000${trimmedTo}`;
  const prevFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKeyRef.current === filterKey) return;
    prevFilterKeyRef.current = filterKey;
    if (currentPage !== 1) {
      void setPage("1");
    }
  }, [filterKey, currentPage, setPage]);

  useEffect(() => {
    if (knownTotal !== undefined && currentPage > lastPage) {
      void setPage(String(lastPage));
    }
  }, [currentPage, knownTotal, lastPage, setPage]);

  return {
    data: response,
    error,
    isLoading: isLoading && !response,
    mutate,
    pagination: {
      page: currentPage,
      pageSize,
      total: knownTotal,
      hasNextPage:
        response?.hasNextPage ??
        (knownTotal != null ? currentPage * pageSize < knownTotal : false),
      onPageChange: (nextPage: number) => setPage(String(nextPage)),
      isLoading,
      serverSort: true,
      sort: response?.sort ?? normalizedSort,
    },
  };
}
