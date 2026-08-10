"use client";

import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { needsLicensedServerTreeRefresh } from "@/components/license/license-boundary-state";
import { LicensePanel } from "@/components/settings/license-panel";
import { useI18n } from "@/hooks/use-i18n";
import { useLicense } from "@/hooks/use-license";

export function LicenseBoundary({ children }: { children: ReactNode }) {
  const { projection, isLoading } = useLicense();
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <section className="w-full max-w-xl space-y-4" aria-labelledby="license-lockout-title">
        <div className="space-y-1 text-center">
          <h1 id="license-lockout-title" className="text-2xl font-semibold">SahelFlow</h1>
          <p className="text-sm text-muted-foreground">{t("license.lockoutTitle")}</p>
        </div>
        <LicensePanel />
      </section>
    </main>
  );
}
