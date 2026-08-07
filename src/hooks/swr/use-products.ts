"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { useQueryState } from "nuqs";

import { fetcher } from "@/lib/swr/fetcher";
import type {
  ProductWorkbenchItem,
  ProductsWorkbenchResponse,
} from "@/types/workbench";

export type ProductListItem = ProductWorkbenchItem;
export type ProductsResponse = ProductsWorkbenchResponse;

function normalizeSort(raw: string): string {
  switch (raw) {
    case "createdAt.asc":
    case "createdAt.desc":
    case "price.asc":
    case "price.desc":
    case "stock.asc":
    case "stock.desc":
      return raw;
    default:
      return "createdAt.desc";
  }
}

export function useProducts(
  opts: { pageSize?: number; fallback?: ProductsResponse } = {},
) {
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
  const normalizedSort = normalizeSort(sort);
  const key = `/api/products?page=${currentPage}&pageSize=${pageSize}&sort=${encodeURIComponent(normalizedSort)}`;
  const fallbackData =
    opts.fallback &&
    opts.fallback.page === currentPage &&
    opts.fallback.pageSize === pageSize &&
    opts.fallback.sort === normalizedSort
      ? opts.fallback
      : undefined;

  const { data, error, isLoading, mutate } = useSWR<ProductsResponse>(key, fetcher, {
    fallbackData,
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });
  const response = data ?? fallbackData;
  const knownTotal = response?.total ?? opts.fallback?.total;
  const lastPage = Math.max(1, Math.ceil((knownTotal ?? 0) / pageSize));

  useEffect(() => {
    if ((knownTotal ?? 0) > 0 && currentPage > lastPage) {
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
