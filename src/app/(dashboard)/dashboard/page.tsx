import { getDashboardStats, getRecentOrders } from "@/lib/data/dashboard";
import { formatDZD } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart,
  Users,
  MessageSquare,
  Truck,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
} from "lucide-react";
import { getI18n } from "@/lib/i18n-server";
import { orderStatusStyles } from "@/lib/shared";
import Link from "next/link";

// Refresh every 30 seconds
export const revalidate = 30;

export default async function DashboardPage() {
  const { t } = await getI18n();
  const [stats, recentOrders] = await Promise.all([
    getDashboardStats(),
    getRecentOrders(5),
  ]);

  const statCards = [
    {
      label: t("nav.orders"),
      value: String(stats.ordersToday),
      icon: ShoppingCart,
      trend: stats.ordersTrend,
      accentBg: "bg-sky-500/10 dark:bg-sky-500/15",
      accentIcon: "text-sky-600 dark:text-sky-400",
    },
    {
      label: t("nav.accounting"),
      value: formatDZD(stats.revenueToday),
      icon: Banknote,
      trend: stats.revenueTrend,
      accentBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      accentIcon: "text-emerald-600 dark:text-emerald-400",
      isCurrency: true,
    },
    {
      label: t("nav.customers"),
      value: String(stats.newCustomers),
      icon: Users,
      trend: 0,
      accentBg: "bg-violet-500/10 dark:bg-violet-500/15",
      accentIcon: "text-violet-600 dark:text-violet-400",
    },
    {
      label: t("nav.inbox"),
      value: String(stats.activeConversations),
      icon: MessageSquare,
      trend: 0,
      accentBg: "bg-amber-500/10 dark:bg-amber-500/15",
      accentIcon: "text-amber-600 dark:text-amber-400",
    },
  ];

  // Get current hour for greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <div className="space-y-6 p-6">
      {/* Welcome header — upgraded with gradient text */}
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("app.tagline")} — Voici un aperçu de votre activité
        </p>
      </div>

      {/* Stats grid — upgraded with accent icons and card-hover */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          const isPositive = stat.trend > 0;
          const isNegative = stat.trend < 0;
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
                <div className="text-2xl font-bold tabular-nums">{stat.value}</div>
                {stat.trend !== 0 && (
                  <div className="flex items-center gap-1 text-xs mt-1">
                    {isPositive && <ArrowUpRight className="h-3 w-3 text-emerald-600" />}
                    {isNegative && <ArrowDownRight className="h-3 w-3 text-red-600" />}
                    <span className={isPositive ? "text-emerald-600" : "text-red-600"}>
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

      {/* Secondary cards — upgraded with accent icons */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="card-hover animate-fade-up" style={{ animationDelay: "240ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex size-7 items-center justify-center rounded-lg bg-violet-500/10 dark:bg-violet-500/15">
                <Truck className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              {t("nav.delivery")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold tabular-nums">{stats.pendingDeliveries}</p>
                <p className="text-xs text-muted-foreground">en attente</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/deliveries">{t("nav.delivery")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="card-hover animate-fade-up" style={{ animationDelay: "300ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 dark:bg-amber-500/15">
                <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              {t("nav.products")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold tabular-nums">{stats.lowStockProducts}</p>
                <p className="text-xs text-muted-foreground">stock faible</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/products">{t("nav.products")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent orders — upgraded with shared status styles */}
      <Card className="animate-fade-up" style={{ animationDelay: "360ms" }}>
        <CardHeader>
          <CardTitle className="text-base">Commandes récentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-5 mb-5 ring-1 ring-primary/10">
                <ShoppingCart className="h-8 w-8 text-primary" />
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
              {recentOrders.map((order) => {
                const statusStyle = orderStatusStyles[order.status as keyof typeof orderStatusStyles];
                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
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
                      <span className="text-sm font-medium tabular-nums">{formatDZD(order.totalPrice)}</span>
                      {statusStyle ? (
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                          <span className={`size-1.5 rounded-full ${statusStyle.dot}`} />
                          {statusStyle.label}
                        </span>
                      ) : (
                        <Badge variant="outline">{order.status}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
