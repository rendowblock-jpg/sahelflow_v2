import type { ReactNode } from "react";
import { AlertTriangle, Package, Receipt, TrendingUp, Wallet } from "lucide-react";

import { AccountingSkeleton } from "@/components/accounting/accounting-skeleton";
import type { AccountingViewState } from "@/components/accounting/accounting-state";
import { ExpenseRowActions } from "@/components/accounting/expense-row-actions";
import { ExpensesDataTable, type ExpenseRowView } from "@/components/accounting/expenses-data-table";
import { ChartCard } from "@/components/charts/chart-primitives";
import { DualBarChart } from "@/components/charts/dual-bar-chart";
import { PageHeader } from "@/components/shared/page-header";
import { StateSurface } from "@/components/shared/state-surface";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/lib/i18n";
import type { getI18n } from "@/lib/i18n-server";
import { formatDate, formatDZD } from "@/lib/utils";

export interface AccountingFinancials {
  /** R3: delivered orders minus refunds and returns. */
  netRevenue: number;
  cogs: number;
  totalExpenses: number;
  netProfit: number;
  profitabilityComplete: boolean;
}

export interface AccountingViewProps {
  t: Awaited<ReturnType<typeof getI18n>>["t"];
  locale: Locale;
  state: AccountingViewState;
  /** "12 Oct – 11 Nov": the 30 days the figures cover. */
  periodLabel: string;
  canReadFigures: boolean;
  canUpdate: boolean;
  financials: AccountingFinancials | null;
  monthly: ReadonlyArray<{ month: string; revenue: number; expenses: number }>;
  chartTotals: { revenue: number; expenses: number };
  expenses: ReadonlyArray<ExpenseRowView>;
  /** What could not be read (state "partial" or "error"). */
  failed: { expenses: boolean; figures: boolean };
  retryHref: string;
  /** Export / add buttons, built by the page (they are client components). */
  headerActions?: ReactNode;
  /** The one action of the empty screen. */
  addExpenseAction?: ReactNode;
}

function RetryLink({ label, href }: { label: string; href: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="min-h-11 min-w-11">
      <a href={href}>{label}</a>
    </Button>
  );
}

/** Pure view: renders already-loaded data, loads nothing. */
export function AccountingView({
  t,
  locale,
  state,
  periodLabel,
  canReadFigures,
  canUpdate,
  financials,
  monthly,
  chartTotals,
  expenses,
  failed,
  retryHref,
  headerActions,
  addExpenseAction,
}: AccountingViewProps) {
  if (state === "loading") return <AccountingSkeleton label={t("common.loading")} />;

  const header = (
    <PageHeader
      title={t("nav.accounting")}
      description={`${t("accounting.subtitle")} — ${periodLabel}`}
      actions={headerActions}
    />
  );

  if (state === "error") {
    return (
      <div className="app-content page-sections" data-accounting-state="error">
        <PageHeader title={t("nav.accounting")} description={t("accounting.subtitle")} />
        <StateSurface
          kind="error"
          icon={AlertTriangle}
          title={t("accounting.loadFailed")}
          description={t("error.requestFailed")}
          size="inline"
          testId="accounting-error"
          actions={<RetryLink label={t("common.retry")} href={retryHref} />}
        />
      </div>
    );
  }

  const chartSummary = `${t("accounting.netRevenue")}: ${formatDZD(chartTotals.revenue, locale)} · ${t("accounting.expenses")}: ${formatDZD(chartTotals.expenses, locale)}`;
  const showFigures = !failed.figures;
  const showExpenses = !failed.expenses;

  return (
    <div className="app-content page-sections" data-accounting-state={state}>
      {header}

      {state === "partial" ? (
        <StateSurface
          kind="partial"
          size="banner"
          title={failed.figures ? t("accounting.state.partialFigures") : t("accounting.state.partialExpenses")}
          testId="accounting-partial"
          actions={<RetryLink label={t("common.retry")} href={retryHref} />}
        />
      ) : null}

      {state === "empty" ? (
        <StateSurface
          kind="empty"
          icon={Receipt}
          title={t("accounting.state.empty")}
          size="panel"
          testId="accounting-empty"
          actions={canUpdate ? addExpenseAction : undefined}
        />
      ) : null}

      {state !== "empty" && showFigures ? (
        !canReadFigures ? (
          <StateSurface
            icon={Wallet}
            title={t("error.forbidden")}
            description={t("accounting.subtitle")}
            tone="warning"
            size="inline"
          />
        ) : financials ? (
          <>
            <div className="card-grid-4" data-accounting-figures="true">
              <StatCard
                label={t("accounting.netRevenue")}
                value={formatDZD(financials.netRevenue, locale)}
                subtitle={t("accounting.def.netRevenue")}
                tooltip={t("accounting.netRevenueDefinition")}
                icon={<TrendingUp />}
                href="/analytics"
                hrefLabel={t("nav.analytics")}
              />
              {/* Missing cost prices are a fact about this number, so the card
                  carries it (and leads to the products to fix). */}
              <StatCard
                label={t("accounting.cogs")}
                value={formatDZD(financials.cogs, locale)}
                icon={financials.profitabilityComplete ? <Package /> : <AlertTriangle />}
                tone={financials.profitabilityComplete ? "neutral" : "warning"}
                subtitle={
                  financials.profitabilityComplete ? (
                    t("accounting.def.cogs")
                  ) : (
                    <>
                      <span className="block">{t("accounting.def.cogs")}</span>
                      <span className="block font-medium">{t("accounting.missingCostsCard")}</span>
                    </>
                  )
                }
                tooltip={financials.profitabilityComplete ? undefined : t("accounting.missingCostsWarning")}
                href={financials.profitabilityComplete ? undefined : "/products"}
                hrefLabel={t("nav.products")}
              />
              <StatCard
                label={t("accounting.expenses")}
                value={formatDZD(financials.totalExpenses, locale)}
                subtitle={t("accounting.def.expenses")}
                icon={<Receipt />}
              />
              <StatCard
                label={t("accounting.netProfit")}
                value={formatDZD(financials.netProfit, locale)}
                subtitle={t("accounting.def.netProfit")}
                icon={<Wallet />}
                trend={financials.netProfit > 0 ? 1 : financials.netProfit < 0 ? -1 : 0}
                trendLabel={financials.netProfit >= 0 ? t("accounting.profit") : t("accounting.loss")}
              />
            </div>

            <ChartCard
              title={t("accounting.revenueVsExpenses")}
              summary={chartSummary}
              icon={<TrendingUp className="size-4" />}
              config={{}}
              dataTable={{
                label: chartSummary,
                caption: t("charts.tableOf", { title: t("accounting.revenueVsExpenses") }),
                columns: [t("charts.colMonth"), t("accounting.revenue"), t("accounting.expenses")],
                rows: monthly.map((entry) => [
                  entry.month,
                  formatDZD(entry.revenue, locale),
                  formatDZD(entry.expenses, locale),
                ]),
                showLabel: t("charts.showAsTable"),
                hideLabel: t("charts.showAsChart"),
              }}
            >
              <DualBarChart
                data={[...monthly]}
                revenueLabel={t("accounting.revenue")}
                expensesLabel={t("accounting.expenses")}
              />
            </ChartCard>
          </>
        ) : null
      ) : null}

      {state !== "empty" && showExpenses ? (
        <Card data-accounting-expenses="true">
          <CardHeader>
            <CardTitle className="text-base">{t("accounting.recentExpenses")}</CardTitle>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <StateSurface icon={Receipt} title={t("accounting.noExpenses")} tone="neutral" size="inline" />
            ) : (
              <>
                <div className="md:hidden">
                  <ExpensesDataTable layout="cards" canUpdate={canUpdate} rows={[...expenses]} />
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <Table scrollLabel={t("accounting.recentExpenses")}>
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
                          <TableCell className="text-end font-medium tabular-nums">
                            {/* Isolate the signed amount so the minus glyph never
                                marries the surrounding RTL label direction. */}
                            <span dir="ltr">−{formatDZD(expense.amount, locale)}</span>
                          </TableCell>
                          <TableCell className="max-w-xs text-muted-foreground">{expense.notes ?? "—"}</TableCell>
                          {canUpdate ? (
                            <TableCell className="text-end">
                              <ExpenseRowActions expense={expense} />
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
