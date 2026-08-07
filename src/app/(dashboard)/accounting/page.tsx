import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, Package, Receipt, TrendingUp, Wallet } from "lucide-react";

import { ExpenseFormDialog } from "@/components/accounting/expense-form-dialog";
import { ExpensesDataTable } from "@/components/accounting/expenses-data-table";
import { DualBarChart } from "@/components/charts/dual-bar-chart";
import { ChartCard } from "@/components/charts/chart-primitives";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import {
  getProfitabilityProjection,
  getProfitabilitySeries,
} from "@/lib/accounting/profitability";
import { getExpensesWorkbenchPage } from "@/lib/accounting/expense-workbench";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { formatDZD } from "@/lib/utils";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { const { t } = await getI18n(); return { title: t("metadata.title.accounting") }; }

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actorContext = await requireTrustedAction("accounting.read");
  const { t, locale } = await getI18n();
  const dateLocale = locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-FR";
  const now = new Date();
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const period = { from: periodStart, to: now };
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);
  const [fallback, profitability] = await Promise.all([
    getExpensesWorkbenchPage(actorContext, { page, pageSize: 25, from: periodStart, to: now }),
    getProfitabilityProjection(db, period),
  ]);
  const lastPage = Math.max(1, Math.ceil(fallback.total / fallback.pageSize));
  if (page > lastPage) redirect(`/accounting?page=${lastPage}`);

  const last6Months = Array.from({ length: 6 }, (_, index) => new Date(now.getFullYear(), now.getMonth() - (5 - index), 1));
  const monthlySeries = await getProfitabilitySeries(db, last6Months.map((date) => ({ key: `${date.getFullYear()}-${date.getMonth() + 1}`, period: { from: date, to: new Date(date.getFullYear(), date.getMonth() + 1, 1) } })));
  const monthlyByKey = new Map(monthlySeries.map((entry) => [entry.key, entry.projection]));
  const monthlyData = last6Months.map((date) => { const month = monthlyByKey.get(`${date.getFullYear()}-${date.getMonth() + 1}`); return { month: date.toLocaleDateString(dateLocale, { month: "short" }), revenue: month?.netRevenue ?? 0, expenses: (month?.cogs ?? 0) + (month?.courierFees ?? 0) + (month?.inventoryLosses ?? 0) + (month?.operatingExpenses ?? 0) - (month?.settlementAdjustments ?? 0) }; });
  const totalExpenses = profitability.courierFees + profitability.inventoryLosses + profitability.operatingExpenses - profitability.settlementAdjustments;
  const access = fallback.fieldAccess;
  const rangeFrom = periodStart.toISOString();
  const rangeTo = now.toISOString();

  return (
    <div className="app-content page-sections">
      <PageHeader title={t("nav.accounting")} description={`${t("accounting.subtitle")} — ${periodStart.toLocaleDateString(dateLocale, { day: "numeric", month: "short" })} – ${now.toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}`} actions={access.update || access.export ? <div className="flex flex-wrap items-center gap-2">{access.export ? <ImportExportButtons exportRoute="/api/export/expenses" /> : null}{access.update ? <ExpenseFormDialog /> : null}</div> : undefined} />
      {!profitability.profitabilityComplete ? <div className="flex items-start gap-3 rounded-md border border-warning/25 bg-warning/[0.04] p-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /><p className="text-sm text-muted-foreground">{t("accounting.missingCostsWarning")}</p></div> : null}
      <div className="card-grid-4"><StatCard label={t("accounting.netRevenue")} value={formatDZD(profitability.netRevenue, locale)} icon={<TrendingUp />} /><StatCard label={t("accounting.cogs")} value={formatDZD(profitability.cogs, locale)} icon={<Package />} /><StatCard label={t("accounting.expenses")} value={formatDZD(totalExpenses, locale)} icon={<Receipt />} /><StatCard label={t("accounting.netProfit")} value={formatDZD(profitability.netProfit, locale)} icon={<Wallet />} trend={profitability.netProfit > 0 ? 1 : profitability.netProfit < 0 ? -1 : 0} trendLabel={profitability.netProfit > 0 ? t("accounting.profit") : profitability.netProfit < 0 ? t("accounting.loss") : undefined} /></div>
      <ChartCard title={t("accounting.revenueVsExpenses")} summary={`${t("accounting.netRevenue")}: ${formatDZD(profitability.netRevenue, locale)} · ${t("accounting.expenses")}: ${formatDZD(totalExpenses, locale)}`} config={{ revenue: { label: t("accounting.revenue"), color: "var(--color-chart-2)" }, expenses: { label: t("accounting.expenses"), color: "var(--color-chart-4)" } }} height={300}><DualBarChart data={monthlyData} revenueLabel={t("accounting.revenue")} expensesLabel={t("accounting.expenses")} /></ChartCard>
      <ExpensesDataTable fallback={fallback} locale={locale} from={rangeFrom} to={rangeTo} />
    </div>
  );
}
