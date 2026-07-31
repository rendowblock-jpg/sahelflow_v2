import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDZD, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PremiumTable } from "@/components/shared/premium-table";
import { DualBarChart } from "@/components/charts/dual-bar-chart";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import type { ExpenseCategory } from "@/lib/validation";
import {
  getProfitabilityProjection,
  getProfitabilitySeries,
} from "@/lib/accounting/profitability";
import { ExpenseFormDialog } from "@/components/accounting/expense-form-dialog";
import { ExpenseRowActions } from "@/components/accounting/expense-row-actions";
import {
  TrendingUp,
  Wallet,
  Receipt,
  Package,
  PiggyBank,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.accounting") };
}
export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const { t, locale } = await getI18n();
  const dateLocale = locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-FR";

  // Fetch orders + expenses for the last 30 days (rolling window).
  // Was: current calendar month — but on the 1st of a month this is empty even
  // when the seller had a full prior month of activity, making the page look
  // broken. A rolling 30-day window always reflects recent performance.
  const now = new Date();
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const period = { from: periodStart, to: now };
  const [expenses, profitability] = await Promise.all([
    db.expense.findMany({
      where: { date: { gte: periodStart, lt: now }, deletedAt: null },
      orderBy: { date: "desc" },
    }),
    getProfitabilityProjection(db, period),
  ]);

  const revenue = profitability.netRevenue;
  const cogs = profitability.cogs;
  const hasMissingCosts = !profitability.profitabilityComplete;
  const totalExpenses =
    profitability.courierFees +
    profitability.inventoryLosses +
    profitability.operatingExpenses -
    profitability.settlementAdjustments;
  const netProfit = profitability.netProfit;

  // Monthly data for chart (last 6 months)
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return date;
  });

  const monthlySeries = await getProfitabilitySeries(
    db,
    last6Months.map((date) => ({
      key: `${date.getFullYear()}-${date.getMonth() + 1}`,
      period: {
        from: date,
        to: new Date(date.getFullYear(), date.getMonth() + 1, 1),
      },
    })),
  );
  const monthlyByKey = new Map(
    monthlySeries.map((entry) => [entry.key, entry.projection]),
  );
  const monthlyData = last6Months.map((date) => {
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    const month = monthlyByKey.get(key);
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

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.accounting")}
        description={`${t("accounting.subtitle")} — ${periodStart.toLocaleDateString(dateLocale, { day: "numeric", month: "short" })} – ${now.toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}`}
        actions={<div className="flex items-center gap-2"><ImportExportButtons exportRoute="/api/export/expenses" importRoute={undefined} /><ExpenseFormDialog /></div>}
      />

      {/* COGS warning — some products have no cost price set */}
      {hasMissingCosts && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/50">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {t("accounting.missingCostsWarning")}
          </p>
        </div>
      )}

      {/* P&L Summary — upgraded with accent icons */}
      <div className="card-grid-4 stagger-grid">
        <StatCard
          label={t("accounting.netRevenue")}
          value={formatDZD(revenue)}
          icon={<TrendingUp />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-success"
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("accounting.cogs")}
          value={formatDZD(cogs)}
          icon={<Package />}
          accentBg="bg-orange-500/10 dark:bg-orange-500/15"
          accentIcon="text-orange-600 dark:text-orange-400"
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("accounting.expenses")}
          value={formatDZD(totalExpenses)}
          icon={<Receipt />}
          accentBg="bg-red-500/10 dark:bg-red-500/15"
          accentIcon="text-destructive"
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("accounting.netProfit")}
          value={formatDZD(netProfit)}
          icon={<Wallet />}
          accentBg={netProfit >= 0 ? "bg-emerald-500/10 dark:bg-emerald-500/15" : "bg-red-500/10 dark:bg-red-500/15"}
          accentIcon={netProfit >= 0 ? "text-success" : "text-destructive"}
          trend={netProfit > 0 ? 1 : -1}
          trendLabel={netProfit > 0 ? t("accounting.profit") : t("accounting.loss")}
          style={{ animationDelay: "240ms" }}
        />
      </div>

      {/* Revenue vs Expenses chart */}
      <Card className="shadow-xs hover:shadow-md transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex size-7 items-center justify-center rounded-lg bg-violet-500/10 dark:bg-violet-500/15">
              <PiggyBank className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            {t("accounting.revenueVsExpenses")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DualBarChart data={monthlyData} revenueLabel={t("accounting.revenue")} expensesLabel={t("accounting.expenses")} />
        </CardContent>
      </Card>

      {/* Recent expenses — full CRUD table */}
      <Card className="shadow-xs hover:shadow-md transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] animate-fade-up" style={{ animationDelay: "300ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex size-7 items-center justify-center rounded-lg bg-destructive/10 dark:bg-destructive/15">
              <CreditCard className="h-3.5 w-3.5 text-destructive" />
            </div>
            {t("accounting.recentExpenses")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-5 mb-5 ring-1 ring-primary/10">
                <Receipt className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("accounting.noExpenses")}
              </p>
            </div>
          ) : (
            <PremiumTable>
              <PremiumTable.Header>
                <PremiumTable.Row>
                  <PremiumTable.Head>{t("accounting.expenseDate")}</PremiumTable.Head>
                  <PremiumTable.Head>{t("accounting.expenseCategory")}</PremiumTable.Head>
                  <PremiumTable.Head align="end">{t("accounting.expenseAmount")}</PremiumTable.Head>
                  <PremiumTable.Head hideOn="md">{t("accounting.expenseNotes")}</PremiumTable.Head>
                  <PremiumTable.Head align="end" width="w-20">{t("common.actions")}</PremiumTable.Head>
                </PremiumTable.Row>
              </PremiumTable.Header>
              <PremiumTable.Body>
                {expenses.map((expense) => (
                  <PremiumTable.Row key={expense.id}>
                    <PremiumTable.Cell className="text-muted-foreground">
                      {formatDate(expense.date, locale)}
                    </PremiumTable.Cell>
                    <PremiumTable.Cell className="font-medium">
                      {t(`accounting.category.${expense.category}`)}
                    </PremiumTable.Cell>
                    <PremiumTable.Cell align="end" className="font-medium text-destructive tabular-nums">
                      −{formatDZD(expense.amount)}
                    </PremiumTable.Cell>
                    <PremiumTable.Cell hideOn="md" className="max-w-xs text-muted-foreground">
                      {expense.notes ?? "—"}
                    </PremiumTable.Cell>
                    <PremiumTable.Cell align="end">
                      <ExpenseRowActions
                        expense={{
                          id: expense.id,
                          category: expense.category as ExpenseCategory,
                          amount: expense.amount,
                          date: expense.date.toISOString(),
                          notes: expense.notes,
                        }}
                      />
                    </PremiumTable.Cell>
                  </PremiumTable.Row>
                ))}
              </PremiumTable.Body>
            </PremiumTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
