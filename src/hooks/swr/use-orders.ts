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

/**
 * Paginated Orders workbench query.
 *
 * Page and sort live in URL state. Because the API owns the same sort contract,
 * changing a sortable header fetches the correctly ordered dataset page instead
 * of reordering only the rows already in memory.
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
  const pageSize = opts.pageSize ?? 25;
  const statusParam =
    opts.status && opts.status !== "all" ? `&status=${opts.status}` : "";
  const sortParam = sort ? `&sort=${encodeURIComponent(sort)}` : "";
  const key = `/api/orders?page=${page}&pageSize=${pageSize}${statusParam}${sortParam}`;

  const { data, error, isLoading, mutate } = useSWR<OrdersResponse>(key, fetcher, {
    fallbackData: opts.fallback,
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });

  const currentPage = Number.parseInt(page, 10) || 1;

  return {
    data,
    error,
    isLoading: isLoading && !data,
    mutate,
    pagination: {
      page: currentPage,
      pageSize,
      total: data?.total,
      hasNextPage: data?.hasNextPage ?? false,
      onPageChange: (nextPage: number) => setPage(String(nextPage)),
      isLoading: isLoading && Boolean(data),
      serverSort: true,
    },
  };
}
