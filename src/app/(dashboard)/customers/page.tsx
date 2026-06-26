import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { customerService } from "@/lib/data";
import { formatDZD } from "@/lib/utils";
import { getRiskConfig } from "@/lib/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Eye, TrendingUp, AlertTriangle, UserCheck, Download } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { CustomerRowActions } from "@/components/customers/customer-row-actions";
import type { Customer } from "@/types/domain";

// Always fetch fresh data (local-first app, no ISR)
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const { t } = await getI18n();
  const customers = await customerService.list({ prisma: db });

  const totalCustomers = customers.length;
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
      <div className="stagger-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("customers.totalCustomers")}
          value={totalCustomers}
          icon={<Users />}
          accentBg="bg-sky-500/10 dark:bg-sky-500/15"
          accentIcon="text-sky-600 dark:text-sky-400"
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

      {/* Customers table — upgraded with shared status/risk configs */}
      <Card className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardHeader>
          <CardTitle className="text-base">{t("customers.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-5 mb-5 ring-1 ring-primary/10">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-1">{t("customers.noCustomers")}</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                {t("customers.noCustomersDesc")}
              </p>
              <CustomerFormDialog />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("customers.name")}</TableHead>
                  <TableHead>{t("customers.phone")}</TableHead>
                  <TableHead>{t("customers.location")}</TableHead>
                  <TableHead className="text-end">{t("customers.ordersCount")}</TableHead>
                  <TableHead className="text-end">{t("customers.spent")}</TableHead>
                  <TableHead>{t("customers.risk")}</TableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer: Customer) => {
                  const riskConfig = getRiskConfig(customer.riskScore * 10); // Scale 0-100
                  return (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell className="font-mono text-sm">{customer.phone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {customer.wilaya ?? "—"}
                        {customer.commune ? ` · ${customer.commune}` : ""}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {customer.orderCount}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatDZD(customer.totalSpent)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${riskConfig.color} bg-muted/50 border-border`}>
                          {t(riskConfig.i18nKey)} · {customer.riskScore}
                        </span>
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" asChild>
                            <Link href={`/customers/${customer.id}`}>
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">{t("customers.customerDetails")}</span>
                            </Link>
                          </Button>
                          <CustomerRowActions customer={customer} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
