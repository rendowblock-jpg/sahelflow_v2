import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { customerService } from "@/lib/data";
import { formatDZD } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, AlertTriangle, UserCheck, Download } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { CustomersDataTable } from "@/components/customers/customers-data-table";
import type { Locale } from "@/lib/i18n";
import type { Customer } from "@/types/domain";

// Always fetch fresh data (local-first app, no ISR)
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const { t, locale } = await getI18n();
  const [customers, totalCustomers] = await Promise.all([
    customerService.list({ prisma: db }, { limit: 25, offset: 0 }),
    db.customer.count({ where: { deletedAt: null } }),
  ]);

  const totalSpent = customers.reduce((sum, c) => sum + c.totalSpent, 0);
  const activeCount = customers.filter((c) => c.orderCount > 0).length;
  const atRiskCount = customers.filter((c) => c.riskScore >= 6).length;

  const activePct = totalCustomers > 0 ? Math.round((activeCount / totalCustomers) * 100) : 0;
  const avgSpent = totalCustomers > 0 ? Math.round(totalSpent / totalCustomers) : 0;
  const atRiskPct = totalCustomers > 0 ? Math.round((atRiskCount / totalCustomers) * 100) : 0;

  return (
    <div className="app-content page-sections">
      {/* Header */}
      <PageHeader
        title={t("customers.title")}
        description={t("customers.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <ImportExportButtons exportRoute="/api/export/customers" importRoute="/api/import/customers" />
            <Button variant="outline" size="sm" asChild>
              <Link href="/api/export/customers">
                <Download className="me-1.5 h-4 w-4" />
                {t("customers.export")}
              </Link>
            </Button>
            <CustomerFormDialog />
          </div>
        }
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
          value={formatDZD(totalSpent)}
          icon={<TrendingUp />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-emerald-600 dark:text-emerald-400"
          subtitle={t("customers.avgSpent", { amount: formatDZD(avgSpent) })}
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
          accentIcon="text-red-600 dark:text-red-400"
          trend={atRiskPct > 20 ? -1 : 0}
          trendLabel={atRiskPct > 0 ? t("customers.atRiskPct", { pct: atRiskPct }) : t("customers.noRisk")}
          style={{ animationDelay: "240ms" }}
        />
      </div>

      {/* Customers table (Phase 1: DataTable v2 + SWR + pagination) */}
      <div className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CustomersDataTable
          fallback={{
            customers: customers.map((c: Customer) => ({
              id: c.id,
              name: c.name,
              phone: c.phone,
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
