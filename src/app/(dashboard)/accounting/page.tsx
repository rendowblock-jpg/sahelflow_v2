import type { Metadata } from "next";

import { AccountingView } from "@/components/accounting/accounting-view";
import { resolveAccountingState } from "@/components/accounting/accounting-state";
import { ExpenseFormDialog } from "@/components/accounting/expense-form-dialog";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import {
  getProfitabilityProjection,
  getProfitabilitySeries,
} from "@/lib/accounting/profitability";
import { sumMonthlyTotals, totalExpensesOf } from "@/lib/accounting/expense-totals";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import { SHOP_TIME_ZONE, shopRecentMonths } from "@/lib/time/shop-day";
import { intlLocale } from "@/lib/utils";
import type { ExpenseCategory } from "@/lib/validation";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.accounting") };
}
export const dynamic = "force-dynamic";

// One failed read must not take the whole page down: each source reports on its own.
const settle = <T,>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    () => ({ ok: false as const }),
  );

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
  const dateLocale = intlLocale(locale);
  const now = new Date();
  const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const period = { from: periodStart, to: now };
  // Calendar months are shop months (Africa/Algiers), not the computer's.
  const last6Months = shopRecentMonths(now, 6);

  const [expensesResult, profitabilityResult, seriesResult] = await Promise.all([
    settle(
      db.expense.findMany({
        where: { date: { gte: periodStart, lt: now }, deletedAt: null },
        orderBy: [{ date: "desc" }, { id: "desc" }],
      }),
    ),
    settle(
      canReadProfitability
        ? getProfitabilityProjection(db, period)
        : Promise.resolve(null),
    ),
    settle(
      canReadProfitability
        ? getProfitabilitySeries(
            db,
            last6Months.map((entry) => ({
              key: entry.key,
              period: { from: entry.gte, to: entry.lt },
            })),
          )
        : Promise.resolve([]),
    ),
  ]);

  const expenses = expensesResult.ok ? expensesResult.value : [];
  const profitability = profitabilityResult.ok ? profitabilityResult.value : null;
  const monthlySeries = seriesResult.ok ? seriesResult.value : [];
  const expensesFailed = !expensesResult.ok;
  const figuresFailed = !profitabilityResult.ok || !seriesResult.ok;

  const monthlyByKey = new Map(
    monthlySeries.map((entry) => [entry.key, entry.projection]),
  );
  const monthly = last6Months.map((entry) => {
    const month = monthlyByKey.get(entry.key);
    return {
      month: entry.gte.toLocaleDateString(dateLocale, {
        month: "short",
        timeZone: SHOP_TIME_ZONE,
      }),
      revenue: month?.netRevenue ?? 0,
      expenses: totalExpensesOf(month),
    };
  });
  // MNY-06: one definition of "Expenses" (COGS included) for the card, every
  // chart bar and the chart caption; the caption totals the plotted months.
  const financials = profitability
    ? {
        netRevenue: profitability.netRevenue,
        cogs: profitability.cogs,
        totalExpenses: totalExpensesOf(profitability),
        netProfit: profitability.netProfit,
        profitabilityComplete: profitability.profitabilityComplete,
      }
    : null;
  const hasFigures =
    financials !== null &&
    (financials.netRevenue !== 0 ||
      financials.cogs !== 0 ||
      financials.totalExpenses !== 0 ||
      financials.netProfit !== 0);

  const state = resolveAccountingState({
    expensesFailed,
    figuresFailed,
    canReadFigures: canReadProfitability,
    expenseCount: expenses.length,
    hasFigures,
  });
  const dayFormat = { day: "numeric", month: "short", timeZone: SHOP_TIME_ZONE } as const;

  return (
    <AccountingView
      t={t}
      locale={locale}
      state={state}
      periodLabel={`${periodStart.toLocaleDateString(dateLocale, dayFormat)} – ${now.toLocaleDateString(dateLocale, dayFormat)}`}
      canReadFigures={canReadProfitability}
      canUpdate={canUpdate}
      financials={financials}
      monthly={monthly}
      chartTotals={sumMonthlyTotals(monthly)}
      expenses={expenses.map((expense) => ({
        id: expense.id,
        category: expense.category as ExpenseCategory,
        amount: expense.amount,
        date: expense.date.toISOString(),
        notes: expense.notes,
      }))}
      failed={{ expenses: expensesFailed, figures: canReadProfitability && figuresFailed }}
      retryHref="/accounting"
      headerActions={
        canExport || canUpdate ? (
          <div className="flex flex-wrap items-center gap-2">
            {canExport ? <ImportExportButtons exportRoute="/api/export/expenses" /> : null}
            {canUpdate ? <ExpenseFormDialog /> : null}
          </div>
        ) : undefined
      }
      addExpenseAction={canUpdate ? <ExpenseFormDialog /> : undefined}
    />
  );
}
