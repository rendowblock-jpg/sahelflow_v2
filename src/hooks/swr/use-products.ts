"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import { useQueryState } from "nuqs";

import { fetcher } from "@/lib/swr/fetcher";
import type {
  ProductWorkbenchItem,
  ProductsWorkbenchResponse,
} from "@/types/workbench";

export type ProductListItem = ProductWorkbenchItem;
export type ProductsResponse = ProductsWorkbenchResponse;

export function useProducts(
  opts: { pageSize?: number; fallback?: ProductsResponse } = {},
) {
  const [page, setPage] = useQueryState("page", {
    defaultValue: "1",
    shallow: true,
  });
  const [q] = useQueryState("q", { defaultValue: "", shallow: true });
  const currentPage = Number.parseInt(page, 10) || 1;
  const pageSize = opts.pageSize ?? 25;
  const trimmedQ = q.trim();
  const qParam = trimmedQ ? `&q=${encodeURIComponent(trimmedQ)}` : "";
  const key = `/api/products?page=${currentPage}&pageSize=${pageSize}${qParam}`;
  const applied = opts.fallback?.appliedFilters;
  const filtersMatch = (applied?.q ?? null) === (trimmedQ || null);
  const fallbackData =
    opts.fallback &&
    filtersMatch &&
    opts.fallback.page === currentPage &&
    opts.fallback.pageSize === pageSize
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
    if (knownTotal !== undefined && currentPage > lastPage) {
      void setPage(String(lastPage));
    }
  }, [currentPage, knownTotal, lastPage, setPage]);

  // A new search scope must restart from the first page.
  const prevQRef = useRef(trimmedQ);
  useEffect(() => {
    if (prevQRef.current === trimmedQ) return;
    prevQRef.current = trimmedQ;
    if (currentPage !== 1) {
      void setPage("1");
    }
  }, [trimmedQ, currentPage, setPage]);

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
    },
  };
}
