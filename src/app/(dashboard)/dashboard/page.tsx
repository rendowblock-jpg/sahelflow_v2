import { getDashboardStats, getRecentOrders } from "@/lib/data/dashboard";
import { formatDZD } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart,
  TrendingUp,
  Users,
  MessageSquare,
  Truck,
  Package,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { getI18n } from "@/lib/i18n-server";
import Link from "next/link";

// Refresh every 30 seconds (in production, use TanStack Query for client-side caching)
export const revalidate = 30;

export default async function DashboardPage() {
  const { t } = await getI18n();
  const [stats, recentOrders] = await Promise.all([
    getDashboardStats(),
    getRecentOrders(5),
  ]);

  const statusLabels: Record<string, string> = {
    draft: t("status.draft") || "Brouillon",
    pending: t("status.pending") || "En attente",
    confirmed: t("status.confirmed") || "Confirmée",
    shipped: t("status.shipped") || "Expédiée",
    delivered: t("status.delivered") || "Livrée",
    returned: t("status.returned") || "Retournée",
    refused: t("status.refused") || "Refusée",
    cancelled: t("status.cancelled") || "Annulée",
  };

  const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    draft: "outline",
    pending: "secondary",
    confirmed: "default",
    shipped: "default",
    delivered: "default",
    returned: "destructive",
    refused: "destructive",
    cancelled: "destructive",
  };

  const statCards = [
    {
      label: t("nav.orders"),
      value: String(stats.ordersToday),
      icon: ShoppingCart,
      trend: stats.ordersTrend,
    },
    {
      label: t("nav.accounting"),
      value: formatDZD(stats.revenueToday),
      icon: TrendingUp,
      trend: stats.revenueTrend,
    },
    {
      label: t("nav.customers"),
      value: String(stats.newCustomers),
      icon: Users,
      trend: 0,
    },
    {
      label: t("nav.inbox"),
      value: String(stats.activeConversations),
      icon: MessageSquare,
      trend: 0,
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.dashboard")}</h1>
        <p className="text-sm text-muted-foreground">{t("app.tagline")}</p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          const isPositive = stat.trend > 0;
          const isNegative = stat.trend < 0;
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
                {stat.trend !== 0 && (
                  <div className="flex items-center gap-1 text-xs">
                    {isPositive && <ArrowUpRight className="h-3 w-3 text-green-600" />}
                    {isNegative && <ArrowDownRight className="h-3 w-3 text-red-600" />}
                    <span className={isPositive ? "text-green-600" : "text-red-600"}>
                      {Math.abs(stat.trend)}%
                    </span>
                    <span className="text-muted-foreground">vs hier</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Secondary cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4" />
              {t("nav.delivery")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{stats.pendingDeliveries}</p>
                <p className="text-xs text-muted-foreground">en attente</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/deliveries">{t("nav.delivery")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              {t("nav.products")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{stats.lowStockProducts}</p>
                <p className="text-xs text-muted-foreground">stock faible</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/products">{t("nav.products")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commandes récentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <ShoppingCart className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Aucune commande</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                Les commandes apparaîtront ici une fois reçues via WhatsApp.
              </p>
              <Button asChild>
                <Link href="/orders">{t("nav.orders")}</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 rounded-md border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium">{order.orderNumber}</span>
                    <div>
                      <p className="text-sm font-medium">{order.customer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.items.length} article{order.items.length > 1 ? "s" : ""} · {order.wilaya}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{formatDZD(order.totalPrice)}</span>
                    <Badge variant={statusBadgeVariant[order.status] ?? "outline"}>
                      {statusLabels[order.status] ?? order.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
