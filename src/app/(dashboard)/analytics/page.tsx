import { getAnalyticsReport } from "@/lib/data/analytics-data";
import { getReturnRateByWilaya, getSkuPnl, getPeriodComparison, getLastNDays, getPreviousPeriod } from "@/lib/data/analytics-v2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Minus, RotateCcw, DollarSign, TrendingDown } from "lucide-react";
import { formatDZD } from "@/lib/utils";
import { getI18n } from "@/lib/i18n-server";
import { STATUS_CHART_COLORS, statusI18nKey } from "@/lib/shared/status-colors";
import type { OrderStatus } from "@/types/domain";
import type { ChartConfig } from "@/components/ui/chart";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ChartCard } from "@/components/charts/chart-primitives";
import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import { LineTrendChart } from "@/components/charts/line-trend-chart";
import { ComposedTrendChart } from "@/components/charts/composed-trend-chart";
import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { HorizontalBarChart, type HBarDatum } from "@/components/charts/horizontal-bar-chart";
import { RadialGauge } from "@/components/charts/radial-gauge";
import { cn } from "@/lib/utils";
import { TrendingUp, ShoppingCart, Package, Truck, Activity, PieChart, BarChart3, Users, MapPin, Clock, Gauge } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.analytics") };
}
export const dynamic = "force-dynamic";

const RANGES = [
  { days: 7, labelKey: "analytics.last7Days" },
  { days: 14, labelKey: "analytics.last14Days" },
  { days: 30, labelKey: "analytics.last30Days" },
  { days: 90, labelKey: "analytics.last90Days" },
] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { t, locale } = await getI18n();
  const { days: daysParam } = await searchParams;
  const days = Number(daysParam);
  const validDays = [7, 14, 30, 90].includes(days) ? days : 30;

  const report = await getAnalyticsReport(validDays);

  // Phase 7: advanced analytics (return-rate, SKU P&L, period comparison)
  const range = getLastNDays(validDays);
  const prevRange = getPreviousPeriod(range);
  const [returnRateByWilaya, skuPnl, comparison] = await Promise.all([
    getReturnRateByWilaya(range),
    getSkuPnl(range),
    getPeriodComparison(range, prevRange),
  ]);

  // Format return-rate data for the horizontal bar chart
  const returnRateData: HBarDatum[] = returnRateByWilaya.slice(0, 10).map((w) => ({
    key: w.wilaya,
    label: w.wilaya.length > 15 ? w.wilaya.slice(0, 14) + "…" : w.wilaya,
    value: Math.round(w.returnRate * 10) / 10,
    color: w.returnRate > 30 ? "var(--color-chart-4)" : w.returnRate > 15 ? "var(--color-chart-3)" : "var(--color-chart-2)",
  }));
  const returnRateConfig: ChartConfig = {
    value: { label: "Return rate %", color: "var(--color-chart-4)" },
  };
  const dateLocale = locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-FR";
  const fmtShortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale, { month: "short", day: "numeric" });
  const fmtHour = (h: number) => `${String(h).padStart(2, "0")}h`;

  const s = report.summary;

  // ── Revenue trend (area) ──
  const revenueData = report.revenueTimeSeries.map((p) => ({
    date: p.date,
    label: fmtShortDate(p.date),
    revenue: p.revenue,
  }));
  const revenueConfig: ChartConfig = {
    revenue: { label: t("analytics.revenueLabel"), color: "var(--color-chart-2)" },
  };

  // ── AOV trend (line) ──
  const aovData = report.aovTimeSeries.map((p) => ({
    date: p.date,
    label: fmtShortDate(p.date),
    aov: p.aov,
  }));
  const aovConfig: ChartConfig = {
    aov: { label: t("analytics.avgOrderValue"), color: "var(--color-chart-4)" },
  };

  // ── Customer growth (area) ──
  const growthData = report.customerGrowth.map((p) => ({
    date: p.date,
    label: fmtShortDate(p.date),
    cumulative: p.cumulative,
    newCustomers: p.newCustomers,
  }));
  const growthConfig: ChartConfig = {
    cumulative: { label: t("analytics.cumulative"), color: "var(--color-chart-1)" },
    newCustomers: { label: t("analytics.newCustomers"), color: "var(--color-chart-3)" },
  };

  // ── Status donut ──
  const donutData: DonutDatum[] = report.statusDistribution.map((st) => ({
    key: st.key,
    label: t(statusI18nKey(st.key)),
    value: st.value,
    color: STATUS_CHART_COLORS[st.key as OrderStatus] ?? "var(--color-chart-1)",
  }));
  const donutConfig: ChartConfig = {};
  for (const d of donutData) donutConfig[d.key] = { label: d.label, color: d.color };
  const totalOrders = donutData.reduce((sum, d) => sum + d.value, 0);

  // ── Top products (h-bar) ──
  const topProductsData: HBarDatum[] = report.topProducts.map((p) => ({
    key: p.key,
    label: p.name.length > 20 ? p.name.slice(0, 19) + "…" : p.name,
    value: p.revenue,
  }));
  const topProductsConfig: ChartConfig = {
    value: { label: t("analytics.revenueLabel"), color: "var(--color-chart-1)" },
  };

  // ── Top wilayas (h-bar) ──
  const topWilayasData: HBarDatum[] = report.topWilayas.map((w) => ({
    key: w.key,
    label: w.name,
    value: w.orders,
  }));
  const topWilayasConfig: ChartConfig = {
    value: { label: t("analytics.ordersLabel"), color: "var(--color-chart-3)" },
  };

  // ── Sales by hour (composed) ──
  const hourData = report.salesByHour.map((b) => ({
    hour: fmtHour(b.hour),
    orders: b.orders,
    revenue: b.revenue,
  }));
  const hourConfig: ChartConfig = {
    orders: { label: t("analytics.ordersLabel"), color: "var(--color-chart-1)" },
    revenue: { label: t("analytics.revenueLabel"), color: "var(--color-chart-2)" },
  };

  const dp = report.deliveryPerformance;
  const gaugeConfig: ChartConfig = {
    value: { label: t("dashboard.deliveryRate"), color: "var(--color-chart-2)" },
  };

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.analytics")}
        description={t("analytics.depth")}
        actions={
          <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
            {RANGES.map((r) => (
              <Link
                key={r.days}
                href={`/analytics?days=${r.days}`}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  validDays === r.days
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(r.labelKey)}
              </Link>
            ))}
          </div>
        }
      />

      {/* Summary KPIs with trend deltas */}
      <div className="card-grid-4 stagger-grid">
        <StatCard
          label={t("analytics.totalRevenue")}
          value={formatDZD(s.totalRevenue)}
          icon={<TrendingUp />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-emerald-600 dark:text-emerald-400"
          trend={s.revenueDelta}
          trendLabel={t("analytics.vsPrevious")}
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("nav.orders")}
          value={s.totalOrders}
          icon={<ShoppingCart />}
          accentBg="bg-teal-500/10 dark:bg-teal-500/15"
          accentIcon="text-teal-600 dark:text-teal-400"
          trend={s.ordersDelta}
          trendLabel={t("analytics.vsPrevious")}
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("analytics.avgOrderValue")}
          value={formatDZD(s.avgOrderValue)}
          icon={<Package />}
          accentBg="bg-violet-500/10 dark:bg-violet-500/15"
          accentIcon="text-violet-600 dark:text-violet-400"
          trend={s.aovDelta}
          trendLabel={t("analytics.vsPrevious")}
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("analytics.deliveryRate")}
          value={`${s.deliveryRate}%`}
          icon={<Truck />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-amber-600 dark:text-amber-400"
          style={{ animationDelay: "240ms" }}
        />
      </div>

      {/* Revenue trend — full width */}
      <ChartCard
        title={t("analytics.revenueTrend")}
        description={t("analytics.revenueTrendDesc")}
        icon={<Activity />}
        accent="bg-emerald-500/10 dark:bg-emerald-500/15"
        config={revenueConfig}
        height={320}
      >
        <AreaTrendChart
          data={revenueData}
          xKey="label"
          series={[{ key: "revenue", label: t("analytics.revenueLabel"), format: "currency" }]}
          config={revenueConfig}
          height={320}
          formatY="currencyShort"
        />
      </ChartCard>

      {/* Status donut + Delivery gauge */}
      <div className="card-grid-2">
        <ChartCard
          title={t("analytics.ordersByStatus")}
          icon={<PieChart />}
          accent="bg-teal-500/10 dark:bg-teal-500/15"
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
          title={t("analytics.deliveryPerformance")}
          icon={<Gauge />}
          accent="bg-emerald-500/10 dark:bg-emerald-500/15"
          config={gaugeConfig}
          height={300}
        >
          <div className="flex flex-col items-center gap-4">
            <RadialGauge
              value={dp.deliveryRate}
              config={gaugeConfig}
              height={220}
              centerLabel={t("dashboard.deliveryRate")}
            />
            <div className="grid w-full grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">{t("analytics.delivered")}</p>
                <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{dp.delivered}</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">{t("analytics.inTransit")}</p>
                <p className="text-base font-bold tabular-nums">{dp.inTransit}</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">{t("dashboard.pending")}</p>
                <p className="text-base font-bold tabular-nums">{dp.pending}</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">{t("analytics.returned")}</p>
                <p className="text-base font-bold tabular-nums text-red-600 dark:text-red-400">{dp.returned}</p>
              </div>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Top products + Top wilayas */}
      <div className="card-grid-2">
        <ChartCard
          title={t("analytics.topProductsByRevenue")}
          icon={<BarChart3 />}
          accent="bg-teal-500/10 dark:bg-teal-500/15"
          config={topProductsConfig}
          height={300}
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
              {t("analytics.noProductData")}
            </div>
          )}
        </ChartCard>

        <ChartCard
          title={t("analytics.topWilayas")}
          icon={<MapPin />}
          accent="bg-amber-500/10 dark:bg-amber-500/15"
          config={topWilayasConfig}
          height={300}
        >
          {topWilayasData.length > 0 ? (
            <HorizontalBarChart
              data={topWilayasData}
              config={topWilayasConfig}
              height={300}
              formatValue="number"
            />
          ) : (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              {t("analytics.noWilayaData")}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Sales by hour (composed) */}
      <ChartCard
        title={t("analytics.salesByHour")}
        description={t("analytics.salesByHourDesc")}
        icon={<Clock />}
        accent="bg-violet-500/10 dark:bg-violet-500/15"
        config={hourConfig}
        height={300}
      >
        <ComposedTrendChart
          data={hourData}
          xKey="hour"
          series={[
            { kind: "bar", key: "orders", label: t("analytics.ordersLabel"), yAxis: "left" },
            { kind: "line", key: "revenue", label: t("analytics.revenueLabel"), format: "currency", yAxis: "right" },
          ]}
          config={hourConfig}
          height={300}
          formatLeftY="number"
          formatRightY="currencyShort"
        />
      </ChartCard>

      {/* AOV trend + Customer growth */}
      <div className="card-grid-2">
        <ChartCard
          title={t("analytics.aovTrend")}
          description={t("analytics.aovTrendDesc")}
          icon={<TrendingUp />}
          accent="bg-violet-500/10 dark:bg-violet-500/15"
          config={aovConfig}
          height={280}
        >
          <LineTrendChart
            data={aovData}
            xKey="label"
            series={[{ key: "aov", label: t("analytics.avgOrderValue"), format: "currency" }]}
            config={aovConfig}
            height={280}
            formatY="currencyShort"
          />
        </ChartCard>

        <ChartCard
          title={t("analytics.customerGrowth")}
          description={t("analytics.customerGrowthDesc")}
          icon={<Users />}
          accent="bg-teal-500/10 dark:bg-teal-500/15"
          config={growthConfig}
          height={280}
        >
          <AreaTrendChart
            data={growthData}
            xKey="label"
            series={[{ key: "cumulative", label: t("analytics.cumulative"), format: "number" }]}
            config={growthConfig}
            height={280}
            formatY="number"
          />
        </ChartCard>
      </div>

      {/* ── Phase 7: Return rate by wilaya (the killer COD metric) ── */}
      <ChartCard
        title={t("analytics.returnRateByWilaya")}
        description={t("analytics.returnRateHint")}
        icon={<RotateCcw />}
        accent="bg-red-500/10 dark:bg-red-500/15"
        config={returnRateConfig}
        height={300}
      >
        {returnRateData.length > 0 ? (
          <HorizontalBarChart
            data={returnRateData}
            config={returnRateConfig}
            height={300}
            formatValue="number"
          />
        ) : (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            {t("analytics.noReturnData")}
          </div>
        )}
      </ChartCard>

      {/* ── Phase 7: Period comparison ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4" />
            Period Comparison (vs previous {validDays} days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Orders", current: comparison.current.orders, change: comparison.changes.orders },
              { label: "Revenue", current: comparison.current.revenue, change: comparison.changes.revenue, format: true },
              { label: "Delivered", current: comparison.current.delivered, change: comparison.changes.delivered },
              { label: "Return Rate", current: comparison.current.returnRate, change: comparison.changes.returnRate, suffix: "%" },
            ].map((stat) => {
              const isPositive = stat.label === "Return Rate" ? stat.change < 0 : stat.change > 0;
              const Icon = stat.change > 0 ? ArrowUp : stat.change < 0 ? ArrowDown : Minus;
              return (
                <div key={stat.label} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold tabular-nums">
                    {stat.format ? formatDZD(stat.current) : `${stat.current}${stat.suffix ?? ""}`}
                  </p>
                  <Badge variant="outline" className={cn(
                    "gap-1",
                    isPositive ? "border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "border-red-500/20 text-red-600 dark:text-red-400",
                    stat.change === 0 && "text-muted-foreground",
                  )}>
                    <Icon className="h-3 w-3" />
                    {Math.abs(stat.change).toFixed(1)}%
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Phase 7: SKU P&L ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4" />
            SKU P&L (Top 10)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {skuPnl.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 border-b bg-muted/50">
                  <tr className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 text-start">Product</th>
                    <th className="px-4 py-3 text-end">Revenue</th>
                    <th className="px-4 py-3 text-end">Cost</th>
                    <th className="px-4 py-3 text-end">Margin</th>
                    <th className="px-4 py-3 text-end">Margin %</th>
                    <th className="px-4 py-3 text-end">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {skuPnl.slice(0, 10).map((item) => (
                    <tr key={item.sku} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm font-medium">{item.sku}</td>
                      <td className="px-4 py-3 text-end text-sm tabular-nums">{formatDZD(item.revenue)}</td>
                      <td className="px-4 py-3 text-end text-sm tabular-nums text-muted-foreground">{formatDZD(item.cost)}</td>
                      <td className="px-4 py-3 text-end text-sm font-medium tabular-nums">{formatDZD(item.margin)}</td>
                      <td className="px-4 py-3 text-end">
                        <Badge variant="outline" className={cn(
                          item.marginPct > 40 ? "border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "",
                          item.marginPct < 20 ? "border-red-500/20 text-red-600 dark:text-red-400" : "",
                        )}>
                          {item.marginPct.toFixed(1)}%
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-end text-sm tabular-nums text-muted-foreground">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">No product data for this period</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
