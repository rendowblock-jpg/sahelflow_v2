"use client";

import useSWR from "swr";
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

/**
 * Paginated Orders workbench query.
 *
 * Page and sort live in URL state. Because the API owns the same sort contract,
 * changing a sortable header fetches the correctly ordered dataset page instead
 * of reordering only the rows already in memory. RSC fallback is seeded only
 * when it matches the exact current page and normalized sort, so page/sort
 * navigation never relabels stale rows as a different workbench page.
 */
export function useOrders(opts: UseOrdersOptions = {}) {
  const [page, setPage] = useQueryState("page", {
    defaultValue: "1",
    shallow: true,
  });
  const [sort] = useQueryState("sort", {
    defaultValue: "createdAt.desc",
    shallow: true,
  });
  const currentPage = Number.parseInt(page, 10) || 1;
  const pageSize = opts.pageSize ?? 25;
  const normalizedSort = normalizeClientSort(
    sort,
    opts.fallback?.fieldAccess.financials ?? true,
  );
  const statusParam =
    opts.status && opts.status !== "all" ? `&status=${opts.status}` : "";
  const sortParam = `&sort=${encodeURIComponent(normalizedSort)}`;
  const key = `/api/orders?page=${currentPage}&pageSize=${pageSize}${statusParam}${sortParam}`;
  const fallbackData =
    opts.fallback &&
    opts.fallback.page === currentPage &&
    opts.fallback.pageSize === pageSize &&
    opts.fallback.sort === normalizedSort
      ? opts.fallback
      : undefined;

  const { data, error, isLoading, mutate } = useSWR<OrdersResponse>(key, fetcher, {
    fallbackData,
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });
  const response = data ?? fallbackData;
  const knownTotal = response?.total ?? opts.fallback?.total;

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
