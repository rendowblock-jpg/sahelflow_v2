import type { Metadata } from "next";
import { AlertTriangle, Package, Receipt, TrendingUp, Wallet } from "lucide-react";

import { ExpenseFormDialog } from "@/components/accounting/expense-form-dialog";
import { ExpenseRowActions } from "@/components/accounting/expense-row-actions";
import { DualBarChart } from "@/components/charts/dual-bar-chart";
import { ChartCard } from "@/components/charts/chart-primitives";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { PageHeader } from "@/components/shared/page-header";
import { StateSurface } from "@/components/shared/state-surface";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getProfitabilityProjection,
  getProfitabilitySeries,
} from "@/lib/accounting/profitability";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import { formatDZD, formatDate } from "@/lib/utils";
import type { ExpenseCategory } from "@/lib/validation";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.accounting") };
}
export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const actorContext = await requireTrustedAction("accounting.read");
  const { t, locale } = await getI18n();
  const resource = { shopId: actorContext.shop.shopId };
  const can = (action: Parameters<typeof trustedActionAllowed>[1]) =>
    trustedActionAllowed(actorContext, action, resource);
  const canReadProfitability =
    can("orders.financials.read") && can("products.cost.read");
  const canUpdate = can("accounting.update");
  const canExport = can("data.export");
  const dateLocale = locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-FR";
  const now = new Date();
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const period = { from: periodStart, to: now };
  const last6Months = Array.from({ length: 6 }, (_, index) =>
    new Date(now.getFullYear(), now.getMonth() - (5 - index), 1),
  );

  const [expenses, profitability, monthlySeries] = await Promise.all([
    db.expense.findMany({
      where: { date: { gte: periodStart, lt: now }, deletedAt: null },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    }),
    canReadProfitability
      ? getProfitabilityProjection(db, period)
      : Promise.resolve(null),
    canReadProfitability
      ? getProfitabilitySeries(
          db,
          last6Months.map((date) => ({
            key: `${date.getFullYear()}-${date.getMonth() + 1}`,
            period: {
              from: date,
              to: new Date(date.getFullYear(), date.getMonth() + 1, 1),
            },
          })),
        )
      : Promise.resolve([]),
  ]);

  const monthlyByKey = new Map(
    monthlySeries.map((entry) => [entry.key, entry.projection]),
  );
  const monthlyData = last6Months.map((date) => {
    const month = monthlyByKey.get(`${date.getFullYear()}-${date.getMonth() + 1}`);
    return {
      month: date.toLocaleDateString(dateLocale, { month: "short" }),
      revenue: month?.netRevenue ?? 0,
      expenses:
        (month?.cogs ?? 0) +
        (month?.courierFees ?? 0) +
        (month?.inventoryLosses ?? 0) +
        (month?.operatingExpenses ?? 0) -
        (month?.settlementAdjustments ?? 0),
    };
  });
  const totalExpenses = profitability
    ? profitability.courierFees +
      profitability.inventoryLosses +
      profitability.operatingExpenses -
      profitability.settlementAdjustments
    : null;

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.accounting")}
        description={`${t("accounting.subtitle")} — ${periodStart.toLocaleDateString(dateLocale, { day: "numeric", month: "short" })} – ${now.toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}`}
        actions={canExport || canUpdate ? (
          <div className="flex flex-wrap items-center gap-2">
            {canExport ? <ImportExportButtons exportRoute="/api/export/expenses" /> : null}
            {canUpdate ? <ExpenseFormDialog /> : null}
          </div>
        ) : undefined}
      />

      {!canReadProfitability ? (
        <StateSurface
          icon={Wallet}
          title={t("error.forbidden")}
          description={t("accounting.subtitle")}
          tone="warning"
          size="inline"
        />
      ) : profitability ? (
        <>
          {!profitability.profitabilityComplete ? (
            <StateSurface
              icon={AlertTriangle}
              title={t("accounting.missingCostsWarning")}
              tone="warning"
              size="inline"
            />
          ) : null}

          <div className="card-grid-4">
            <StatCard label={t("accounting.netRevenue")} value={formatDZD(profitability.netRevenue, locale)} icon={<TrendingUp />} />
            <StatCard label={t("accounting.cogs")} value={formatDZD(profitability.cogs, locale)} icon={<Package />} />
            <StatCard label={t("accounting.expenses")} value={formatDZD(totalExpenses ?? 0, locale)} icon={<Receipt />} />
            <StatCard
              label={t("accounting.netProfit")}
              value={formatDZD(profitability.netProfit, locale)}
              icon={<Wallet />}
              trend={profitability.netProfit > 0 ? 1 : profitability.netProfit < 0 ? -1 : 0}
              trendLabel={profitability.netProfit >= 0 ? t("accounting.profit") : t("accounting.loss")}
            />
          </div>

          <ChartCard
            title={t("accounting.revenueVsExpenses")}
            summary={`${t("accounting.netRevenue")}: ${formatDZD(profitability.netRevenue, locale)} · ${t("accounting.expenses")}: ${formatDZD(totalExpenses ?? 0, locale)}`}
            icon={<TrendingUp className="size-4" />}
            config={{}}
          >
            <DualBarChart
              data={monthlyData}
              revenueLabel={t("accounting.revenue")}
              expensesLabel={t("accounting.expenses")}
            />
          </ChartCard>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("accounting.recentExpenses")}</CardTitle>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <StateSurface
              icon={Receipt}
              title={t("accounting.noExpenses")}
              tone="neutral"
              size="inline"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("accounting.expenseDate")}</TableHead>
                    <TableHead>{t("accounting.expenseCategory")}</TableHead>
                    <TableHead className="text-end">{t("accounting.expenseAmount")}</TableHead>
                    <TableHead>{t("accounting.expenseNotes")}</TableHead>
                    {canUpdate ? <TableHead className="text-end">{t("common.actions")}</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="text-muted-foreground">{formatDate(expense.date, locale)}</TableCell>
                      <TableCell className="font-medium">{t(`accounting.category.${expense.category}`)}</TableCell>
                      <TableCell className="text-end font-medium tabular-nums">−{formatDZD(expense.amount, locale)}</TableCell>
                      <TableCell className="max-w-xs text-muted-foreground">{expense.notes ?? "—"}</TableCell>
                      {canUpdate ? (
                        <TableCell className="text-end">
                          <ExpenseRowActions
                            expense={{
                              id: expense.id,
                              category: expense.category as ExpenseCategory,
                              amount: expense.amount,
                              date: expense.date.toISOString(),
                              notes: expense.notes,
                            }}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
