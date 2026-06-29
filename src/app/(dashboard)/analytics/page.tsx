import { getAnalyticsReport } from "@/lib/data/analytics-data";
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
      <div className="stagger-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          accentBg="bg-sky-500/10 dark:bg-sky-500/15"
          accentIcon="text-sky-600 dark:text-sky-400"
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t("analytics.ordersByStatus")}
          icon={<PieChart />}
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
                <p className="text-[10px] text-muted-foreground">{t("analytics.delivered")}</p>
                <p className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{dp.delivered}</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-[10px] text-muted-foreground">{t("analytics.inTransit")}</p>
                <p className="text-base font-bold tabular-nums">{dp.inTransit}</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-[10px] text-muted-foreground">{t("dashboard.pending")}</p>
                <p className="text-base font-bold tabular-nums">{dp.pending}</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-[10px] text-muted-foreground">{t("analytics.returned")}</p>
                <p className="text-base font-bold tabular-nums text-red-600 dark:text-red-400">{dp.returned}</p>
              </div>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Top products + Top wilayas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t("analytics.topProductsByRevenue")}
          icon={<BarChart3 />}
          accent="bg-sky-500/10 dark:bg-sky-500/15"
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
          accent="bg-sky-500/10 dark:bg-sky-500/15"
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
    </div>
  );
}
