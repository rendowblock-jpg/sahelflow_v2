import type { Metadata } from "next";

import { CanonicalCodDashboard } from "@/components/accounting/canonical-cod-dashboard";
import { PageHeader } from "@/components/shared/page-header";
import { getCanonicalCodWorkspaceSummary } from "@/lib/accounting/canonical-cod-projections";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.codReconciliation") };
}

export default async function CodReconciliationPage() {
  const { t } = await getI18n();
  const summary = await getCanonicalCodWorkspaceSummary({
    prisma: db,
    shop: shopContext,
  });

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("codReconciliation.title")}
        description={t("codReconciliation.description")}
      />
      <CanonicalCodDashboard summary={summary} />
    </div>
  );
}
