"use client";

import useSWR from "swr";
import { useQueryState } from "nuqs";

import { fetcher } from "@/lib/swr/fetcher";
import type { OrderStatus } from "@/types/domain";

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: string;
  source: string;
  mutationAuthority: "canonical_v1" | "legacy_compatibility";
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
  fallback?: OrdersResponse;
}

export function useOrders(opts: UseOrdersOptions = {}) {
  const [page, setPage] = useQueryState("page", {
    defaultValue: "1",
    shallow: true,
  });
  const pageSize = opts.pageSize ?? 25;
  const statusParam =
    opts.status && opts.status !== "all" ? `&status=${opts.status}` : "";
  const key = `/api/orders?page=${page}&pageSize=${pageSize}${statusParam}`;

  const { data, error, isLoading, mutate } = useSWR<OrdersResponse>(
    key,
    fetcher,
    {
      fallbackData: opts.fallback,
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    },
  );
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
      onPageChange: (nextPage: number) => setPage(String(nextPage)),
      isLoading: isLoading && Boolean(data),
    },
  };
}
