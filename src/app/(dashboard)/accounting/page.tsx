import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDZD, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DualBarChart } from "@/components/charts/dual-bar-chart";
import { PageHeader } from "@/components/shared/page-header";
import type { ExpenseCategory } from "@/lib/validation";
import { ExpenseFormDialog } from "@/components/accounting/expense-form-dialog";
import { ExpenseRowActions } from "@/components/accounting/expense-row-actions";
import {
  TrendingUp,
  Wallet,
  Receipt,
  Package,
  PiggyBank,
  CreditCard,
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

  // Fetch orders + expenses for the current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [orders, expenses] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: startOfMonth } },
      include: { items: { include: { product: { select: { cost: true } } } }, delivery: true },
    }),
    db.expense.findMany({
      where: { date: { gte: startOfMonth } },
      orderBy: { date: "desc" },
    }),
  ]);

  // Calculate P&L — use actual product costPrice when available, fall back to 60% margin estimate
  const deliveredOrders = orders.filter((o) => o.status === "delivered");
  const revenue = deliveredOrders.reduce((sum, o) => sum + o.totalPrice, 0);
  const cogs = deliveredOrders.reduce((sum, o) => {
    return sum + o.items.reduce((s, item) => {
      const cost = (item as { product?: { cost?: number } }).product?.cost ?? item.unitPrice * 0.6;
      return s + (cost * item.quantity);
    }, 0);
  }, 0);
  const deliveryCosts = deliveredOrders.reduce((sum, o) => sum + (o.delivery?.cost ?? 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = revenue - cogs - deliveryCosts - totalExpenses;

  // Monthly data for chart (last 6 months)
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return date;
  });

  const monthlyData = await Promise.all(
    last6Months.map(async (date) => {
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      const monthOrders = await db.order.findMany({
        where: {
          createdAt: { gte: date, lt: nextMonth },
          status: "delivered",
        },
      });
      const monthExpenses = await db.expense.aggregate({
        where: { date: { gte: date, lt: nextMonth } },
        _sum: { amount: true },
      });
      const monthRevenue = monthOrders.reduce((sum, o) => sum + o.totalPrice, 0);
      return {
        month: date.toLocaleDateString(dateLocale, { month: "short" }),
        revenue: monthRevenue,
        expenses: monthExpenses._sum.amount ?? 0,
      };
    }),
  );

  const stats = [
    { label: t("accounting.revenueMonth"), value: formatDZD(revenue), icon: TrendingUp, accentBg: "bg-emerald-500/10 dark:bg-emerald-500/15", accentIcon: "text-emerald-600 dark:text-emerald-400", valueColor: "text-emerald-600 dark:text-emerald-400" },
    { label: t("accounting.cogs"), value: formatDZD(cogs), icon: Package, accentBg: "bg-orange-500/10 dark:bg-orange-500/15", accentIcon: "text-orange-600 dark:text-orange-400", valueColor: "text-orange-600 dark:text-orange-400" },
    { label: t("accounting.expenses"), value: formatDZD(totalExpenses), icon: Receipt, accentBg: "bg-red-500/10 dark:bg-red-500/15", accentIcon: "text-red-600 dark:text-red-400", valueColor: "text-red-600 dark:text-red-400" },
    { label: t("accounting.netProfit"), value: formatDZD(netProfit), icon: Wallet, accentBg: netProfit >= 0 ? "bg-emerald-500/10 dark:bg-emerald-500/15" : "bg-red-500/10 dark:bg-red-500/15", accentIcon: netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400", valueColor: netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400" },
  ];

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.accounting")}
        description={`${t("accounting.subtitle")} — ${now.toLocaleDateString(dateLocale, { month: "long", year: "numeric" })}`}
        actions={<ExpenseFormDialog />}
      />

      {/* P&L Summary — upgraded with accent icons */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="shadow-xs hover:shadow-md transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <div className={`flex size-8 items-center justify-center rounded-lg ${stat.accentBg}`}>
                  <Icon className={`h-4 w-4 ${stat.accentIcon}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold tabular-nums ${stat.valueColor}`}>{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
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
            <div className="flex size-7 items-center justify-center rounded-lg bg-red-500/10 dark:bg-red-500/15">
              <CreditCard className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("accounting.expenseDate")}</TableHead>
                  <TableHead>{t("accounting.expenseCategory")}</TableHead>
                  <TableHead className="text-end">{t("accounting.expenseAmount")}</TableHead>
                  <TableHead>{t("accounting.expenseNotes")}</TableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(expense.date, locale)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {t(`accounting.category.${expense.category}`)}
                    </TableCell>
                    <TableCell className="text-end font-medium text-red-600 dark:text-red-400 tabular-nums">
                      −{formatDZD(expense.amount)}
                    </TableCell>
                    <TableCell className="max-w-xs text-sm text-muted-foreground">
                      {expense.notes ?? "—"}
                    </TableCell>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
