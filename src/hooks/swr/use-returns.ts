"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { useQueryState } from "nuqs";

import { fetcher } from "@/lib/swr/fetcher";
import type {
  ReturnWorkbenchItem,
  ReturnWorkbenchResponse,
} from "@/lib/returns/return-workbench";

export type ReturnListItem = ReturnWorkbenchItem;
export type ReturnsResponse = ReturnWorkbenchResponse;

export function useReturns(
  opts: { pageSize?: number; fallback?: ReturnsResponse } = {},
) {
  const [page, setPage] = useQueryState("page", {
    defaultValue: "1",
    shallow: true,
  });
  const currentPage = Number.parseInt(page, 10) || 1;
  const pageSize = opts.pageSize ?? 25;
  const key = `/api/returns?page=${currentPage}&pageSize=${pageSize}`;
  const fallbackData =
    opts.fallback &&
    opts.fallback.page === currentPage &&
    opts.fallback.pageSize === pageSize
      ? opts.fallback
      : undefined;
  const { data, error, isLoading, mutate } = useSWR<ReturnsResponse>(key, fetcher, {
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
