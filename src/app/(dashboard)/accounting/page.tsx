import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDZD, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  Wallet,
  Receipt,
  Package,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Comptabilité — SahelFlow" };
export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const { t } = await getI18n();

  // Fetch orders + expenses for the current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [orders, expenses] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: startOfMonth } },
      include: { items: true, delivery: true },
    }),
    db.expense.findMany({
      where: { date: { gte: startOfMonth } },
      orderBy: { date: "desc" },
    }),
  ]);

  // Calculate P&L
  const deliveredOrders = orders.filter((o) => o.status === "delivered");
  const revenue = deliveredOrders.reduce((sum, o) => sum + o.totalPrice, 0);
  const cogs = deliveredOrders.reduce((sum, o) => {
    return sum + o.items.reduce((s, item) => {
      // Estimate cost: if product had a cost, use it; otherwise 0
      return s + (item.unitPrice * 0.6 * item.quantity); // 60% default margin
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
        month: date.toLocaleDateString("fr-FR", { month: "short" }),
        revenue: monthRevenue,
        expenses: monthExpenses._sum.amount ?? 0,
      };
    }),
  );

  const stats = [
    { label: "Revenu (mois)", value: formatDZD(revenue), icon: TrendingUp, color: "text-green-600" },
    { label: "Coût des marchandises", value: formatDZD(cogs), icon: Package, color: "text-orange-600" },
    { label: "Dépenses", value: formatDZD(totalExpenses), icon: Receipt, color: "text-red-600" },
    { label: "Profit net", value: formatDZD(netProfit), icon: Wallet, color: netProfit >= 0 ? "text-green-600" : "text-red-600" },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.accounting")}</h1>
        <p className="text-sm text-muted-foreground">
          Suivi financier de {now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        </p>
      </div>

      {/* P&L Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Revenue vs Expenses chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenu vs Dépenses (6 mois)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                formatter={(value: number) => formatDZD(value)}
                contentStyle={{ borderRadius: "8px" }}
              />
              <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} name="Revenu" />
              <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Dépenses" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Expenses list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" />
            Dépenses du mois
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Aucune dépense enregistrée ce mois-ci.
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
                      {formatDate(expense.date, "fr")}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-red-600">
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
