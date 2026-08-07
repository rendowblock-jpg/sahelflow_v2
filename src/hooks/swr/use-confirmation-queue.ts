"use client";

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

  const { data, error, isLoading, mutate } = useSWR<ConfirmationQueueResponse>(
    key,
    fetcher,
    {
      fallbackData: fallback,
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    },
  );

  return {
    data: data ?? fallback,
    error,
    mutate,
    isLoading: isLoading && !data,
    pagination: {
      page: currentPage,
      pageSize,
      total: data?.total ?? fallback.total,
      hasNextPage: data?.hasNextPage ?? fallback.hasNextPage,
      onPageChange: (nextPage: number) => setPage(String(nextPage)),
      isLoading: isLoading && Boolean(data),
    },
  };
}
