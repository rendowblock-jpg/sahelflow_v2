import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  MapPin,
  PiggyBank,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import {
  ChartCard,
  ChartEmpty,
} from "@/components/charts/chart-primitives";
import type { ChartConfig } from "@/components/charts/chart-types";
import {
  RankedMetricList,
  SegmentedBreakdown,
  type BreakdownDatum,
  type RankedMetricDatum,
} from "@/components/charts/decision-visualizations";
import { RiskBlacklistPanel } from "@/components/risk/risk-blacklist-panel";
import { RiskControlPanel } from "@/components/risk/risk-control-panel";
import { RiskLevelBadgeServer } from "@/components/risk/risk-badges";
import { RiskRulesPanel } from "@/components/risk/risk-rules-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StateSurface } from "@/components/shared/state-surface";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  getRiskWorkspaceCopy,
  type RiskWorkspaceCopyKey,
} from "@/lib/i18n/risk-workspace";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import {
  getRiskAnalyticsReport,
  getRiskConfig,
  getRiskRules,
  listBlacklistedCustomers,
  type RiskLevel,
} from "@/lib/risk-engine";
import { formatDZD } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.risk") };
}

export const dynamic = "force-dynamic";

const RANGES = [
  { days: 7, labelKey: "risk.ranges.last7" },
  { days: 14, labelKey: "risk.ranges.last14" },
  { days: 30, labelKey: "risk.ranges.last30" },
  { days: 90, labelKey: "risk.ranges.last90" },
] as const;
const LEVEL_COLORS: Record<RiskLevel, string> = {
  low: "var(--color-success)",
  medium: "var(--color-warning)",
  high: "var(--status-returned)",
  critical: "var(--color-destructive)",
};

export default async function RiskPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; tab?: string }>;
}) {
  const actorContext = await requireTrustedAction("risk.read");
  const { t, locale } = await getI18n();
  const resource = { shopId: actorContext.shop.shopId };
  const can = (action: Parameters<typeof trustedActionAllowed>[1]) =>
    trustedActionAllowed(actorContext, action, resource);
  const canAssess =
    can("customers.read") &&
    can("customers.contact.read") &&
    can("orders.financials.read");
  const canManage = can("risk.manage");

  if (!canAssess) {
    return (
      <div className="app-content page-sections">
        <PageHeader title={t("risk.title")} description={t("risk.subtitle")} />
        <StateSurface
          icon={ShieldAlert}
          title={t("error.forbidden")}
          description={t("error.forbiddenDesc")}
          tone="warning"
          size="panel"
        />
      </div>
    );
  }

  const params = await searchParams;
  const requestedDays = Number(params.days);
  const days = [7, 14, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const allowedTabs = new Set([
    "overview",
    "analysis",
    "blacklist",
    ...(canManage ? ["control", "rules"] : []),
  ]);
  const activeTab =
    params.tab && allowedTabs.has(params.tab) ? params.tab : "overview";
  const context = { prisma: db, shop: shopContext };
  const [report, config, blacklisted, rules] = await Promise.all([
    getRiskAnalyticsReport(context, days),
    getRiskConfig(context),
    listBlacklistedCustomers(context),
    canManage ? getRiskRules(context) : Promise.resolve([]),
  ]);

  const kpis = report.kpis;
  const dateLocale =
    locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ";
  const integerFormatter = new Intl.NumberFormat(dateLocale, {
    maximumFractionDigits: 0,
  });
  const percentFormatter = new Intl.NumberFormat(dateLocale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const signedPointsFormatter = new Intl.NumberFormat(dateLocale, {
    signDisplay: "exceptZero",
    maximumFractionDigits: 1,
  });
  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale, {
      month: "short",
      day: "numeric",
    });
  const pct = (value: number) => percentFormatter.format(value);
  const riskCopy = (key: RiskWorkspaceCopyKey) =>
    getRiskWorkspaceCopy(locale, key);

  const distributionData: BreakdownDatum[] = report.distribution.map((row) => ({
    key: row.level,
    label: t(`risk.level.${row.level}`),
    value: row.count,
    color: LEVEL_COLORS[row.level],
  }));
  const distributionConfig: ChartConfig = Object.fromEntries(
    report.distribution.map((row) => [
      row.level,
      {
        label: t(`risk.level.${row.level}`),
        color: LEVEL_COLORS[row.level],
      },
    ]),
  );
  const trendData = report.trend.map((row) => ({
    date: shortDate(row.date),
    score: row.avgScore,
    critical: row.criticalCount,
  }));
  const trendConfig: ChartConfig = {
    score: {
      label: t("risk.kpi.avgScore"),
      color: "var(--color-chart-1)",
    },
  };
  const riskLevelForScore = (score: number): RiskLevel =>
    score >= config.thresholds.high
      ? "critical"
      : score >= config.thresholds.medium
        ? "high"
        : score >= config.thresholds.low
          ? "medium"
          : "low";
  const avgRiskLevel = riskLevelForScore(kpis.avgRiskScore);
  const highRiskShare =
    report.totalOrders > 0 ? kpis.highRiskOrderCount / report.totalOrders : 0;
  const wilayaData: RankedMetricDatum[] = report.riskByWilaya.map((row) => {
    const level = riskLevelForScore(row.avgScore);
    return {
      key: row.wilaya,
      label: row.wilaya,
      value: row.avgScore,
      displayValue: `${integerFormatter.format(row.avgScore)}/100`,
      detail: t(`risk.level.${level}`),
      color: LEVEL_COLORS[level],
    };
  });
  const highestRiskWilaya = [...report.riskByWilaya].sort(
    (left, right) => right.avgScore - left.avgScore,
  )[0];
  const topFactor = report.attentionFactors[0];
  const riskReferenceLines = [
    {
      value: config.thresholds.low,
      label: t("risk.level.low"),
      color: LEVEL_COLORS.low,
    },
    {
      value: config.thresholds.medium,
      label: t("risk.level.medium"),
      color: LEVEL_COLORS.medium,
    },
    {
      value: config.thresholds.high,
      label: t("risk.level.high"),
      color: LEVEL_COLORS.critical,
    },
  ];

  return (
    <div
      className="app-content page-sections"
      data-risk-analytics-generation="class-aaa"
      data-risk-seller-workspace="v3"
    >
      <PageHeader title={t("risk.title")} description={t("risk.subtitle")} />

      <Tabs defaultValue={activeTab} className="w-full space-y-5">
        <div
          data-risk-workspace-toolbar="true"
          className="flex flex-col gap-3 border-b border-border/70 pb-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto lg:w-auto">
            <TabsTrigger value="overview" asChild>
              <Link href={`/risk?days=${days}&tab=overview`}>
                {t("risk.overview")}
              </Link>
            </TabsTrigger>
            <TabsTrigger value="analysis" asChild>
              <Link href={`/risk?days=${days}&tab=analysis`}>
                {t("risk.analysis")}
              </Link>
            </TabsTrigger>
            <TabsTrigger value="blacklist" asChild>
              <Link href={`/risk?days=${days}&tab=blacklist`}>
                {t("risk.blacklist")}
              </Link>
            </TabsTrigger>
            {canManage ? (
              <TabsTrigger value="control" asChild>
                <Link href={`/risk?days=${days}&tab=control`}>
                  {t("risk.control")}
                </Link>
              </TabsTrigger>
            ) : null}
            {canManage ? (
              <TabsTrigger value="rules" asChild>
                <Link href={`/risk?days=${days}&tab=rules`}>
                  {t("risk.rules")}
                </Link>
              </TabsTrigger>
            ) : null}
          </TabsList>

          <div className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border bg-background p-1">
            {RANGES.map((range) => (
              <Link
                key={range.days}
                href={`/risk?days=${range.days}&tab=${activeTab}`}
                className={`rounded-md px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                  days === range.days
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {t(range.labelKey)}
              </Link>
            ))}
          </div>
        </div>

        <TabsContent value="overview" className="mt-0 space-y-5">
          <div
            data-risk-overview-kpis="true"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <StatCard
              label={t("risk.kpi.avgScore")}
              value={integerFormatter.format(kpis.avgRiskScore)}
              icon={<ShieldAlert />}
              subtitle={
                <RiskLevelBadgeServer
                  level={avgRiskLevel}
                  label={t(`risk.level.${avgRiskLevel}`)}
                />
              }
              emphasis="standard"
              tone="neutral"
            />
            <StatCard
              label={t("risk.kpi.highRiskOrders")}
              value={integerFormatter.format(kpis.highRiskOrderCount)}
              icon={
                <AlertTriangle
                  className={
                    kpis.highRiskOrderCount > 0 ? "text-destructive" : undefined
                  }
                />
              }
              subtitle={
                report.totalOrders > 0
                  ? `${pct(highRiskShare)} ${t("risk.confirmationByLevel.total")}`
                  : undefined
              }
              emphasis="standard"
              tone="neutral"
            />
            <StatCard
              label={t("risk.kpi.confirmationRate")}
              value={pct(kpis.confirmationRate)}
              icon={<TrendingUp />}
              emphasis="standard"
              tone="neutral"
            />
            <StatCard
              label={t("risk.kpi.potentialSavings")}
              value={formatDZD(kpis.potentialSavingsDzd, locale)}
              icon={<PiggyBank />}
              emphasis="standard"
              tone="neutral"
            />
          </div>

          <div data-risk-primary-trend="true">
            <ChartCard
              title={t("risk.trend.title")}
              description={t("risk.trend.subtitle")}
              summary={`${t("risk.kpi.avgScore")}: ${integerFormatter.format(kpis.avgRiskScore)} · ${t("risk.confirmationByLevel.total")}: ${integerFormatter.format(report.totalOrders)}`}
              icon={<TrendingUp className="size-4" />}
              config={trendConfig}
              className="w-full"
              height="clamp(20rem, 30vw, 25rem)"
            >
              {trendData.length > 0 ? (
                <AreaTrendChart
                  data={trendData}
                  xKey="date"
                  series={[
                    {
                      key: "score",
                      label: t("risk.kpi.avgScore"),
                      format: "number",
                    },
                  ]}
                  config={trendConfig}
                  formatY="number"
                  yDomain={[0, 100]}
                  referenceLines={riskReferenceLines}
                />
              ) : (
                <ChartEmpty message="—" />
              )}
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
            <ChartCard
              title={t("risk.distribution.title")}
              description={t("risk.distribution.subtitle")}
              summary={`${t("risk.confirmationByLevel.total")}: ${integerFormatter.format(report.totalOrders)}`}
              icon={<Activity className="size-4" />}
              config={distributionConfig}
            >
              {distributionData.some((row) => row.value > 0) ? (
                <SegmentedBreakdown
                  data={distributionData}
                  total={report.totalOrders}
                  formatValue={(value) => integerFormatter.format(value)}
                  formatPercent={(fraction) =>
                    percentFormatter.format(fraction)
                  }
                />
              ) : (
                <ChartEmpty message="—" />
              )}
            </ChartCard>

            <Card
              data-risk-seller-signals="true"
              className="border shadow-none"
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                <div className="min-w-0">
                  <CardTitle className="text-base">
                    {riskCopy("attentionTitle")}
                  </CardTitle>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {riskCopy("attentionDescription")}
                  </p>
                </div>
                <Button asChild variant="ghost" size="icon-sm">
                  <Link
                    href={`/risk?days=${days}&tab=analysis`}
                    aria-label={riskCopy("openAnalysis")}
                  >
                    <ArrowRight
                      className="size-4 rtl:rotate-180"
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border/70">
                  <div className="flex min-w-0 items-center gap-3 py-3 first:pt-1">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/35 text-muted-foreground">
                      <TrendingDown className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("risk.kpi.returnRate")}
                      </p>
                      <p className="mt-0.5 text-base font-semibold tabular-nums">
                        {pct(kpis.returnRate)}
                      </p>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-center gap-3 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/35 text-muted-foreground">
                      <Ban className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("risk.kpi.blacklistedCustomers")}
                      </p>
                      <p className="mt-0.5 text-base font-semibold tabular-nums">
                        {integerFormatter.format(kpis.blacklistedCustomerCount)}
                      </p>
                    </div>
                    <Button asChild variant="ghost" size="icon-sm">
                      <Link
                        href={`/risk?days=${days}&tab=blacklist`}
                        aria-label={t("risk.blacklist")}
                      >
                        <ArrowRight
                          className="size-4 rtl:rotate-180"
                          aria-hidden="true"
                        />
                      </Link>
                    </Button>
                  </div>

                  <div className="flex min-w-0 items-center gap-3 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/35 text-muted-foreground">
                      <Activity className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        {riskCopy("highestImpactFactor")}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold">
                        {topFactor ? t(topFactor.labelKey) : "—"}
                      </p>
                      {topFactor ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {integerFormatter.format(topFactor.occurrenceCount)} {t("risk.topFactors.occurrences")}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex min-w-0 items-center gap-3 py-3 last:pb-1">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/35 text-muted-foreground">
                      <MapPin className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("risk.byWilaya.title")}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold">
                        {highestRiskWilaya?.wilaya ?? "—"}
                      </p>
                    </div>
                    {highestRiskWilaya ? (
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                        {integerFormatter.format(highestRiskWilaya.avgScore)}/100
                      </span>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="mt-0 space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title={t("risk.byWilaya.title")}
              description={t("risk.byWilaya.subtitle")}
              summary={`${t("risk.byWilaya.title")}: ${integerFormatter.format(wilayaData.length)}`}
              icon={<MapPin className="size-4" />}
              config={{}}
            >
              {wilayaData.length > 0 ? (
                <RankedMetricList data={wilayaData} maxValue={100} />
              ) : (
                <ChartEmpty message="—" />
              )}
            </ChartCard>
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">
                  {t("risk.topFactors.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("risk.topFactors.factor")}</TableHead>
                      <TableHead className="text-end">
                        {t("risk.topFactors.occurrences")}
                      </TableHead>
                      <TableHead className="text-end">
                        {t("risk.topFactors.avgPoints")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.topFactors.map((factor) => (
                      <TableRow key={factor.factorId}>
                        <TableCell className="font-medium">
                          {t(factor.labelKey)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {integerFormatter.format(factor.occurrenceCount)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {signedPointsFormatter.format(factor.avgPoints)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card data-risk-confirmation-table="true" className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base">
                {t("risk.confirmationByLevel.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t("risk.confirmationByLevel.level")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("risk.confirmationByLevel.total")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("risk.confirmationByLevel.delivered")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("risk.confirmationByLevel.returned")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("risk.confirmationByLevel.confirmationRate")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("risk.confirmationByLevel.returnRate")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.confirmationByLevel.map((row) => (
                    <TableRow key={row.level}>
                      <TableCell>
                        <RiskLevelBadgeServer
                          level={row.level}
                          label={t(`risk.level.${row.level}`)}
                        />
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {integerFormatter.format(row.total)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {integerFormatter.format(row.delivered)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {integerFormatter.format(row.returned + row.refused)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {pct(row.confirmationRate)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {pct(row.returnRate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blacklist" className="mt-0">
          <RiskBlacklistPanel customers={blacklisted} canManage={canManage} />
        </TabsContent>
        {canManage ? (
          <TabsContent value="control" className="mt-0">
            <RiskControlPanel config={config} />
          </TabsContent>
        ) : null}
        {canManage ? (
          <TabsContent value="rules" className="mt-0">
            <RiskRulesPanel rules={rules} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
