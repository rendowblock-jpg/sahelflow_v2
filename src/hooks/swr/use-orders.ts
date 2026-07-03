"use client";

/**
 * useOrders — SWR hook for the paginated orders list (Phase 1).
 *
 * Fetches from /api/orders with page-based pagination + optional status filter.
 * SWR handles dedup, cache, and refetch. Mutations use mutatePrefix to
 * revalidate all order-related keys.
 *
 * Usage:
 *   const { data, isLoading, pagination } = useOrders({ status: "pending" });
 *   // data.orders, data.total, data.hasNextPage
 *   // pagination.page, pagination.onPageChange
 *
 * For mutations:
 *   import { mutatePrefix } from "@/lib/swr/mutate";
 *   await fetch("/api/orders/bulk", { method: "POST", body: ... });
 *   await mutatePrefix("/api/orders");
 */
import useSWR from "swr";
import { useQueryState } from "nuqs";
import { fetcher } from "@/lib/swr/fetcher";
import type { OrderStatus } from "@/types/domain";

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: string;
  totalPrice: number;
  wilaya: string;
  phone: string;
  createdAt: Date | string;
  items: Array<{ id: string }>;
  customer: { name: string | null; phone: string | null } | null;
}

export interface OrdersResponse {
  orders: OrderListItem[];
  total: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
}

interface UseOrdersOptions {
  status?: OrderStatus | "all";
  pageSize?: number;
  /** SWR fallback data (from RSC initial render). */
  fallback?: OrdersResponse;
}

export function useOrders(opts: UseOrdersOptions = {}) {
  const [page, setPage] = useQueryState("page", { defaultValue: "1", shallow: true });
  const pageSize = opts.pageSize ?? 25;

  const statusParam = opts.status && opts.status !== "all" ? `&status=${opts.status}` : "";
  const key = `/api/orders?page=${page}&pageSize=${pageSize}${statusParam}`;

  const { data, error, isLoading, mutate } = useSWR<OrdersResponse>(key, fetcher, {
    fallbackData: opts.fallback,
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });

  const currentPage = parseInt(page, 10) || 1;

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
      onPageChange: (p: number) => setPage(String(p)),
      isLoading: isLoading && !!data,
    },
  };
}
