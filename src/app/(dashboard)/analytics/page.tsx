import { db } from "@/lib/db";
import { formatDZD } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { StatusPieChart } from "@/components/charts/status-pie-chart";
import { TrendingUp, ShoppingCart, Users, Package } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analytique — SahelFlow" };
export const dynamic = "force-dynamic";

const ORDER_STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  pending: "#f59e0b",
  confirmed: "#3b82f6",
  shipped: "#8b5cf6",
  delivered: "#22c55e",
  returned: "#ef4444",
  refused: "#dc2626",
  cancelled: "#6b7280",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  pending: "En attente",
  confirmed: "Confirmée",
  shipped: "Expédiée",
  delivered: "Livrée",
  returned: "Retournée",
  refused: "Refusée",
  cancelled: "Annulée",
};

export default async function AnalyticsPage() {
  // Fetch data for charts
  const [orders] = await Promise.all([
    db.order.findMany({
      include: { items: true },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
  ]);

  // Revenue by day (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    date.setHours(0, 0, 0, 0);
    return date;
  });

  const revenueByDay = last7Days.map((date) => {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const dayOrders = orders.filter(
      (o) => o.createdAt >= date && o.createdAt < nextDate && o.status !== "cancelled",
    );
    const revenue = dayOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    return {
      day: date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
      revenue,
      orders: dayOrders.length,
    };
  });

  // Orders by status
  const statusCounts: Record<string, number> = {};
  for (const order of orders) {
    statusCounts[order.status] = (statusCounts[order.status] ?? 0) + 1;
  }
  const statusData = Object.entries(statusCounts).map(([status, count]) => ({
    name: STATUS_LABELS[status] ?? status,
    value: count,
    color: ORDER_STATUS_COLORS[status] ?? "#94a3b8",
  }));

  // Top products (by order count)
  const productCounts: Record<string, { name: string; count: number; revenue: number }> = {};
  for (const order of orders) {
    for (const item of order.items) {
      const key = item.productId ?? item.productName;
      if (!productCounts[key]) {
        productCounts[key] = { name: item.productName, count: 0, revenue: 0 };
      }
      const entry = productCounts[key]; if (entry) { entry.count += item.quantity; entry.revenue += item.total; }
      
    }
  }
  const topProducts = Object.values(productCounts)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Summary stats
  const totalRevenue = orders
    .filter((o) => o.status === "delivered")
    .reduce((sum, o) => sum + o.totalPrice, 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const deliveredCount = orders.filter((o) => o.status === "delivered").length;
  const deliveryRate = totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 100) : 0;

  const summaryStats = [
    { label: "Revenu total", value: formatDZD(totalRevenue), icon: TrendingUp },
    { label: "Commandes", value: String(totalOrders), icon: ShoppingCart },
    { label: "Valeur moyenne", value: formatDZD(avgOrderValue), icon: Package },
    { label: "Taux de livraison", value: `${deliveryRate}%`, icon: Users },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytique</h1>
        <p className="text-sm text-muted-foreground">
          Vue d&apos;ensemble de votre activité
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Revenue chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenu des 7 derniers jours</CardTitle>
        </CardHeader>
        <CardContent>
<RevenueChart data={revenueByDay} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Orders by status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commandes par statut</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusPieChart data={statusData} />
          </CardContent>
        </Card>

        {/* Top products */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top produits (par revenu)</CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.map((product, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.count} vendu{product.count > 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-medium">{formatDZD(product.revenue)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className='flex items-center justify-center h-[300px] text-muted-foreground text-sm'>
                Aucune donnée
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
