"use client";

/**
 * useProducts — SWR hook for the paginated products list (DataTable v2).
 *
 * Mirrors the useCustomers / useOrders pattern: URL-synced page state via
 * nuqs, SWR for data fetching with server-rendered fallback, pagination
 * metadata for the DataTable footer.
 */
import useSWR from "swr";
import { useQueryState } from "nuqs";
import { fetcher } from "@/lib/swr/fetcher";

export interface ProductListItem {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  cost: number | null;
  stock: number;
  lowStockThreshold: number;
  categoryId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ProductsResponse {
  products: ProductListItem[];
  total: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
}

export function useProducts(opts: { pageSize?: number; fallback?: ProductsResponse } = {}) {
  const [page, setPage] = useQueryState("page", { defaultValue: "1", shallow: true });
  const pageSize = opts.pageSize ?? 25;
  const key = `/api/products?page=${page}&pageSize=${pageSize}`;

  const { data, error, isLoading, mutate } = useSWR<ProductsResponse>(key, fetcher, {
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
