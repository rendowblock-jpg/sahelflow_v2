"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
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

// React renders the server snapshot (false) while it hydrates and switches to the
// client snapshot (true) right after, so the first client render equals the server HTML.
const subscribeNever = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

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
  // The server copy may stand in only once the client has taken over. The first
  // client render has to equal the server HTML (the loading surface, as before):
  // rendering the licensed workspace during hydration made React hydrate page
  // content the server never rendered, and let `data-sf-hydrated` flip before
  // that content was interactive.
  const mounted = useSyncExternalStore(
    subscribeNever,
    clientSnapshot,
    serverSnapshot,
  );
  const { projection, isLoading } = resolveLicenseBoundaryState({
    storeProjection: license.projection,
    storeIsLoading: license.isLoading,
    serverProjection: mounted ? initialProjection : undefined,
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
