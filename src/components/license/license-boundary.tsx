"use client";

import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import {
  needsLicensedServerTreeRefresh,
  resolveLicenseBoundaryState,
} from "@/components/license/license-boundary-state";
import { LicenseLockout } from "@/components/license/license-lockout";
import { useI18n } from "@/hooks/use-i18n";
import { useLicense } from "@/hooks/use-license";
import type { LicenseClientProjection } from "@/stores/license-store";

export function LicenseBoundary({
  children,
  initialProjection,
}: {
  children: ReactNode;
  /**
   * The server layout's own, already validated projection. It stands in for the
   * first paint only; anything fetched by the client replaces it.
   */
  initialProjection?: LicenseClientProjection;
}) {
  const license = useLicense();
  const { projection, isLoading } = resolveLicenseBoundaryState({
    storeProjection: license.projection,
    storeIsLoading: license.isLoading,
    serverProjection: initialProjection,
  });
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const hasServerChildren = children !== null && children !== undefined;
  const needsServerTreeRefresh = needsLicensedServerTreeRefresh(
    projection?.status,
    hasServerChildren,
  );

  useEffect(() => {
    if (needsServerTreeRefresh) {
      router.refresh();
    }
  }, [needsServerTreeRefresh, router]);

  if (isLoading || needsServerTreeRefresh) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6" role="status">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          {t("license.checking")}
        </div>
      </main>
    );
  }
  if (projection?.status === "valid") return <>{children}</>;
  if (pathname === "/login") return <>{children}</>;

  return <LicenseLockout />;
}
