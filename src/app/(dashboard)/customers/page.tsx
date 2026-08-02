import { getI18n } from "@/lib/i18n-server";
import { db, shopContext } from "@/lib/db";
import { customerService } from "@/lib/data";
import { formatDZD } from "@/lib/utils";
import { Users, TrendingUp, AlertTriangle, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { CustomersDataTable } from "@/components/customers/customers-data-table";
import type { Locale } from "@/lib/i18n";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import { projectCustomersForTrustedActor } from "@/lib/identity/customer-projection";

// Always fetch fresh data (local-first app, no ISR)
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const { t, locale } = await getI18n();
  const actorContext = await requireTrustedAction("customers.read");
  const resource = { shopId: actorContext.shop.shopId };
  const canManage = trustedActionAllowed(
    actorContext,
    "customers.manage",
    resource,
  );
  const canUpdateContact = trustedActionAllowed(
    actorContext,
    "customers.contact.update",
    resource,
  );
  const canReadContact = trustedActionAllowed(
    actorContext,
    "customers.contact.read",
    resource,
  );
  const canReadFinancials = trustedActionAllowed(
    actorContext,
    "orders.financials.read",
    resource,
  );
  const canExport = canReadContact && trustedActionAllowed(
    actorContext,
    "data.export",
    resource,
  );
  const canImport = canManage && canUpdateContact && trustedActionAllowed(
    actorContext,
    "data.import",
    resource,
  );
  const [customers, totalCustomers, aggregate, activeCountAgg, atRiskCountAgg] = await Promise.all([
    customerService.list({ prisma: db, shop: shopContext }, { limit: 25, offset: 0 }),
    db.customer.count({ where: { deletedAt: null } }),
    // Session 30 (AUDIT-5 P1): compute KPIs from aggregate across ALL customers,
    // not just the first 25 on page 1. A seller with 200 customers was seeing
    // KPIs from a 12.5% sample.
    canReadFinancials
      ? db.customer.aggregate({
          where: { deletedAt: null },
          _sum: { totalSpent: true },
        })
      : Promise.resolve({ _sum: { totalSpent: null } }),
    db.customer.count({ where: { deletedAt: null, orderCount: { gt: 0 } } }),
    db.customer.count({ where: { deletedAt: null, riskScore: { gte: 6 } } }),
  ]);

  const totalSpent = aggregate._sum.totalSpent ?? 0;
  const activeCount = activeCountAgg;
  const atRiskCount = atRiskCountAgg;
  const projectedCustomers = projectCustomersForTrustedActor(
    actorContext,
    customers,
  );

  const activePct = totalCustomers > 0 ? Math.round((activeCount / totalCustomers) * 100) : 0;
  const avgSpent = totalCustomers > 0 ? Math.round(totalSpent / totalCustomers) : 0;
  const atRiskPct = totalCustomers > 0 ? Math.round((atRiskCount / totalCustomers) * 100) : 0;

  return (
    <div className="app-content page-sections">
      {/* Header */}
      <PageHeader
        title={t("customers.title")}
        description={t("customers.subtitle")}
        actions={canExport || (canManage && canUpdateContact) ? (
          <div className="flex items-center gap-2">
            {canExport && (
              <ImportExportButtons
                exportRoute="/api/export/customers"
                importRoute={canImport ? "/api/import/customers" : undefined}
              />
            )}
            {canManage && canUpdateContact && <CustomerFormDialog />}
          </div>
        ) : undefined}
      />

      {/* Stat cards — shared premium StatCard component */}
      <div className="card-grid-4 stagger-grid">
        <StatCard
          label={t("customers.totalCustomers")}
          value={totalCustomers}
          icon={<Users />}
          accentBg="bg-teal-500/10 dark:bg-teal-500/15"
          accentIcon="text-teal-600 dark:text-teal-400"
          subtitle={t("customers.activePct", { pct: activePct })}
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("customers.totalSpent")}
          value={canReadFinancials ? formatDZD(totalSpent) : "—"}
          icon={<TrendingUp />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-success"
          subtitle={canReadFinancials
            ? t("customers.avgSpent", { amount: formatDZD(avgSpent) })
            : undefined}
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("customers.activeCustomers")}
          value={activeCount}
          icon={<UserCheck />}
          accentBg="bg-violet-500/10 dark:bg-violet-500/15"
          accentIcon="text-violet-600 dark:text-violet-400"
          subtitle={t("customers.activePct", { pct: activePct })}
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("customers.atRisk")}
          value={atRiskCount}
          icon={<AlertTriangle />}
          accentBg="bg-red-500/10 dark:bg-red-500/15"
          accentIcon="text-destructive"
          trend={atRiskPct > 20 ? -1 : 0}
          trendLabel={atRiskPct > 0 ? t("customers.atRiskPct", { pct: atRiskPct }) : t("customers.noRisk")}
          style={{ animationDelay: "240ms" }}
        />
      </div>

      {/* Customers table (Phase 1: DataTable v2 + SWR + pagination) */}
      <div className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CustomersDataTable
          fallback={{
            customers: projectedCustomers.map((c) => ({
              id: c.id,
              name: c.name ?? t("inbox.restrictedContact"),
              phone: c.phone ?? "—",
              wilaya: c.wilaya,
              commune: c.commune,
              orderCount: c.orderCount,
              totalSpent: c.totalSpent,
              riskScore: c.riskScore,
              isBlacklisted: c.isBlacklisted,
              createdAt: c.createdAt.toISOString(),
            })),
            total: totalCustomers,
            hasNextPage: totalCustomers > 25,
            page: 1,
            pageSize: 25,
          }}
          locale={locale as Locale}
        />
      </div>
    </div>
  );
}
