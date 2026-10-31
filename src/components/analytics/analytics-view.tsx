import Link from "next/link";
import { Activity, ArrowDown, ArrowUp, BarChart3, Clock, DollarSign, MapPin, Minus, Package, RotateCcw, ShoppingCart, TrendingDown, TrendingUp, Truck, Users } from "lucide-react";
import { AnalyticsExportButton } from "@/components/analytics/analytics-export-button";
import { AnalyticsRangeControls } from "@/components/analytics/analytics-range-controls";
import { CourierPerformanceSection } from "@/components/analytics/courier-performance-section";
import { KpiDrillDownLink } from "@/components/analytics/kpi-drill-down-link";
import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import { ChartCard, ChartEmpty } from "@/components/charts/chart-primitives";
import { buildChartTable } from "@/components/charts/chart-table";
import { ComposedTrendChart } from "@/components/charts/composed-trend-chart";
import { OutcomeProgress, RankedMetricList, SegmentedBreakdown, type BreakdownDatum, type RankedMetricDatum } from "@/components/charts/decision-visualizations";
import { LineTrendChart } from "@/components/charts/line-trend-chart";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollRegion } from "@/components/ui/scroll-region";
import type { ChartConfig } from "@/components/ui/chart";
import { buildOrdersDrillDownUrl } from "@/lib/analytics/range";
import { STATUS_CHART_COLORS, statusI18nKey } from "@/lib/shared/status-colors";
import { shortDayLabel } from "@/lib/time/shop-day-format";
import { cn, formatDZD, intlLocale, numberFormatter } from "@/lib/utils";
import type { OrderStatus } from "@/types/domain";
import type { getI18n } from "@/lib/i18n-server";
import type { Locale } from "@/lib/i18n";
import type { resolveAnalyticsRange } from "@/lib/analytics/range";
import type { getAnalyticsReportForRange } from "@/lib/analytics/report";
import type { getReturnRateByWilaya, getSkuPnl, getPeriodComparison } from "@/lib/data/analytics-v2";
import type { ProjectedSkuPnl } from "@/lib/identity/sku-pnl-projection";
import type { getCourierPerformance } from "@/lib/analytics/courier-performance";



export interface AnalyticsViewProps {
  t: Awaited<ReturnType<typeof getI18n>>["t"];
  locale: Locale;
  range: ReturnType<typeof resolveAnalyticsRange>;
  report: Awaited<ReturnType<typeof getAnalyticsReportForRange>>;
  returnRateByWilaya: Awaited<ReturnType<typeof getReturnRateByWilaya>>;
  skuProjection: ProjectedSkuPnl<Awaited<ReturnType<typeof getSkuPnl>>[number]>;
  showSkuCost: boolean;
  comparison: Awaited<ReturnType<typeof getPeriodComparison>>;
  courier: Awaited<ReturnType<typeof getCourierPerformance>>;
}

/** Pure view: renders already-loaded data, loads nothing. */
export function AnalyticsView({
  t,
  locale,
  range,
  report,
  returnRateByWilaya,
  skuProjection,
  showSkuCost,
  comparison,
  courier,
}: AnalyticsViewProps) {
  const dateLocale = intlLocale(locale);
  const integerFormatter = numberFormatter(dateLocale, {
    maximumFractionDigits: 0,
  });
  const percentFormatter = numberFormatter(dateLocale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const signedPercentFormatter = numberFormatter(dateLocale, {
    style: "percent",
    signDisplay: "exceptZero",
    maximumFractionDigits: 1,
  });
  const hourFormatter = numberFormatter(dateLocale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  const fmtShortDate = (iso: string) => shortDayLabel(iso, dateLocale);
  const fmtHour = (hour: number) => `${hourFormatter.format(hour)}:00`;
  const fmtPercent = (value: number) => percentFormatter.format(value / 100);
  const fmtSignedPercent = (value: number) =>
    signedPercentFormatter.format(value / 100);

  // Drill-down targets (R2-a orders URL contract: status / from / to).
  const ordersRangeHref = buildOrdersDrillDownUrl({
    fromIso: range.fromIso,
    toIso: range.toIso,
  });
  const deliveredOrdersHref = buildOrdersDrillDownUrl({
    fromIso: range.fromIso,
    toIso: range.toIso,
    status: "delivered",
  });
  const returnedOrdersHref = buildOrdersDrillDownUrl({
    fromIso: range.fromIso,
    toIso: range.toIso,
    status: "returned",
  });

  const returnRateData: RankedMetricDatum[] = returnRateByWilaya
    .slice(0, 10)
    .map((wilaya) => ({
      key: wilaya.wilaya,
      label: wilaya.wilaya,
      value: Math.round(wilaya.returnRate * 10) / 10,
      displayValue: fmtPercent(wilaya.returnRate),
      detail: `${integerFormatter.format(wilaya.returned)} ${t("analytics.returned")} / ${integerFormatter.format(wilaya.total)} ${t("analytics.ordersLabel")}`,
      color:
        wilaya.returnRate > 30
          ? "var(--color-destructive)"
          : wilaya.returnRate > 15
            ? "var(--color-chart-3)"
            : "var(--color-chart-2)",
    }));

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

  const statusBreakdownData: BreakdownDatum[] = report.statusDistribution.map(
    (status) => ({
      key: status.key,
      label: t(statusI18nKey(status.key)),
      value: status.value,
      color:
        STATUS_CHART_COLORS[status.key as OrderStatus] ??
        "var(--color-chart-1)",
    }),
  );
  const totalOrders = statusBreakdownData.reduce(
    (sum, datum) => sum + datum.value,
    0,
  );

  const topProductsData: RankedMetricDatum[] = report.topProducts.map(
    (product) => ({
      key: product.key,
      label: product.name,
      value: product.revenue,
      displayValue: formatDZD(product.revenue, locale),
      color: "var(--color-chart-1)",
    }),
  );

  const topWilayasData: RankedMetricDatum[] = report.topWilayas.map((wilaya) => ({
    key: wilaya.key,
    label: wilaya.name,
    value: wilaya.orders,
    displayValue: integerFormatter.format(wilaya.orders),
    detail: t("analytics.ordersLabel"),
    color: "var(--color-chart-3)",
  }));

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
    <div className="app-content page-sections" data-analytics-workspace="v2" data-analytics-generation="class-aaa">
      <PageHeader
        title={t("nav.analytics")}
        description={t("analytics.depth")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/*
              `/analytics/extraction` is a complete, guarded, trilingual
              dashboard with a working API, and NOTHING linked to it — a seller
              could only reach it by typing the URL. It is a child of this page,
              so it is linked from this page rather than by adding a 17th
              sidebar item (the flat 16-item sidebar is a recorded product
              decision, SF16-NAV-017).
            */}
            <Button asChild variant="outline" size="sm">
              <Link href="/analytics/extraction">
                {t("analytics.extraction.title")}
              </Link>
            </Button>
            <AnalyticsRangeControls />
            <AnalyticsExportButton
              summary={{
                totalRevenue: summary.totalRevenue,
                totalOrders: summary.totalOrders,
                avgOrderValue: summary.avgOrderValue,
                deliveryRate: summary.deliveryRate,
                returnRate:
                  Math.round(comparison.current.returnRate * 10) / 10,
              }}
              couriers={courier.providers}
              feesIncluded={courier.feesIncluded}
              range={{ fromIso: range.fromIso, toIso: range.toIso }}
            />
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
          tooltip={t("analytics.revenueDefinition")}
          icon={<TrendingUp />}
          trend={summary.revenueDelta ?? undefined}
          trendDirectionOnly={false}
          trendLabel={summary.revenueDelta == null ? undefined : t("analytics.vsPrevious")}
          action={
            <KpiDrillDownLink
              href={ordersRangeHref}
              label={t("analytics.courier.viewOrders")}
            />
          }
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("nav.orders")}
          value={integerFormatter.format(summary.totalOrders)}
          icon={<ShoppingCart />}
          trend={summary.ordersDelta ?? undefined}
          trendDirectionOnly={false}
          trendLabel={summary.ordersDelta == null ? undefined : t("analytics.vsPrevious")}
          action={
            <KpiDrillDownLink
              href={ordersRangeHref}
              label={t("analytics.courier.viewOrders")}
            />
          }
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("analytics.avgOrderValue")}
          value={formatDZD(summary.avgOrderValue, locale)}
          icon={<Package />}
          trend={summary.aovDelta ?? undefined}
          trendDirectionOnly={false}
          trendLabel={summary.aovDelta == null ? undefined : t("analytics.vsPrevious")}
          action={
            <KpiDrillDownLink
              href={ordersRangeHref}
              label={t("analytics.courier.viewOrders")}
            />
          }
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("analytics.deliveryRate")}
          value={fmtPercent(summary.deliveryRate)}
          icon={<Truck />}
          action={
            <KpiDrillDownLink
              href={deliveredOrdersHref}
              label={t("analytics.courier.viewDelivered")}
            />
          }
          style={{ animationDelay: "240ms" }}
        />
      </div>

      <section data-analytics-section="headline" className="min-w-0">
        <ChartCard
          title={t("analytics.revenueTrend")}
          description={t("analytics.revenueTrendDesc")}
          summary={
            summary.revenueDelta === null
              ? formatDZD(summary.totalRevenue, locale)
              : `${formatDZD(summary.totalRevenue, locale)} · ${fmtSignedPercent(summary.revenueDelta)} ${t("analytics.vsPrevious")}`
          }
          icon={<Activity />}
          accent="bg-emerald-500/10 dark:bg-emerald-500/15"
          config={revenueConfig}
          dataTable={{
            label: `${t("analytics.revenueTrend")}: ${formatDZD(summary.totalRevenue, locale)}`,
            caption: t("charts.tableOf", { title: t("analytics.revenueTrend") }),
            columns: [t("charts.colDate"), t("analytics.revenueLabel")],
            rows: revenueData.map((point) => [point.label, formatDZD(point.revenue, locale)]),
            showLabel: t("charts.showAsTable"),
            hideLabel: t("charts.showAsChart"),
          }}
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
          icon={<BarChart3 />}
          accent="bg-teal-500/10 dark:bg-teal-500/15"
          config={{}}
          dataTable={buildChartTable(
            t,
            t("analytics.ordersByStatus"),
            `${integerFormatter.format(totalOrders)} ${t("analytics.ordersLabel")}`,
            [t("charts.colStatus"), t("analytics.ordersLabel")],
            statusBreakdownData.map((datum) => [String(datum.label), integerFormatter.format(datum.value)]),
          )}
        >
          {totalOrders > 0 ? (
            <SegmentedBreakdown
              data={statusBreakdownData}
              total={totalOrders}
              formatValue={(value) => integerFormatter.format(value)}
              formatPercent={(fraction) => percentFormatter.format(fraction)}
            />
          ) : (
            <ChartEmpty message={t("analytics.noData")} />
          )}
        </ChartCard>

        <ChartCard
          title={t("analytics.deliveryPerformance")}
          summary={fmtPercent(delivery.deliveryRate)}
          icon={<Truck />}
          accent="bg-emerald-500/10 dark:bg-emerald-500/15"
          config={{}}
          dataTable={buildChartTable(
            t,
            t("analytics.deliveryPerformance"),
            fmtPercent(delivery.deliveryRate),
            [t("charts.colStatus"), t("analytics.ordersLabel")],
            [
              [t("analytics.delivered"), integerFormatter.format(delivery.delivered)],
              [t("analytics.inTransit"), integerFormatter.format(delivery.inTransit)],
              [t("dashboard.pending"), integerFormatter.format(delivery.pending)],
              [t("analytics.returned"), integerFormatter.format(delivery.returned)],
            ],
          )}
        >
          <OutcomeProgress
            value={delivery.deliveryRate}
            displayValue={fmtPercent(delivery.deliveryRate)}
            label={t("dashboard.deliveryRate")}
            color="var(--color-chart-2)"
            outcomes={[
              {
                key: "delivered",
                label: t("analytics.delivered"),
                value: delivery.delivered,
                displayValue: integerFormatter.format(delivery.delivered),
                tone: "success",
              },
              {
                key: "transit",
                label: t("analytics.inTransit"),
                value: delivery.inTransit,
                displayValue: integerFormatter.format(delivery.inTransit),
              },
              {
                key: "pending",
                label: t("dashboard.pending"),
                value: delivery.pending,
                displayValue: integerFormatter.format(delivery.pending),
              },
              {
                key: "returned",
                label: t("analytics.returned"),
                value: delivery.returned,
                displayValue: integerFormatter.format(delivery.returned),
                tone: "danger",
              },
            ]}
          />
        </ChartCard>
      </section>

      <CourierPerformanceSection
        providers={courier.providers}
        matrix={courier.matrix}
        totalShipments={courier.totalShipments}
        feesIncluded={courier.feesIncluded}
        range={{ from: range.from, to: range.to }}
      />

      <section data-analytics-section="rankings" className="card-grid-2">
        <ChartCard
          title={t("analytics.topProductsByRevenue")}
          summary={
            topProductsData[0]
              ? `${String(topProductsData[0].label)} · ${String(topProductsData[0].displayValue)}`
              : undefined
          }
          icon={<BarChart3 />}
          accent="bg-teal-500/10 dark:bg-teal-500/15"
          config={{}}
          dataTable={buildChartTable(
            t,
            t("analytics.topProductsByRevenue"),
            topProductsData[0] ? `${String(topProductsData[0].label)} · ${String(topProductsData[0].displayValue)}` : "",
            [t("charts.colProduct"), t("analytics.revenueLabel")],
            topProductsData.map((datum) => [String(datum.label), String(datum.displayValue)]),
          )}
        >
          {topProductsData.length > 0 ? (
            <RankedMetricList data={topProductsData} />
          ) : (
            <ChartEmpty message={t("analytics.noProductData")} />
          )}
        </ChartCard>

        <ChartCard
          title={t("analytics.topWilayas")}
          summary={
            topWilayasData[0]
              ? `${String(topWilayasData[0].label)} · ${String(topWilayasData[0].displayValue)}`
              : undefined
          }
          icon={<MapPin />}
          accent="bg-amber-500/10 dark:bg-amber-500/15"
          config={{}}
          dataTable={buildChartTable(
            t,
            t("analytics.topWilayas"),
            topWilayasData[0] ? `${String(topWilayasData[0].label)} · ${String(topWilayasData[0].displayValue)}` : "",
            [t("charts.colWilaya"), t("analytics.ordersLabel")],
            topWilayasData.map((datum) => [String(datum.label), String(datum.displayValue)]),
          )}
        >
          {topWilayasData.length > 0 ? (
            <RankedMetricList data={topWilayasData} />
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
          dataTable={buildChartTable(
            t,
            t("analytics.salesByHour"),
            `${integerFormatter.format(hourData.reduce((sum, bucket) => sum + bucket.orders, 0))} ${t("analytics.ordersLabel")}`,
            [t("charts.colHour"), t("analytics.ordersLabel"), t("analytics.revenueLabel")],
            hourData.map((bucket) => [bucket.hour, integerFormatter.format(bucket.orders), formatDZD(bucket.revenue, locale)]),
          )}
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
          dataTable={buildChartTable(
            t,
            t("analytics.aovTrend"),
            formatDZD(summary.avgOrderValue, locale),
            [t("charts.colDate"), t("analytics.avgOrderValue")],
            aovData.map((point) => [point.label, formatDZD(point.aov, locale)]),
          )}
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
          dataTable={buildChartTable(
            t,
            t("analytics.customerGrowth"),
            growthData.at(-1) ? integerFormatter.format(growthData.at(-1)!.cumulative) : "",
            [t("charts.colDate"), t("analytics.cumulative"), t("analytics.newCustomers")],
            growthData.map((point) => [point.label, integerFormatter.format(point.cumulative), integerFormatter.format(point.newCustomers)]),
          )}
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
            returnRateByWilaya[0]
              ? `${returnRateByWilaya[0].wilaya} · ${fmtPercent(returnRateByWilaya[0].returnRate)} · ${integerFormatter.format(returnRateByWilaya[0].returned)}/${integerFormatter.format(returnRateByWilaya[0].total)} ${t("analytics.ordersLabel")}`
              : undefined
          }
          icon={<RotateCcw />}
          accent="bg-red-500/10 dark:bg-red-500/15"
          config={{}}
          action={
            <KpiDrillDownLink
              href={returnedOrdersHref}
              label={t("analytics.courier.viewReturns")}
            />
          }
          dataTable={buildChartTable(
            t,
            t("analytics.returnRateByWilaya"),
            returnRateByWilaya[0] ? `${returnRateByWilaya[0].wilaya} · ${fmtPercent(returnRateByWilaya[0].returnRate)}` : "",
            [t("charts.colWilaya"), t("charts.colReturnRate"), t("charts.colDetail")],
            returnRateData.map((datum) => [String(datum.label), String(datum.displayValue), String(datum.detail ?? "")]),
          )}
        >
          {returnRateData.length > 0 ? (
            <RankedMetricList data={returnRateData} maxValue={100} />
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
              days: integerFormatter.format(range.days),
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {comparisonStats.map((stat) => {
              const change = stat.change;
              const isPositive =
                change !== null &&
                (stat.key === "returnRate" ? change < 0 : change > 0);
              const Icon =
                change !== null && change > 0
                  ? ArrowUp
                  : change !== null && change < 0
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
                      (change === null || change === 0) &&
                        "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-3" aria-hidden="true" />
                    {change === null
                      ? "—"
                      : percentFormatter.format(Math.abs(change) / 100)}
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
          {skuProjection.rows.length > 0 ? (
            <ScrollRegion label={t("analytics.skuPnl")}>
              <table className="w-full">
                <thead className="sticky top-0 z-10 border-b bg-muted">
                  <tr className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 text-start">
                      {t("analytics.skuColProduct")}
                    </th>
                    <th className="px-4 py-3 text-end">
                      {t("analytics.revenueLabel")}
                    </th>
                    {showSkuCost ? (
                      <th className="px-4 py-3 text-end">
                        {t("analytics.skuColCost")}
                      </th>
                    ) : null}
                    {showSkuCost ? (
                      <th className="px-4 py-3 text-end">
                        {t("analytics.skuColMargin")}
                      </th>
                    ) : null}
                    {showSkuCost ? (
                      <th className="px-4 py-3 text-end">
                        {t("analytics.skuColMarginPct")}
                      </th>
                    ) : null}
                    <th className="px-4 py-3 text-end">
                      {t("analytics.skuColQty")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {skuProjection.rows.slice(0, 10).map((item) => (
                    <tr key={item.sku} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm font-medium">
                        {item.sku}
                      </td>
                      <td className="px-4 py-3 text-end text-sm tabular-nums">
                        {formatDZD(item.revenue, locale)}
                      </td>
                      {showSkuCost && item.cost !== null ? (
                        <td className="px-4 py-3 text-end text-sm tabular-nums text-muted-foreground">
                          {formatDZD(item.cost, locale)}
                        </td>
                      ) : null}
                      {showSkuCost && item.margin !== null ? (
                        <td className="px-4 py-3 text-end text-sm font-medium tabular-nums">
                          {formatDZD(item.margin, locale)}
                        </td>
                      ) : null}
                      {showSkuCost && item.marginPct !== null ? (
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
                      ) : null}
                      <td className="px-4 py-3 text-end text-sm tabular-nums text-muted-foreground">
                        {integerFormatter.format(item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
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
