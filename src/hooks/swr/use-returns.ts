"use client";

/**
 * useReturns — SWR hook for the paginated returns list (DataTable v2).
 */
import useSWR from "swr";
import { useQueryState } from "nuqs";
import { fetcher } from "@/lib/swr/fetcher";

export interface ReturnListItem {
  id: string;
  orderId: string;
  reason: string;
  status: string;
  type: string;
  notes: string | null;
  createdAt: string;
  order: {
    id: string;
    orderNumber: string;
    customer: { name: string | null } | null;
  };
}

export interface ReturnsResponse {
  returns: ReturnListItem[];
  total: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
}

export function useReturns(opts: { pageSize?: number; fallback?: ReturnsResponse } = {}) {
  const [page, setPage] = useQueryState("page", { defaultValue: "1", shallow: true });
  const pageSize = opts.pageSize ?? 25;
  const key = `/api/returns?page=${page}&pageSize=${pageSize}`;

  const { data, error, isLoading, mutate } = useSWR<ReturnsResponse>(key, fetcher, {
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
