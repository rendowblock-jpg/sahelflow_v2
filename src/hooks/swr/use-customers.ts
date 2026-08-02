"use client";

import useSWR from "swr";
import { useQueryState } from "nuqs";
import { fetcher } from "@/lib/swr/fetcher";

export interface CustomerListItem {
  id: string;
  name: string | null;
  phone: string | null;
  wilaya: string | null;
  commune: string | null;
  orderCount: number;
  totalSpent: number | null;
  riskScore: number;
  isBlacklisted: boolean;
  createdAt: string;
}

export interface CustomersResponse {
  customers: CustomerListItem[];
  total: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
}

export function useCustomers(opts: { pageSize?: number; fallback?: CustomersResponse } = {}) {
  const [page, setPage] = useQueryState("page", { defaultValue: "1", shallow: true });
  const pageSize = opts.pageSize ?? 25;
  const key = `/api/customers?page=${page}&pageSize=${pageSize}`;

  const { data, error, isLoading, mutate } = useSWR<CustomersResponse>(key, fetcher, {
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
