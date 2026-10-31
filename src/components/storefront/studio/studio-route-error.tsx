"use client";

import Link from "next/link";

import { PageError } from "@/components/shared/page-error";
import { useI18n } from "@/hooks/use-i18n";

/** A failed Studio route: Retry from PageError, plus a way back that needs no retry to work. */
export function StudioRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-2">
      <PageError error={error} reset={reset} />
      <Link
        href="/storefronts"
        className="inline-flex min-h-11 items-center px-3 text-body-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {t("storefront.studioStates.route.back")}
      </Link>
    </div>
  );
}
