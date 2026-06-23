import { getDashboardStats, getRecentOrders } from "@/lib/data/dashboard";
import { getDashboardAnalytics } from "@/lib/data/analytics-data";
import { formatDZD, formatDZDShort } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShoppingCart,
  Users,
  MessageSquare,
  Banknote,
  Truck,
  Package,
  TrendingUp,
  Clock,
  Plus,
  ArrowRight,
} from "lucide-react";
import { getI18n } from "@/lib/i18n-server";
import { orderStatusStyles } from "@/lib/shared";
import { STATUS_CHART_COLORS, statusI18nKey } from "@/lib/shared/status-colors";
import type { OrderStatus } from "@/types/domain";
import type { ChartConfig } from "@/components/ui/chart";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ChartCard } from "@/components/charts/chart-primitives";
import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { HorizontalBarChart, type HBarDatum } from "@/components/charts/horizontal-bar-chart";
import { ComposedTrendChart } from "@/components/charts/composed-trend-chart";
import Link from "next/link";

export const revalidate = 30;

export default async function DashboardPage() {
  const { t, locale } = await getI18n();
  const [stats, recentOrders, analytics] = await Promise.all([
    getDashboardStats(),
    getRecentOrders(6),
    getDashboardAnalytics(),
  ]);

  const dateLocale = locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-FR";
  const fmtShortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric" });
  const fmtHour = (h: number) => `${String(h).padStart(2, "0")}h`;

  // Sparkline series from the 7-day revenue trend
  const revenueSpark = analytics.revenueSeries.map((p) => ({ value: p.revenue }));
  const ordersSpark = analytics.revenueSeries.map((p) => ({ value: p.orders }));

  const hour = new Date().getHours();
  const greeting = hour < 12
    ? t("dashboard.greetingMorning")
    : hour < 18
      ? t("dashboard.greetingAfternoon")
      : t("dashboard.greetingEvening");

  // ── Revenue trend (area) ──
  const revenueData = analytics.revenueSeries.map((p) => ({
    date: p.date,
    label: fmtShortDate(p.date),
    revenue: p.revenue,
    orders: p.orders,
  }));
  const revenueConfig: ChartConfig = {
    revenue: { label: t("analytics.revenueLabel"), color: "var(--color-chart-2)" },
  };

  // ── Orders by status (donut) ──
  const donutData: DonutDatum[] = analytics.statusDistribution.map((s) => ({
    key: s.key,
    label: t(statusI18nKey(s.key)),
    value: s.value,
    color: STATUS_CHART_COLORS[s.key as OrderStatus] ?? "var(--color-chart-1)",
  }));
  const donutConfig: ChartConfig = {};
  for (const d of donutData) {
    donutConfig[d.key] = { label: d.label, color: d.color };
  }
  const totalOrders = donutData.reduce((s, d) => s + d.value, 0);

  // ── Top products (horizontal bar) ──
  const topProductsData: HBarDatum[] = analytics.topProducts.map((p) => ({
    key: p.key,
    label: p.name.length > 22 ? p.name.slice(0, 21) + "…" : p.name,
    value: p.revenue,
    displayValue: formatDZDShort(p.revenue),
  }));
  const topProductsConfig: ChartConfig = {
    value: { label: t("analytics.revenueLabel"), color: "var(--color-chart-1)" },
  };

  // ── Sales by hour (composed) ──
  const hourData = analytics.salesByHour.map((b) => ({
    hour: fmtHour(b.hour),
    orders: b.orders,
    revenue: b.revenue,
  }));
  const hourConfig: ChartConfig = {
    orders: { label: t("analytics.ordersLabel"), color: "var(--color-chart-1)" },
    revenue: { label: t("analytics.revenueLabel"), color: "var(--color-chart-2)" },
  };

  const dp = analytics.deliveryPerformance;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={`${greeting} 👋`}
        description={`${t("app.tagline")} — ${t("dashboard.activityOverview")}`}
        actions={
          <Button asChild>
            <Link href="/orders">
              <Plus className="mr-1.5 h-4 w-4" />
              {t("dashboard.newOrder")}
            </Link>
          </Button>
        }
      />

      {/* KPI stat cards with sparklines */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("nav.orders")}
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
          label={t("nav.accounting")}
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
          label={t("nav.customers")}
          value={stats.newCustomers}
          icon={<Users />}
          accentBg="bg-violet-500/10 dark:bg-violet-500/15"
          accentIcon="text-violet-600 dark:text-violet-400"
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("nav.inbox")}
          value={stats.activeConversations}
          icon={<MessageSquare />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-amber-600 dark:text-amber-400"
          style={{ animationDelay: "240ms" }}
        />
      </div>

      {/* Revenue trend — full width */}
      <ChartCard
        title={t("dashboard.revenueTrend")}
        description={t("dashboard.last7Days")}
        icon={<TrendingUp />}
        accent="bg-emerald-500/10 dark:bg-emerald-500/15"
        config={revenueConfig}
        height={300}
        action={
          <Badge variant="outline" className="gap-1 text-xs">
            <TrendingUp className="h-3 w-3" />
            {formatDZDShort(analytics.summary.totalRevenue)}
          </Badge>
        }
      >
        <AreaTrendChart
          data={revenueData}
          xKey="label"
          series={[{ key: "revenue", label: t("analytics.revenueLabel"), format: "currency" }]}
          config={revenueConfig}
          height={300}
          formatY="currencyShort"
        />
      </ChartCard>

      {/* Orders by status + Top products */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={t("dashboard.ordersByStatus")}
          icon={<ShoppingCart />}
          accent="bg-sky-500/10 dark:bg-sky-500/15"
          config={donutConfig}
          height={300}
        >
          <DonutChart
            data={donutData}
            config={donutConfig}
            height={300}
            centerValue={String(totalOrders)}
            centerLabel={t("dashboard.totalOrders")}
          />
        </ChartCard>

        <ChartCard
          title={t("dashboard.topProducts")}
          icon={<Package />}
          accent="bg-amber-500/10 dark:bg-amber-500/15"
          config={topProductsConfig}
          height={300}
          action={
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link href="/products">
                {t("dashboard.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          }
        >
          {topProductsData.length > 0 ? (
            <HorizontalBarChart
              data={topProductsData}
              config={topProductsConfig}
              height={300}
              formatValue="currencyShort"
            />
          ) : (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              {t("dashboard.noChartData")}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Sales by hour (composed) */}
      <ChartCard
        title={t("dashboard.salesByHour")}
        description={t("analytics.salesByHourDesc")}
        icon={<Clock />}
        accent="bg-violet-500/10 dark:bg-violet-500/15"
        config={hourConfig}
        height={280}
      >
        <ComposedTrendChart
          data={hourData}
          xKey="hour"
          series={[
            { kind: "bar", key: "orders", label: t("analytics.ordersLabel"), yAxis: "left" },
            { kind: "line", key: "revenue", label: t("analytics.revenueLabel"), format: "currency", yAxis: "right" },
          ]}
          config={hourConfig}
          height={280}
          formatLeftY="number"
          formatRightY="currencyShort"
        />
      </ChartCard>

      {/* Recent orders + delivery summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 animate-fade-up">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("dashboard.recentOrders")}</CardTitle>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link href="/orders">
                {t("dashboard.viewAll")}
                <ArrowRight className="ml-1 h-3 w-3" />
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
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-medium">{order.orderNumber}</span>
                        <div>
                          <p className="text-sm font-medium">{order.customer.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {itemLabel} · {order.wilaya}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium tabular-nums">{formatDZD(order.totalPrice)}</span>
                        {statusStyle ? (
                          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                            <span className={`size-1.5 rounded-full ${statusStyle.dot}`} />
                            {locale === "ar" ? statusStyle.labelAr : statusStyle.label}
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

        {/* Delivery performance summary */}
        <Card className="animate-fade-up">
          <CardHeader>
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
              <Link href="/deliveries">{t("nav.delivery")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
