import { redirect } from "next/navigation";
import { AlertTriangle, TrendingUp, UserCheck, Users } from "lucide-react";

import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { CustomersDataTable } from "@/components/customers/customers-data-table";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import {
  getCustomersWorkbenchPage,
  getCustomerWorkbenchSummary,
  resolveCustomerWorkbenchAccess,
} from "@/lib/customers/customer-workbench";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { formatDZD } from "@/lib/utils";

export const dynamic = "force-dynamic";

type CustomersPageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const { t, locale } = await getI18n();
  const actorContext = await requireTrustedAction("customers.read");
  const access = resolveCustomerWorkbenchAccess(actorContext);
  const requestedPage = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;

  const [fallback, summary] = await Promise.all([
    getCustomersWorkbenchPage(actorContext, { page, pageSize: 25 }),
    getCustomerWorkbenchSummary(actorContext),
  ]);
  const lastPage = Math.max(1, Math.ceil(fallback.total / fallback.pageSize));
  if (page > lastPage) redirect(`/customers?page=${lastPage}`);

  const activePct = summary.total > 0
    ? Math.round((summary.active / summary.total) * 100)
    : 0;
  const avgSpent =
    summary.total > 0 && summary.totalSpent !== null
      ? Math.round(summary.totalSpent / summary.total)
      : null;
  const atRiskPct =
    summary.total > 0 && summary.atRisk !== null
      ? Math.round((summary.atRisk / summary.total) * 100)
      : null;
  const canCreate = access.manage && access.contactUpdate;

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("customers.title")}
        description={t("customers.subtitle")}
        actions={access.export || access.import || canCreate ? (
          <div className="flex flex-wrap items-center gap-2">
            {access.export || access.import ? (
              <ImportExportButtons
                exportRoute={access.export ? "/api/export/customers" : undefined}
                importRoute={access.import ? "/api/import/customers" : undefined}
              />
            ) : null}
            {canCreate ? <CustomerFormDialog /> : null}
          </div>
        ) : undefined}
      />

      <div className="card-grid-4">
        <StatCard
          label={t("customers.totalCustomers")}
          value={summary.total}
          icon={<Users />}
          subtitle={t("customers.activePct", { pct: activePct })}
        />
        <StatCard
          label={t("customers.totalSpent")}
          value={summary.totalSpent === null ? "—" : formatDZD(summary.totalSpent, locale)}
          icon={<TrendingUp />}
          subtitle={
            avgSpent === null
              ? undefined
              : t("customers.avgSpent", { amount: formatDZD(avgSpent, locale) })
          }
        />
        <StatCard
          label={t("customers.activeCustomers")}
          value={summary.active}
          icon={<UserCheck />}
          subtitle={t("customers.activePct", { pct: activePct })}
        />
        <StatCard
          label={t("customers.atRisk")}
          value={summary.atRisk ?? "—"}
          icon={<AlertTriangle />}
          trend={atRiskPct !== null && atRiskPct > 20 ? -1 : 0}
          trendLabel={
            atRiskPct === null
              ? undefined
              : atRiskPct > 0
                ? t("customers.atRiskPct", { pct: atRiskPct })
                : t("customers.noRisk")
          }
        />
      </div>

      <CustomersDataTable
        fallback={{
          ...fallback,
          customers: fallback.customers.map((customer) => ({
            ...customer,
            createdAt:
              customer.createdAt instanceof Date
                ? customer.createdAt.toISOString()
                : customer.createdAt,
          })),
        }}
        locale={locale}
      />
    </div>
  );
}
