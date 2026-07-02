import { getI18n } from "@/lib/i18n-server";
import { getRiskAnalyticsReport, getRiskConfig, getRiskRules, listBlacklistedCustomers } from "@/lib/risk-engine";
import { formatDZD } from "@/lib/utils";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { PremiumTable } from "@/components/shared/premium-table";
import { ChartCard } from "@/components/charts/chart-primitives";
import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import { HorizontalBarChart, type HBarDatum } from "@/components/charts/horizontal-bar-chart";
import { RiskControlPanel } from "@/components/risk/risk-control-panel";
import { RiskRulesPanel } from "@/components/risk/risk-rules-panel";
import { RiskBlacklistPanel } from "@/components/risk/risk-blacklist-panel";
import { RiskLevelBadgeServer, RiskActionBadgeServer } from "@/components/risk/risk-badges";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, TrendingUp, TrendingDown, AlertTriangle, Ban, PiggyBank, Activity, MapPin } from "lucide-react";
import type { Metadata } from "next";
import type { ChartConfig } from "@/components/ui/chart";
import type { RiskLevel } from "@/lib/risk-engine";

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
  low: "var(--color-chart-2)",      // emerald
  medium: "var(--color-chart-3)",   // amber
  high: "var(--status-returned)",   // orange-red
  critical: "var(--color-destructive)",
};

export default async function RiskPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; tab?: string }>;
}) {
  const { t, locale } = await getI18n();
  const { days: daysParam, tab: tabParam } = await searchParams;
  const days = Number(daysParam);
  const validDays = [7, 14, 30, 90].includes(days) ? days : 30;
  const activeTab = tabParam ?? "overview";

  const [report, config, rules, blacklisted] = await Promise.all([
    getRiskAnalyticsReport(validDays),
    getRiskConfig(),
    getRiskRules(),
    listBlacklistedCustomers(),
  ]);

  const k = report.kpis;
  const dateLocale = locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-FR";
  const fmtShortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale, { month: "short", day: "numeric" });

  // ── Distribution donut ──
  const distributionData: DonutDatum[] = report.distribution.map((d) => ({
    key: d.level,
    label: t(`risk.level.${d.level}`),
    value: d.count,
    color: LEVEL_COLORS[d.level],
  }));
  const distributionConfig: ChartConfig = {
    low: { label: t("risk.level.low"), color: LEVEL_COLORS.low },
    medium: { label: t("risk.level.medium"), color: LEVEL_COLORS.medium },
    high: { label: t("risk.level.high"), color: LEVEL_COLORS.high },
    critical: { label: t("risk.level.critical"), color: LEVEL_COLORS.critical },
  };

  // ── Trend area chart ──
  const trendData = report.trend.map((p) => ({
    date: fmtShortDate(p.date),
    score: p.avgScore,
    critical: p.criticalCount,
  }));
  const trendConfig: ChartConfig = {
    score: { label: t("risk.kpi.avgScore"), color: "var(--color-chart-1)" },
  };

  // ── Risk by wilaya horizontal bar ──
  const wilayaData: HBarDatum[] = report.riskByWilaya.map((w) => ({
    key: w.wilaya,
    label: w.wilaya,
    value: w.avgScore,
    color: w.avgScore >= config.thresholds.high
      ? LEVEL_COLORS.critical
      : w.avgScore >= config.thresholds.medium
        ? LEVEL_COLORS.high
        : w.avgScore >= config.thresholds.low
          ? LEVEL_COLORS.medium
          : LEVEL_COLORS.low,
  }));

  const emptyChartConfig: ChartConfig = {};

  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("risk.title")}
        description={t("risk.subtitle")}
      />

      {/* Range selector */}
      <div className="flex items-center gap-1 rounded-lg border bg-card p-1 w-fit">
        {RANGES.map((r) => (
          <Link
            key={r.days}
            href={`/risk?days=${r.days}&tab=${activeTab}`}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              validDays === r.days
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t(r.labelKey)}
          </Link>
        ))}
      </div>

      {/* KPI stat cards */}
      <div className="stagger-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={t("risk.kpi.avgScore")}
          value={k.avgRiskScore}
          icon={<ShieldAlert />}
          accentBg="bg-teal-500/10 dark:bg-teal-500/15"
          accentIcon="text-teal-600 dark:text-teal-400"
          subtitle="/ 100"
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("risk.kpi.confirmationRate")}
          value={fmtPct(k.confirmationRate)}
          icon={<TrendingUp />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-emerald-600 dark:text-emerald-400"
          trend={k.confirmationRate >= 0.7 ? 1 : -1}
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("risk.kpi.returnRate")}
          value={fmtPct(k.returnRate)}
          icon={<TrendingDown />}
          accentBg="bg-red-500/10 dark:bg-red-500/15"
          accentIcon="text-red-600 dark:text-red-400"
          trend={k.returnRate <= 0.2 ? 1 : -1}
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("risk.kpi.highRiskOrders")}
          value={k.highRiskOrderCount}
          icon={<AlertTriangle />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-amber-600 dark:text-amber-400"
          subtitle={report.totalOrders > 0 ? `${Math.round((k.highRiskOrderCount / report.totalOrders) * 100)}% ${t("risk.confirmationByLevel.total")}` : undefined}
          style={{ animationDelay: "240ms" }}
        />
        <StatCard
          label={t("risk.kpi.blacklistedCustomers")}
          value={k.blacklistedCustomerCount}
          icon={<Ban />}
          accentBg="bg-zinc-500/10 dark:bg-zinc-500/15"
          accentIcon="text-zinc-600 dark:text-zinc-400"
          style={{ animationDelay: "300ms" }}
        />
        <StatCard
          label={t("risk.kpi.potentialSavings")}
          value={formatDZD(k.potentialSavingsDzd)}
          icon={<PiggyBank />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-emerald-600 dark:text-emerald-400"
          subtitle={t("risk.blacklist.subtitle")}
          style={{ animationDelay: "360ms" }}
        />
      </div>

      {/* Tabs: Overview / Analysis / Control / Blacklist / Rules */}
      <Tabs defaultValue={activeTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="overview" asChild>
            <Link href={`/risk?days=${validDays}&tab=overview`}>{t("risk.overview")}</Link>
          </TabsTrigger>
          <TabsTrigger value="analysis" asChild>
            <Link href={`/risk?days=${validDays}&tab=analysis`}>{t("risk.analysis")}</Link>
          </TabsTrigger>
          <TabsTrigger value="control" asChild>
            <Link href={`/risk?days=${validDays}&tab=control`}>{t("risk.control")}</Link>
          </TabsTrigger>
          <TabsTrigger value="blacklist" asChild>
            <Link href={`/risk?days=${validDays}&tab=blacklist`}>{t("risk.blacklist")}</Link>
          </TabsTrigger>
          <TabsTrigger value="rules" asChild>
            <Link href={`/risk?days=${validDays}&tab=rules`}>{t("risk.rules")}</Link>
          </TabsTrigger>
        </TabsList>

        {/* ── Overview tab ── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Distribution donut */}
            <ChartCard
              title={t("risk.distribution.title")}
              description={t("risk.distribution.subtitle")}
              icon={<Activity className="h-4 w-4" />}
              config={distributionConfig}
            >
              {distributionData.length > 0 && distributionData.some((d) => d.value > 0) ? (
                <DonutChart data={distributionData} config={distributionConfig} />
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                  {t("risk.confirmationByLevel.total")}: 0
                </div>
              )}
            </ChartCard>

            {/* Trend */}
            <ChartCard
              title={t("risk.trend.title")}
              description={t("risk.trend.subtitle")}
              icon={<TrendingUp className="h-4 w-4" />}
              config={trendConfig}
            >
              {trendData.length > 0 ? (
                <AreaTrendChart
                  data={trendData}
                  xKey="date"
                  series={[{ key: "score", label: t("risk.kpi.avgScore") }]}
                  config={trendConfig}
                />
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                  —
                </div>
              )}
            </ChartCard>
          </div>

          {/* Confirmation by level — the proof table */}
          <Card className="animate-fade-up">
            <CardHeader>
              <CardTitle className="text-base">{t("risk.confirmationByLevel.title")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("risk.confirmationByLevel.subtitle")}</p>
            </CardHeader>
            <CardContent>
              {report.confirmationByLevel.every((r) => r.total === 0) ? (
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">—</div>
              ) : (
                <PremiumTable>
                  <PremiumTable.Header>
                    <PremiumTable.Row>
                      <PremiumTable.Head>{t("risk.confirmationByLevel.level")}</PremiumTable.Head>
                      <PremiumTable.Head align="end">{t("risk.confirmationByLevel.total")}</PremiumTable.Head>
                      <PremiumTable.Head align="end">{t("risk.confirmationByLevel.delivered")}</PremiumTable.Head>
                      <PremiumTable.Head align="end">{t("risk.confirmationByLevel.returned")}</PremiumTable.Head>
                      <PremiumTable.Head align="end">{t("risk.confirmationByLevel.confirmationRate")}</PremiumTable.Head>
                      <PremiumTable.Head align="end">{t("risk.confirmationByLevel.returnRate")}</PremiumTable.Head>
                    </PremiumTable.Row>
                  </PremiumTable.Header>
                  <PremiumTable.Body>
                    {report.confirmationByLevel.map((row) => (
                      <PremiumTable.Row key={row.level}>
                        <PremiumTable.Cell>
                          <RiskLevelBadgeServer level={row.level} label={t(`risk.level.${row.level}`)} />
                        </PremiumTable.Cell>
                        <PremiumTable.Cell align="end" className="tabular-nums">{row.total}</PremiumTable.Cell>
                        <PremiumTable.Cell align="end" className="tabular-nums text-emerald-600 dark:text-emerald-400">{row.delivered}</PremiumTable.Cell>
                        <PremiumTable.Cell align="end" className="tabular-nums text-red-600 dark:text-red-400">{row.returned + row.refused}</PremiumTable.Cell>
                        <PremiumTable.Cell align="end" className="tabular-nums font-medium">{fmtPct(row.confirmationRate)}</PremiumTable.Cell>
                        <PremiumTable.Cell align="end" className="tabular-nums">{fmtPct(row.returnRate)}</PremiumTable.Cell>
                      </PremiumTable.Row>
                    ))}
                  </PremiumTable.Body>
                </PremiumTable>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Analysis tab ── */}
        <TabsContent value="analysis" className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Risk by wilaya */}
            <ChartCard
              title={t("risk.byWilaya.title")}
              description={t("risk.byWilaya.subtitle")}
              icon={<MapPin className="h-4 w-4" />}
              config={emptyChartConfig}
            >
              {wilayaData.length > 0 ? (
                <HorizontalBarChart data={wilayaData} config={emptyChartConfig} />
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">—</div>
              )}
            </ChartCard>

            {/* Top factors */}
            <Card className="animate-fade-up">
              <CardHeader>
                <CardTitle className="text-base">{t("risk.topFactors.title")}</CardTitle>
                <p className="text-sm text-muted-foreground">{t("risk.topFactors.subtitle")}</p>
              </CardHeader>
              <CardContent>
                {report.topFactors.length === 0 ? (
                  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">—</div>
                ) : (
                  <PremiumTable>
                    <PremiumTable.Header>
                      <PremiumTable.Row>
                        <PremiumTable.Head>{t("risk.topFactors.factor")}</PremiumTable.Head>
                        <PremiumTable.Head align="end">{t("risk.topFactors.occurrences")}</PremiumTable.Head>
                        <PremiumTable.Head align="end">{t("risk.topFactors.avgPoints")}</PremiumTable.Head>
                      </PremiumTable.Row>
                    </PremiumTable.Header>
                    <PremiumTable.Body>
                      {report.topFactors.map((f) => (
                        <PremiumTable.Row key={f.factorId}>
                          <PremiumTable.Cell className="font-medium">{t(f.labelKey)}</PremiumTable.Cell>
                          <PremiumTable.Cell align="end" className="tabular-nums">{f.occurrenceCount}</PremiumTable.Cell>
                          <PremiumTable.Cell align="end" className={`tabular-nums ${f.avgPoints > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {f.avgPoints > 0 ? "+" : ""}{f.avgPoints}
                          </PremiumTable.Cell>
                        </PremiumTable.Row>
                      ))}
                    </PremiumTable.Body>
                  </PremiumTable>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Rule trigger summary */}
          <Card className="animate-fade-up">
            <CardHeader>
              <CardTitle className="text-base">{t("risk.rules.title")}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("risk.rules.subtitle")}</p>
            </CardHeader>
            <CardContent>
              {report.ruleTriggers.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">—</div>
              ) : (
                <PremiumTable>
                  <PremiumTable.Header>
                    <PremiumTable.Row>
                      <PremiumTable.Head>{t("risk.rules.title")}</PremiumTable.Head>
                      <PremiumTable.Head align="center">{t("risk.rules.toggle")}</PremiumTable.Head>
                      <PremiumTable.Head align="end">{t("risk.rules.triggerCount")}</PremiumTable.Head>
                    </PremiumTable.Row>
                  </PremiumTable.Header>
                  <PremiumTable.Body>
                    {report.ruleTriggers.map((r) => (
                      <PremiumTable.Row key={r.ruleId}>
                        <PremiumTable.Cell className="font-medium">{t(r.labelKey)}</PremiumTable.Cell>
                        <PremiumTable.Cell align="center">
                          <RiskActionBadgeServer action={r.enabled ? "auto_confirm" : "standard"} label={r.enabled ? t("risk.rules.enabled") : t("risk.rules.disabled")} />
                        </PremiumTable.Cell>
                        <PremiumTable.Cell align="end" className="tabular-nums">{r.triggerCount}</PremiumTable.Cell>
                      </PremiumTable.Row>
                    ))}
                  </PremiumTable.Body>
                </PremiumTable>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Control tab ── */}
        <TabsContent value="control">
          <RiskControlPanel config={config} />
        </TabsContent>

        {/* ── Blacklist tab ── */}
        <TabsContent value="blacklist">
          <RiskBlacklistPanel customers={blacklisted} />
        </TabsContent>

        {/* ── Rules tab ── */}
        <TabsContent value="rules">
          <RiskRulesPanel rules={rules} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
