"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { useQueryState } from "nuqs";

import { fetcher } from "@/lib/swr/fetcher";
import type { ConfirmationQueueResponse } from "@/types/workbench";

interface UseConfirmationQueueOptions {
  pageSize?: number;
  fallback: ConfirmationQueueResponse;
}

export function useConfirmationQueue({
  pageSize = 25,
  fallback,
}: UseConfirmationQueueOptions) {
  const [page, setPage] = useQueryState("page", {
    defaultValue: "1",
    shallow: true,
  });
  const currentPage = Number.parseInt(page, 10) || 1;
  const key = `/api/orders/confirmation-queue?page=${currentPage}&pageSize=${pageSize}`;
  const fallbackData =
    fallback.page === currentPage && fallback.pageSize === pageSize
      ? fallback
      : undefined;

  const { data, error, isLoading, mutate } = useSWR<ConfirmationQueueResponse>(
    key,
    fetcher,
    {
      fallbackData,
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    },
  );
  const response = data ?? fallbackData;
  const knownTotal = response?.total ?? fallback.total;
  const lastPage = Math.max(1, Math.ceil(knownTotal / pageSize));

  useEffect(() => {
    if (knownTotal > 0 && currentPage > lastPage) {
      void setPage(String(lastPage));
    }
  }, [currentPage, knownTotal, lastPage, setPage]);

  return {
    data: response,
    error,
    mutate,
    isLoading: isLoading && !response,
    pagination: {
      page: currentPage,
      pageSize,
      total: knownTotal,
      hasNextPage:
        response?.hasNextPage ?? currentPage * pageSize < knownTotal,
      onPageChange: (nextPage: number) => setPage(String(nextPage)),
      isLoading,
    },
  };
}
