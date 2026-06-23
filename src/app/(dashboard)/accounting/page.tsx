import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDZD, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DualBarChart } from "@/components/charts/dual-bar-chart";
import {
  TrendingUp,
  Wallet,
  Receipt,
  Package,
  PiggyBank,
  CreditCard,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Comptabilité — SahelFlow" };
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
    <div className="space-y-6 p-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.accounting")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("accounting.subtitle")} — {now.toLocaleDateString(dateLocale, { month: "long", year: "numeric" })}
        </p>
      </div>

      {/* P&L Summary — upgraded with accent icons */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="card-hover animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
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
      <Card className="card-hover animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex size-7 items-center justify-center rounded-lg bg-violet-500/10 dark:bg-violet-500/15">
              <PiggyBank className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            {t("accounting.revenueVsExpenses")}
          </CardTitle>
        </CardHeader>
        <CardContent>
<DualBarChart data={monthlyData} />
        </CardContent>
      </Card>

      {/* Expenses list */}
      <Card className="card-hover animate-fade-up" style={{ animationDelay: "300ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex size-7 items-center justify-center rounded-lg bg-red-500/10 dark:bg-red-500/15">
              <CreditCard className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            </div>
            {t("accounting.monthlyExpenses")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
            <div className="divide-y">
              {expenses.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between p-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{expense.category}</p>
                    {expense.notes && (
                      <p className="text-xs text-muted-foreground">{expense.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDate(expense.date, locale)}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-red-600 dark:text-red-400 tabular-nums">
                    −{formatDZD(expense.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
