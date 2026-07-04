"use client";

/**
 * useDeliveries — SWR hook for the paginated deliveries list (DataTable v2).
 *
 * Supports a status filter (via URL `status` param, synced with the page's
 * filter tabs). Page state is URL-synced via nuqs.
 */
import useSWR from "swr";
import { useQueryState } from "nuqs";
import { fetcher } from "@/lib/swr/fetcher";

export interface DeliveryListItem {
  id: string;
  orderId: string;
  provider: string;
  trackingNumber: string | null;
  cost: number | null;
  status: string;
  estimatedDelivery: string | null;
  createdAt: string;
  order: {
    id: string;
    orderNumber: string;
    wilaya: string | null;
    customer: { name: string | null; phone: string | null } | null;
  } | null;
}

export interface DeliveriesResponse {
  deliveries: DeliveryListItem[];
  total: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
}

export function useDeliveries(opts: { pageSize?: number; fallback?: DeliveriesResponse; status?: string } = {}) {
  const [page, setPage] = useQueryState("page", { defaultValue: "1", shallow: true });
  const pageSize = opts.pageSize ?? 25;
  const status = opts.status ?? "all";
  const key = `/api/delivery?page=${page}&pageSize=${pageSize}${status !== "all" ? `&status=${status}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR<DeliveriesResponse>(key, fetcher, {
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
