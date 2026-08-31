"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * R4-f create deep-link contract.
 *
 * The command palette's create actions navigate to `<surface>?create=1` and
 * the surface's create dialog opens on arrival (`CreateParamDialog`). The URL
 * carries the intent — the link is shareable, survives refresh, and closing
 * the dialog removes the param instead of re-opening it on back/refresh.
 *
 * Permissions stay server-side: each list page renders its create dialog only
 * when the actor's authority allows it, so a create deep link without
 * permission simply lands on the list surface.
 */
export const CREATE_PARAM = "create";
export const CREATE_PARAM_VALUE = "1";

/** Build a create deep-link href for a list surface (e.g. `/orders?create=1`). */
export function buildCreateHref(path: string): string {
  return `${path}?${CREATE_PARAM}=${CREATE_PARAM_VALUE}`;
}

export function isCreateRequested(
  value: string | null | undefined,
): boolean {
  return value === CREATE_PARAM_VALUE;
}

export function useCreateParam(): {
  createRequested: boolean;
  clearCreateParam: () => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const createRequested = isCreateRequested(searchParams.get(CREATE_PARAM));

  // Closing the dialog clears the intent while preserving every other list
  // param (status/q/page/wilaya…) so the seller's list context survives.
  const clearCreateParam = useCallback(() => {
    if (!isCreateRequested(searchParams.get(CREATE_PARAM))) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete(CREATE_PARAM);
    const query = params.toString();
    router.replace(query ? `?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return { createRequested, clearCreateParam };
}
