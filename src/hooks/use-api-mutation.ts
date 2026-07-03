"use client";

/**
 * useApiMutation — wraps a fetch mutation with loading state + error handling
 * + toast fallback (Dub.co pattern).
 *
 * Eliminates the manual `try/catch + toast.success/error + router.refresh()`
 * boilerplate repeated 92+ times across the codebase. Provides:
 *   - `isSubmitting` state
 *   - optional `onSuccess` / `onError` callbacks
 *   - fallback `toast.error(errorMessage)` if no onError given
 *   - optional `successMessage` for auto toast.success
 *
 * Usage:
 *   const mutation = useApiMutation({
 *     successMessage: t("orders.bulkSuccess"),
 *     onSuccess: () => mutatePrefix("/api/orders"),
 *   });
 *   await mutation.submit("/api/orders/bulk", { method: "POST", body: JSON.stringify({...}) });
 *
 * For optimistic updates, pair with SWR's `mutate(..., { optimisticData, rollbackOnError })`.
 */
import { useCallback, useState } from "react";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/swr/fetcher";

interface UseApiMutationOptions {
  /** Auto-show this toast on success (skip if you want custom handling). */
  successMessage?: string;
  /** Called on success (e.g. `() => mutatePrefix("/api/orders")`). */
  onSuccess?: (data: unknown) => void;
  /** Called on error. If omitted, auto-shows toast.error. */
  onError?: (error: Error) => void;
  /** Suppress the auto error toast (use with onError). */
  suppressErrorToast?: boolean;
}

interface UseApiMutationResult {
  isSubmitting: boolean;
  error: Error | null;
  submit: (url: string, init?: RequestInit) => Promise<unknown>;
}

export function useApiMutation(
  options: UseApiMutationOptions = {},
): UseApiMutationResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const submit = useCallback(
    async (url: string, init?: RequestInit) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const res = await fetch(url, {
          credentials: "same-origin",
          ...init,
          headers: {
            Accept: "application/json",
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...init?.headers,
          },
        });

        let data: unknown = null;
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          data = await res.json();
        }

        if (!res.ok) {
          const msg =
            (data as { error?: { message?: string } | string })?.error
              ? typeof (data as { error: { message?: string } | string }).error === "string"
                ? ((data as { error: string }).error)
                : ((data as { error: { message?: string } }).error?.message ?? `Request failed (${res.status})`)
              : `Request failed (${res.status})`;
          throw new ApiError(msg, res.status);
        }

        if (options.successMessage) {
          toast.success(options.successMessage);
        }
        options.onSuccess?.(data);
        return data;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        if (options.onError) {
          options.onError(e);
        } else if (!options.suppressErrorToast) {
          toast.error(e.message);
        }
        throw e;
      } finally {
        setIsSubmitting(false);
      }
    },
    [options],
  );

  return { isSubmitting, error, submit };
}
