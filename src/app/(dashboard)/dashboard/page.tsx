import { getDashboardStats, getRecentOrders } from "@/lib/data/dashboard";
import { getDashboardAnalytics } from "@/lib/data/analytics-data";
import { formatDZD } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShoppingCart,
  Users,
  MessageSquare,
  Banknote,
  Truck,
  Plus,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { getI18n } from "@/lib/i18n-server";
import { orderStatusStyles } from "@/lib/shared";
import type { OrderStatus } from "@/types/domain";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import Link from "next/link";

export const revalidate = 30;

export default async function DashboardPage() {
  const { t } = await getI18n();
  const [stats, recentOrders, analytics] = await Promise.all([
    getDashboardStats(),
    getRecentOrders(8),
    getDashboardAnalytics(),
  ]);

  // Sparkline series from the 7-day revenue trend (small, inline — not a full chart)
  const revenueSpark = analytics.revenueSeries.map((p) => ({ value: p.revenue }));
  const ordersSpark = analytics.revenueSeries.map((p) => ({ value: p.orders }));
  // New customers per day (7-day trend) — for card 3 sparkline
  const customersSpark = (analytics.customerGrowth ?? []).map((p) => ({ value: p.newCustomers }));
  // Delivery rate per day — derived from deliveryPerformance for card 4 context

  const hour = new Date().getHours();
  const greeting = hour < 12
    ? t("dashboard.greetingMorning")
    : hour < 18
      ? t("dashboard.greetingAfternoon")
      : t("dashboard.greetingEvening");

  const dp = analytics.deliveryPerformance;
  const pendingOrders = recentOrders.filter((o) => o.status === "pending" || o.status === "confirmed").length;
  const deliveredToday = recentOrders.filter((o) => o.status === "delivered").length;

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={<span suppressHydrationWarning>{`${greeting} 👋`}</span>}
        description={t("dashboard.activityOverview")}
        actions={
          <Button asChild>
            <Link href="/orders">
              <Plus className="me-1.5 h-4 w-4" />
              {t("dashboard.newOrder")}
            </Link>
          </Button>
        }
      />

      {/* KPI stat cards with sparklines — the at-a-glance snapshot */}
      <div className="stagger-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("dashboard.todaysOrders")}
          value={stats.ordersToday}
          icon={<ShoppingCart />}
          accentBg="bg-sky-500/10 dark:bg-sky-500/15"
          accentIcon="text-sky-600 dark:text-sky-400"
          trend={stats.ordersTrend}
          trendLabel={t("dashboard.vsYesterday")}
          spark={ordersSpark}
          sparkColor="var(--color-chart-1)"
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("dashboard.todaysRevenue")}
          value={formatDZD(stats.revenueToday)}
          icon={<Banknote />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-emerald-600 dark:text-emerald-400"
          trend={stats.revenueTrend}
          trendLabel={t("dashboard.vsYesterday")}
          spark={revenueSpark}
          sparkColor="var(--color-chart-2)"
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("dashboard.newCustomersToday")}
          value={stats.newCustomers}
          icon={<Users />}
          accentBg="bg-violet-500/10 dark:bg-violet-500/15"
          accentIcon="text-violet-600 dark:text-violet-400"
          spark={customersSpark}
          sparkColor="var(--color-chart-3)"
          subtitle={t("dashboard.last7Days")}
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("dashboard.activeConversations")}
          value={stats.activeConversations}
          icon={<MessageSquare />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-amber-600 dark:text-amber-400"
          subtitle={t("dashboard.pendingDeliveries", { count: stats.pendingDeliveries })}
          trend={stats.lowStockProducts > 0 ? -1 : 0}
          trendLabel={stats.lowStockProducts > 0 ? t("dashboard.lowStockWarning", { count: stats.lowStockProducts }) : t("dashboard.stockOk")}
          style={{ animationDelay: "240ms" }}
        />
      </div>

      {/* Quick action bar — the 4 most common actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Button variant="outline" asChild className="h-auto justify-start gap-3 py-3">
          <Link href="/inbox">
            <span className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 dark:bg-amber-500/15">
              <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </span>
            <span className="flex flex-col items-start">
              <span className="text-sm font-medium">{t("nav.inbox")}</span>
              <span className="text-xs text-muted-foreground">{t("dashboard.openInbox")}</span>
            </span>
          </Link>
        </Button>
        <Button variant="outline" asChild className="h-auto justify-start gap-3 py-3">
          <Link href="/orders">
            <span className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 dark:bg-sky-500/15">
              <ShoppingCart className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </span>
            <span className="flex flex-col items-start">
              <span className="text-sm font-medium">{t("nav.orders")}</span>
              <span className="text-xs text-muted-foreground">{t("dashboard.manageOrders")}</span>
            </span>
          </Link>
        </Button>
        <Button variant="outline" asChild className="h-auto justify-start gap-3 py-3">
          <Link href="/deliveries">
            <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 dark:bg-violet-500/15">
              <Truck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </span>
            <span className="flex flex-col items-start">
              <span className="text-sm font-medium">{t("nav.delivery")}</span>
              <span className="text-xs text-muted-foreground">{t("dashboard.trackShipments")}</span>
            </span>
          </Link>
        </Button>
        <Button variant="outline" asChild className="h-auto justify-start gap-3 py-3">
          <Link href="/analytics">
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </span>
            <span className="flex flex-col items-start">
              <span className="text-sm font-medium">{t("nav.analytics")}</span>
              <span className="text-xs text-muted-foreground">{t("dashboard.viewAnalytics")}</span>
            </span>
          </Link>
        </Button>
      </div>

      {/* Recent orders + Delivery snapshot */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recent orders — takes 2/3 width */}
        <Card className="lg:col-span-2 animate-fade-up">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              {t("dashboard.recentOrders")}
            </CardTitle>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link href="/orders">
                {t("dashboard.viewAll")}
                <ArrowRight className="me-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-5 mb-5 ring-1 ring-primary/10">
                  <ShoppingCart className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1">{t("dashboard.noOrders")}</h3>
                <p className="text-sm text-muted-foreground max-w-md mb-4">
                  {t("dashboard.ordersWillAppear")}
                </p>
                <Button asChild>
                  <Link href="/orders">{t("nav.orders")}</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentOrders.map((order) => {
                  const statusStyle = orderStatusStyles[order.status as OrderStatus];
                  const itemCount = order.items.length;
                  const itemLabel = itemCount > 1
                    ? t("dashboard.itemsPlural").replace("{n}", String(itemCount))
                    : t("dashboard.items").replace("{n}", String(itemCount));
                  return (
                    <Link
                      key={order.id}
                      href={`/orders/${order.id}`}
                      className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-sm font-medium shrink-0">{order.orderNumber}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{order.customer.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {itemLabel} · {order.wilaya}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-medium tabular-nums">{formatDZD(order.totalPrice)}</span>
                        {statusStyle ? (
                          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                            <span className={`size-1.5 rounded-full ${statusStyle.dot}`} />
                            {t(statusStyle.i18nKey)}
                          </span>
                        ) : (
                          <Badge variant="outline">{order.status}</Badge>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delivery + alerts snapshot — takes 1/3 width */}
        <div className="space-y-4">
          {/* Delivery performance mini-card */}
          <Card className="animate-fade-up">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex size-7 items-center justify-center rounded-lg bg-violet-500/10 dark:bg-violet-500/15">
                  <Truck className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                </div>
                {t("nav.delivery")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">{t("dashboard.deliveryRate")}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {dp.deliveryRate}%
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] text-muted-foreground">{t("dashboard.inTransit")}</p>
                  <p className="text-lg font-bold tabular-nums">{dp.inTransit}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] text-muted-foreground">{t("dashboard.pending")}</p>
                  <p className="text-lg font-bold tabular-nums">{dp.pending}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] text-muted-foreground">{t("analytics.delivered")}</p>
                  <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{dp.delivered}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] text-muted-foreground">{t("analytics.returned")}</p>
                  <p className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">{dp.returned}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild className="w-full">
                <Link href="/deliveries">
                  {t("dashboard.viewAllDeliveries")}
                  <ArrowRight className="me-1.5 h-3 w-3" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Today's focus — pending orders count */}
          <Card className="animate-fade-up">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 dark:bg-amber-500/15">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </span>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">{t("dashboard.pendingOrders")}</p>
                  <p className="text-xl font-bold tabular-nums">{pendingOrders}</p>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/orders?status=pending">
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </span>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">{t("dashboard.deliveredToday")}</p>
                  <p className="text-xl font-bold tabular-nums">{deliveredToday}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
