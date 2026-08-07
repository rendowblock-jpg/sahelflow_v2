import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Ban,
  MapPin,
  PiggyBank,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import { ChartCard } from "@/components/charts/chart-primitives";
import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { HorizontalBarChart, type HBarDatum } from "@/components/charts/horizontal-bar-chart";
import { RiskBlacklistPanel } from "@/components/risk/risk-blacklist-panel";
import { RiskControlPanel } from "@/components/risk/risk-control-panel";
import { RiskLevelBadgeServer } from "@/components/risk/risk-badges";
import { RiskRulesPanel } from "@/components/risk/risk-rules-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StateSurface } from "@/components/shared/state-surface";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
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
  low: "var(--color-chart-2)",
  medium: "var(--color-chart-3)",
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
  const activeTab = params.tab && allowedTabs.has(params.tab) ? params.tab : "overview";
  const context = { prisma: db, shop: shopContext };
  const [report, config, blacklisted, rules] = await Promise.all([
    getRiskAnalyticsReport(context, days),
    getRiskConfig(context),
    listBlacklistedCustomers(context),
    canManage ? getRiskRules(context) : Promise.resolve([]),
  ]);
  const kpis = report.kpis;
  const dateLocale = locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-FR";
  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale, { month: "short", day: "numeric" });
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  const distributionData: DonutDatum[] = report.distribution.map((row) => ({
    key: row.level,
    label: t(`risk.level.${row.level}`),
    value: row.count,
    color: LEVEL_COLORS[row.level],
  }));
  const distributionConfig: ChartConfig = Object.fromEntries(
    report.distribution.map((row) => [
      row.level,
      { label: t(`risk.level.${row.level}`), color: LEVEL_COLORS[row.level] },
    ]),
  );
  const trendData = report.trend.map((row) => ({
    date: shortDate(row.date),
    score: row.avgScore,
    critical: row.criticalCount,
  }));
  const trendConfig: ChartConfig = {
    score: { label: t("risk.kpi.avgScore"), color: "var(--color-chart-1)" },
  };
  const wilayaData: HBarDatum[] = report.riskByWilaya.map((row) => ({
    key: row.wilaya,
    label: row.wilaya,
    value: row.avgScore,
    color:
      row.avgScore >= config.thresholds.high
        ? LEVEL_COLORS.critical
        : row.avgScore >= config.thresholds.medium
          ? LEVEL_COLORS.high
          : row.avgScore >= config.thresholds.low
            ? LEVEL_COLORS.medium
            : LEVEL_COLORS.low,
  }));

  return (
    <div className="app-content page-sections">
      <PageHeader title={t("risk.title")} description={t("risk.subtitle")} />

      <div className="flex w-fit flex-wrap items-center gap-1 rounded-lg border bg-background p-1">
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

      <div className="card-grid-3">
        <StatCard label={t("risk.kpi.avgScore")} value={kpis.avgRiskScore} icon={<ShieldAlert />} subtitle="/ 100" />
        <StatCard label={t("risk.kpi.confirmationRate")} value={pct(kpis.confirmationRate)} icon={<TrendingUp />} trend={kpis.confirmationRate >= 0.7 ? 1 : -1} />
        <StatCard label={t("risk.kpi.returnRate")} value={pct(kpis.returnRate)} icon={<TrendingDown />} trend={kpis.returnRate <= 0.2 ? 1 : -1} />
        <StatCard label={t("risk.kpi.highRiskOrders")} value={kpis.highRiskOrderCount} icon={<AlertTriangle />} subtitle={report.totalOrders > 0 ? `${Math.round((kpis.highRiskOrderCount / report.totalOrders) * 100)}% ${t("risk.confirmationByLevel.total")}` : undefined} />
        <StatCard label={t("risk.kpi.blacklistedCustomers")} value={kpis.blacklistedCustomerCount} icon={<Ban />} />
        <StatCard label={t("risk.kpi.potentialSavings")} value={formatDZD(kpis.potentialSavingsDzd)} icon={<PiggyBank />} />
      </div>

      <Tabs defaultValue={activeTab} className="w-full">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview" asChild><Link href={`/risk?days=${days}&tab=overview`}>{t("risk.overview")}</Link></TabsTrigger>
          <TabsTrigger value="analysis" asChild><Link href={`/risk?days=${days}&tab=analysis`}>{t("risk.analysis")}</Link></TabsTrigger>
          <TabsTrigger value="blacklist" asChild><Link href={`/risk?days=${days}&tab=blacklist`}>{t("risk.blacklist")}</Link></TabsTrigger>
          {canManage ? <TabsTrigger value="control" asChild><Link href={`/risk?days=${days}&tab=control`}>{t("risk.control")}</Link></TabsTrigger> : null}
          {canManage ? <TabsTrigger value="rules" asChild><Link href={`/risk?days=${days}&tab=rules`}>{t("risk.rules")}</Link></TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title={t("risk.distribution.title")}
              description={t("risk.distribution.subtitle")}
              summary={`${t("risk.confirmationByLevel.total")}: ${report.totalOrders}`}
              icon={<Activity className="size-4" />}
              config={distributionConfig}
            >
              {distributionData.some((row) => row.value > 0) ? (
                <DonutChart data={distributionData} config={distributionConfig} />
              ) : <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">—</div>}
            </ChartCard>
            <ChartCard
              title={t("risk.trend.title")}
              description={t("risk.trend.subtitle")}
              summary={`${t("risk.kpi.avgScore")}: ${kpis.avgRiskScore}`}
              icon={<TrendingUp className="size-4" />}
              config={trendConfig}
            >
              {trendData.length > 0 ? (
                <AreaTrendChart data={trendData} xKey="date" series={[{ key: "score", label: t("risk.kpi.avgScore") }]} config={trendConfig} />
              ) : <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">—</div>}
            </ChartCard>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("risk.confirmationByLevel.title")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("risk.confirmationByLevel.level")}</TableHead>
                  <TableHead className="text-end">{t("risk.confirmationByLevel.total")}</TableHead>
                  <TableHead className="text-end">{t("risk.confirmationByLevel.delivered")}</TableHead>
                  <TableHead className="text-end">{t("risk.confirmationByLevel.returned")}</TableHead>
                  <TableHead className="text-end">{t("risk.confirmationByLevel.confirmationRate")}</TableHead>
                  <TableHead className="text-end">{t("risk.confirmationByLevel.returnRate")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {report.confirmationByLevel.map((row) => (
                    <TableRow key={row.level}>
                      <TableCell><RiskLevelBadgeServer level={row.level} label={t(`risk.level.${row.level}`)} /></TableCell>
                      <TableCell className="text-end tabular-nums">{row.total}</TableCell>
                      <TableCell className="text-end tabular-nums">{row.delivered}</TableCell>
                      <TableCell className="text-end tabular-nums">{row.returned + row.refused}</TableCell>
                      <TableCell className="text-end tabular-nums">{pct(row.confirmationRate)}</TableCell>
                      <TableCell className="text-end tabular-nums">{pct(row.returnRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title={t("risk.byWilaya.title")}
              description={t("risk.byWilaya.subtitle")}
              summary={`${t("risk.byWilaya.title")}: ${wilayaData.length}`}
              icon={<MapPin className="size-4" />}
              config={{}}
            >
              {wilayaData.length > 0 ? <HorizontalBarChart data={wilayaData} config={{}} /> : <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">—</div>}
            </ChartCard>
            <Card>
              <CardHeader><CardTitle className="text-base">{t("risk.topFactors.title")}</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>{t("risk.topFactors.factor")}</TableHead>
                    <TableHead className="text-end">{t("risk.topFactors.occurrences")}</TableHead>
                    <TableHead className="text-end">{t("risk.topFactors.avgPoints")}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{report.topFactors.map((factor) => (
                    <TableRow key={factor.factorId}>
                      <TableCell className="font-medium">{t(factor.labelKey)}</TableCell>
                      <TableCell className="text-end tabular-nums">{factor.occurrenceCount}</TableCell>
                      <TableCell className="text-end tabular-nums">{factor.avgPoints > 0 ? "+" : ""}{factor.avgPoints}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="blacklist">
          <RiskBlacklistPanel customers={blacklisted} canManage={canManage} />
        </TabsContent>
        {canManage ? <TabsContent value="control"><RiskControlPanel config={config} /></TabsContent> : null}
        {canManage ? <TabsContent value="rules"><RiskRulesPanel rules={rules} /></TabsContent> : null}
      </Tabs>
    </div>
  );
}
