import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Clock,
  DollarSign,
  Gauge,
  MapPin,
  Minus,
  Package,
  PieChart,
  RotateCcw,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";

import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import {
  ChartCard,
  ChartEmpty,
} from "@/components/charts/chart-primitives";
import { ComposedTrendChart } from "@/components/charts/composed-trend-chart";
import {
  DonutChart,
  type DonutDatum,
} from "@/components/charts/donut-chart";
import {
  HorizontalBarChart,
  type HBarDatum,
} from "@/components/charts/horizontal-bar-chart";
import { LineTrendChart } from "@/components/charts/line-trend-chart";
import { RadialGauge } from "@/components/charts/radial-gauge";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import { getAnalyticsReport } from "@/lib/data/analytics-data";
import {
  getLastNDays,
  getPeriodComparison,
  getPreviousPeriod,
  getReturnRateByWilaya,
  getSkuPnl,
} from "@/lib/data/analytics-v2";
import { getI18n } from "@/lib/i18n-server";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import {
  STATUS_CHART_COLORS,
  statusI18nKey,
} from "@/lib/shared/status-colors";
import { cn, formatDZD } from "@/lib/utils";
import type { OrderStatus } from "@/types/domain";

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
  const actorContext = await requireTrustedAction("analytics.read");
  assertTrustedAction(actorContext, "analytics.financials.read");
  const { t, locale } = await getI18n();
  const { days: daysParam } = await searchParams;
  const days = Number(daysParam);
  const validDays = [7, 14, 30, 90].includes(days) ? days : 30;

  const report = await getAnalyticsReport(validDays);
  const range = getLastNDays(validDays);
  const prevRange = getPreviousPeriod(range);
  const [returnRateByWilaya, skuPnl, comparison] = await Promise.all([
    getReturnRateByWilaya(range),
    getSkuPnl(range),
    getPeriodComparison(range, prevRange),
  ]);

  const dateLocale =
    locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ";
  const integerFormatter = new Intl.NumberFormat(dateLocale, {
    maximumFractionDigits: 0,
  });
  const percentFormatter = new Intl.NumberFormat(dateLocale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const signedPercentFormatter = new Intl.NumberFormat(dateLocale, {
    style: "percent",
    signDisplay: "exceptZero",
    maximumFractionDigits: 1,
  });
  const hourFormatter = new Intl.NumberFormat(dateLocale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  const fmtShortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale, {
      month: "short",
      day: "numeric",
    });
  const fmtHour = (hour: number) => `${hourFormatter.format(hour)}:00`;
  const fmtPercent = (value: number) => percentFormatter.format(value / 100);
  const fmtSignedPercent = (value: number) =>
    signedPercentFormatter.format(value / 100);

  const returnRateData: HBarDatum[] = returnRateByWilaya
    .slice(0, 10)
    .map((wilaya) => ({
      key: wilaya.wilaya,
      label:
        wilaya.wilaya.length > 15
          ? `${wilaya.wilaya.slice(0, 14)}…`
          : wilaya.wilaya,
      value: Math.round(wilaya.returnRate * 10) / 10,
      color:
        wilaya.returnRate > 30
          ? "var(--color-chart-4)"
          : wilaya.returnRate > 15
            ? "var(--color-chart-3)"
            : "var(--color-chart-2)",
    }));
  const returnRateConfig: ChartConfig = {
    value: {
      label: t("analytics.returnRateLabel"),
      color: "var(--color-chart-4)",
    },
  };

  const summary = report.summary;
  const revenueData = report.revenueTimeSeries.map((point) => ({
    date: point.date,
    label: fmtShortDate(point.date),
    revenue: point.revenue,
  }));
  const revenueConfig: ChartConfig = {
    revenue: {
      label: t("analytics.revenueLabel"),
      color: "var(--color-chart-2)",
    },
  };

  const aovData = report.aovTimeSeries.map((point) => ({
    date: point.date,
    label: fmtShortDate(point.date),
    aov: point.aov,
  }));
  const aovConfig: ChartConfig = {
    aov: {
      label: t("analytics.avgOrderValue"),
      color: "var(--color-chart-4)",
    },
  };

  const growthData = report.customerGrowth.map((point) => ({
    date: point.date,
    label: fmtShortDate(point.date),
    cumulative: point.cumulative,
    newCustomers: point.newCustomers,
  }));
  const growthConfig: ChartConfig = {
    cumulative: {
      label: t("analytics.cumulative"),
      color: "var(--color-chart-1)",
    },
    newCustomers: {
      label: t("analytics.newCustomers"),
      color: "var(--color-chart-3)",
    },
  };

  const donutData: DonutDatum[] = report.statusDistribution.map((status) => ({
    key: status.key,
    label: t(statusI18nKey(status.key)),
    value: status.value,
    color:
      STATUS_CHART_COLORS[status.key as OrderStatus] ??
      "var(--color-chart-1)",
  }));
  const donutConfig: ChartConfig = {};
  for (const datum of donutData) {
    donutConfig[datum.key] = { label: datum.label, color: datum.color };
  }
  const totalOrders = donutData.reduce((sum, datum) => sum + datum.value, 0);

  const topProductsData: HBarDatum[] = report.topProducts.map((product) => ({
    key: product.key,
    label:
      product.name.length > 20
        ? `${product.name.slice(0, 19)}…`
        : product.name,
    value: product.revenue,
  }));
  const topProductsConfig: ChartConfig = {
    value: {
      label: t("analytics.revenueLabel"),
      color: "var(--color-chart-1)",
    },
  };

  const topWilayasData: HBarDatum[] = report.topWilayas.map((wilaya) => ({
    key: wilaya.key,
    label: wilaya.name,
    value: wilaya.orders,
  }));
  const topWilayasConfig: ChartConfig = {
    value: {
      label: t("analytics.ordersLabel"),
      color: "var(--color-chart-3)",
    },
  };

  const hourData = report.salesByHour.map((bucket) => ({
    hour: fmtHour(bucket.hour),
    orders: bucket.orders,
    revenue: bucket.revenue,
  }));
  const hourConfig: ChartConfig = {
    orders: {
      label: t("analytics.ordersLabel"),
      color: "var(--color-chart-1)",
    },
    revenue: {
      label: t("analytics.revenueLabel"),
      color: "var(--color-chart-2)",
    },
  };

  const delivery = report.deliveryPerformance;
  const gaugeConfig: ChartConfig = {
    value: {
      label: t("dashboard.deliveryRate"),
      color: "var(--color-chart-2)",
    },
  };

  const comparisonStats = [
    {
      key: "orders",
      label: t("nav.orders"),
      change: comparison.changes.orders,
      display: integerFormatter.format(comparison.current.orders),
    },
    {
      key: "revenue",
      label: t("analytics.revenueLabel"),
      change: comparison.changes.revenue,
      display: formatDZD(comparison.current.revenue, locale),
    },
    {
      key: "delivered",
      label: t("analytics.delivered"),
      change: comparison.changes.delivered,
      display: integerFormatter.format(comparison.current.delivered),
    },
    {
      key: "returnRate",
      label: t("analytics.returnRate"),
      change: comparison.changes.returnRate,
      display: fmtPercent(comparison.current.returnRate),
    },
  ] as const;

  return (
    <div className="app-content page-sections" data-analytics-workspace="v2">
      <PageHeader
        title={t("nav.analytics")}
        description={t("analytics.depth")}
        actions={
          <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
            {RANGES.map((option) => (
              <Link
                key={option.days}
                href={`/analytics?days=${option.days}`}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  validDays === option.days
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(option.labelKey)}
              </Link>
            ))}
          </div>
        }
      />

      <div
        className="card-grid-4 stagger-grid"
        data-analytics-section="scorecard"
      >
        <StatCard
          label={t("analytics.totalRevenue")}
          value={formatDZD(summary.totalRevenue, locale)}
          icon={<TrendingUp />}
          trend={summary.revenueDelta}
          trendDirectionOnly={false}
          trendLabel={t("analytics.vsPrevious")}
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("nav.orders")}
          value={integerFormatter.format(summary.totalOrders)}
          icon={<ShoppingCart />}
          trend={summary.ordersDelta}
          trendDirectionOnly={false}
          trendLabel={t("analytics.vsPrevious")}
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("analytics.avgOrderValue")}
          value={formatDZD(summary.avgOrderValue, locale)}
          icon={<Package />}
          trend={summary.aovDelta}
          trendDirectionOnly={false}
          trendLabel={t("analytics.vsPrevious")}
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("analytics.deliveryRate")}
          value={fmtPercent(summary.deliveryRate)}
          icon={<Truck />}
          style={{ animationDelay: "240ms" }}
        />
      </div>

      <section data-analytics-section="headline" className="min-w-0">
        <ChartCard
          title={t("analytics.revenueTrend")}
          description={t("analytics.revenueTrendDesc")}
          summary={`${formatDZD(summary.totalRevenue, locale)} · ${fmtSignedPercent(summary.revenueDelta)} ${t("analytics.vsPrevious")}`}
          icon={<Activity />}
          accent="bg-emerald-500/10 dark:bg-emerald-500/15"
          config={revenueConfig}
        >
          <AreaTrendChart
            data={revenueData}
            xKey="label"
            series={[
              {
                key: "revenue",
                label: t("analytics.revenueLabel"),
                format: "currency",
              },
            ]}
            config={revenueConfig}
            formatY="currencyShort"
          />
        </ChartCard>
      </section>

      <section
        data-analytics-section="operations"
        className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]"
      >
        <ChartCard
          title={t("analytics.ordersByStatus")}
          summary={`${integerFormatter.format(totalOrders)} ${t("analytics.ordersLabel")}`}
          icon={<PieChart />}
          accent="bg-teal-500/10 dark:bg-teal-500/15"
          config={donutConfig}
        >
          <DonutChart
            data={donutData}
            config={donutConfig}
            centerValue={integerFormatter.format(totalOrders)}
            centerLabel={t("dashboard.totalOrders")}
          />
        </ChartCard>

        <ChartCard
          title={t("analytics.deliveryPerformance")}
          summary={fmtPercent(delivery.deliveryRate)}
          icon={<Gauge />}
          accent="bg-emerald-500/10 dark:bg-emerald-500/15"
          config={gaugeConfig}
        >
          <div className="flex flex-col items-center gap-4">
            <RadialGauge
              value={delivery.deliveryRate}
              config={gaugeConfig}
              height={220}
              centerLabel={t("dashboard.deliveryRate")}
            />
            <div className="grid w-full grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">
                  {t("analytics.delivered")}
                </p>
                <p className="text-base font-bold tabular-nums text-success">
                  {integerFormatter.format(delivery.delivered)}
                </p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">
                  {t("analytics.inTransit")}
                </p>
                <p className="text-base font-bold tabular-nums">
                  {integerFormatter.format(delivery.inTransit)}
                </p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.pending")}
                </p>
                <p className="text-base font-bold tabular-nums">
                  {integerFormatter.format(delivery.pending)}
                </p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">
                  {t("analytics.returned")}
                </p>
                <p className="text-base font-bold tabular-nums text-destructive">
                  {integerFormatter.format(delivery.returned)}
                </p>
              </div>
            </div>
          </div>
        </ChartCard>
      </section>

      <section data-analytics-section="rankings" className="card-grid-2">
        <ChartCard
          title={t("analytics.topProductsByRevenue")}
          summary={
            topProductsData[0]
              ? `${topProductsData[0].label} · ${formatDZD(topProductsData[0].value, locale)}`
              : undefined
          }
          icon={<BarChart3 />}
          accent="bg-teal-500/10 dark:bg-teal-500/15"
          config={topProductsConfig}
        >
          {topProductsData.length > 0 ? (
            <HorizontalBarChart
              data={topProductsData}
              config={topProductsConfig}
              formatValue="currencyShort"
            />
          ) : (
            <ChartEmpty message={t("analytics.noProductData")} />
          )}
        </ChartCard>

        <ChartCard
          title={t("analytics.topWilayas")}
          summary={
            topWilayasData[0]
              ? `${topWilayasData[0].label} · ${integerFormatter.format(topWilayasData[0].value)}`
              : undefined
          }
          icon={<MapPin />}
          accent="bg-amber-500/10 dark:bg-amber-500/15"
          config={topWilayasConfig}
        >
          {topWilayasData.length > 0 ? (
            <HorizontalBarChart
              data={topWilayasData}
              config={topWilayasConfig}
              formatValue="number"
            />
          ) : (
            <ChartEmpty message={t("analytics.noWilayaData")} />
          )}
        </ChartCard>
      </section>

      <section data-analytics-section="timing" className="min-w-0">
        <ChartCard
          title={t("analytics.salesByHour")}
          description={t("analytics.salesByHourDesc")}
          icon={<Clock />}
          accent="bg-violet-500/10 dark:bg-violet-500/15"
          config={hourConfig}
        >
          <ComposedTrendChart
            data={hourData}
            xKey="hour"
            series={[
              {
                kind: "bar",
                key: "orders",
                label: t("analytics.ordersLabel"),
                yAxis: "left",
              },
              {
                kind: "line",
                key: "revenue",
                label: t("analytics.revenueLabel"),
                format: "currency",
                yAxis: "right",
              },
            ]}
            config={hourConfig}
            formatLeftY="number"
            formatRightY="currencyShort"
          />
        </ChartCard>
      </section>

      <section data-analytics-section="trends" className="card-grid-2">
        <ChartCard
          title={t("analytics.aovTrend")}
          description={t("analytics.aovTrendDesc")}
          summary={formatDZD(summary.avgOrderValue, locale)}
          icon={<TrendingUp />}
          accent="bg-violet-500/10 dark:bg-violet-500/15"
          config={aovConfig}
        >
          <LineTrendChart
            data={aovData}
            xKey="label"
            series={[
              {
                key: "aov",
                label: t("analytics.avgOrderValue"),
                format: "currency",
              },
            ]}
            config={aovConfig}
            formatY="currencyShort"
          />
        </ChartCard>

        <ChartCard
          title={t("analytics.customerGrowth")}
          description={t("analytics.customerGrowthDesc")}
          summary={
            growthData.at(-1)
              ? integerFormatter.format(growthData.at(-1)!.cumulative)
              : undefined
          }
          icon={<Users />}
          accent="bg-teal-500/10 dark:bg-teal-500/15"
          config={growthConfig}
        >
          <AreaTrendChart
            data={growthData}
            xKey="label"
            series={[
              {
                key: "cumulative",
                label: t("analytics.cumulative"),
                format: "number",
              },
            ]}
            config={growthConfig}
            formatY="number"
          />
        </ChartCard>
      </section>

      <section data-analytics-section="returns" className="min-w-0">
        <ChartCard
          title={t("analytics.returnRateByWilaya")}
          description={t("analytics.returnRateHint")}
          summary={
            returnRateData[0]
              ? `${returnRateData[0].label} · ${fmtPercent(returnRateData[0].value)}`
              : undefined
          }
          icon={<RotateCcw />}
          accent="bg-red-500/10 dark:bg-red-500/15"
          config={returnRateConfig}
        >
          {returnRateData.length > 0 ? (
            <HorizontalBarChart
              data={returnRateData}
              config={returnRateConfig}
              formatValue="percent"
            />
          ) : (
            <ChartEmpty message={t("analytics.noReturnData")} />
          )}
        </ChartCard>
      </section>

      <Card data-analytics-section="comparison">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="size-4" aria-hidden="true" />
            {t("analytics.periodComparison", {
              days: integerFormatter.format(validDays),
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {comparisonStats.map((stat) => {
              const isPositive =
                stat.key === "returnRate"
                  ? stat.change < 0
                  : stat.change > 0;
              const Icon =
                stat.change > 0
                  ? ArrowUp
                  : stat.change < 0
                    ? ArrowDown
                    : Minus;
              return (
                <div key={stat.key} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold tabular-nums">{stat.display}</p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1",
                      isPositive
                        ? "border-emerald-500/20 text-success"
                        : "border-red-500/20 text-destructive",
                      stat.change === 0 && "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-3" aria-hidden="true" />
                    {percentFormatter.format(Math.abs(stat.change) / 100)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card data-analytics-section="sku-pnl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="size-4" aria-hidden="true" />
            {t("analytics.skuPnl")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {skuPnl.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 border-b bg-muted">
                  <tr className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 text-start">
                      {t("analytics.skuColProduct")}
                    </th>
                    <th className="px-4 py-3 text-end">
                      {t("analytics.revenueLabel")}
                    </th>
                    <th className="px-4 py-3 text-end">
                      {t("analytics.skuColCost")}
                    </th>
                    <th className="px-4 py-3 text-end">
                      {t("analytics.skuColMargin")}
                    </th>
                    <th className="px-4 py-3 text-end">
                      {t("analytics.skuColMarginPct")}
                    </th>
                    <th className="px-4 py-3 text-end">
                      {t("analytics.skuColQty")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {skuPnl.slice(0, 10).map((item) => (
                    <tr key={item.sku} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm font-medium">
                        {item.sku}
                      </td>
                      <td className="px-4 py-3 text-end text-sm tabular-nums">
                        {formatDZD(item.revenue, locale)}
                      </td>
                      <td className="px-4 py-3 text-end text-sm tabular-nums text-muted-foreground">
                        {formatDZD(item.cost, locale)}
                      </td>
                      <td className="px-4 py-3 text-end text-sm font-medium tabular-nums">
                        {formatDZD(item.margin, locale)}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <Badge
                          variant="outline"
                          className={cn(
                            item.marginPct > 40
                              ? "border-emerald-500/20 text-success"
                              : "",
                            item.marginPct < 20
                              ? "border-red-500/20 text-destructive"
                              : "",
                          )}
                        >
                          {fmtPercent(item.marginPct)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-end text-sm tabular-nums text-muted-foreground">
                        {integerFormatter.format(item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {t("analytics.noSkuData")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
