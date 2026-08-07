import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, TrendingUp, UserCheck, Users } from "lucide-react";

import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { CustomersDataTable } from "@/components/customers/customers-data-table";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import {
  getCustomerWorkbenchSummary,
  getCustomersWorkbenchPage,
} from "@/lib/customers/customer-workbench";
import { formatDZD } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.customers") };
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actorContext = await requireTrustedAction("customers.read");
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const [fallback, summary] = await Promise.all([
    getCustomersWorkbenchPage(actorContext, { page, pageSize: 25 }),
    getCustomerWorkbenchSummary(actorContext),
  ]);
  const lastPage = Math.max(1, Math.ceil(fallback.total / fallback.pageSize));
  if (page > lastPage) redirect(`/customers?page=${lastPage}`);

  const access = fallback.fieldAccess;
  const activePct = summary.totalCustomers > 0
    ? Math.round((summary.activeCustomers / summary.totalCustomers) * 100)
    : 0;
  const avgSpent =
    summary.totalSpent !== null && summary.totalCustomers > 0
      ? Math.round(summary.totalSpent / summary.totalCustomers)
      : null;
  const atRiskPct =
    summary.atRiskCustomers !== null && summary.totalCustomers > 0
      ? Math.round((summary.atRiskCustomers / summary.totalCustomers) * 100)
      : null;

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("customers.title")}
        description={t("customers.subtitle")}
        actions={
          access.export || access.import || (access.manage && access.contactUpdate) ? (
            <div className="flex flex-wrap items-center gap-2">
              {access.export || access.import ? (
                <ImportExportButtons
                  exportRoute={access.export ? "/api/export/customers" : undefined}
                  importRoute={access.import ? "/api/import/customers" : undefined}
                />
              ) : null}
              {access.manage && access.contactUpdate ? <CustomerFormDialog /> : null}
            </div>
          ) : undefined
        }
      />

      <div className="card-grid-4">
        <StatCard
          label={t("customers.totalCustomers")}
          value={summary.totalCustomers}
          icon={<Users />}
          subtitle={t("customers.activePct", { pct: activePct })}
        />
        <StatCard
          label={t("customers.totalSpent")}
          value={summary.totalSpent === null ? "—" : formatDZD(summary.totalSpent, locale)}
          icon={<TrendingUp />}
          subtitle={avgSpent === null ? undefined : t("customers.avgSpent", { amount: formatDZD(avgSpent, locale) })}
        />
        <StatCard
          label={t("customers.activeCustomers")}
          value={summary.activeCustomers}
          icon={<UserCheck />}
          subtitle={t("customers.activePct", { pct: activePct })}
        />
        <StatCard
          label={t("customers.atRisk")}
          value={summary.atRiskCustomers ?? "—"}
          icon={<AlertTriangle />}
          trend={atRiskPct !== null && atRiskPct > 20 ? -1 : 0}
          trendLabel={atRiskPct === null ? undefined : atRiskPct > 0 ? t("customers.atRiskPct", { pct: atRiskPct }) : t("customers.noRisk")}
        />
      </div>

      <CustomersDataTable fallback={fallback} locale={locale} />
    </div>
  );
}
