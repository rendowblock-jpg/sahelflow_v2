import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, PhoneCall, ShieldAlert, TrendingDown, TrendingUp, Truck } from "lucide-react";

import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import { ChartCard, ChartEmpty } from "@/components/charts/chart-primitives";
import type { ChartConfig } from "@/components/charts/chart-types";
import { RankedMetricList, type RankedMetricDatum } from "@/components/charts/decision-visualizations";
import { RiskBlacklistPanel } from "@/components/risk/risk-blacklist-panel";
import { RiskControlPanel } from "@/components/risk/risk-control-panel";
import { RiskLevelBadgeServer } from "@/components/risk/risk-badges";
import { RiskRulesPanel } from "@/components/risk/risk-rules-panel";
import { CheckBeforeShipping, ScoreCheck, WhereYouLoseMoney } from "@/components/risk/risk-seller-sections";
import { PageHeader } from "@/components/shared/page-header";
import { StateSurface } from "@/components/shared/state-surface";
import { StatCard } from "@/components/shared/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  formatPositiveRiskPoints,
  getRiskWorkspaceCopy,
  type RiskWorkspaceCopyKey,
} from "@/lib/i18n/risk-workspace";
import { requireTrustedAction, trustedActionAllowed } from "@/lib/identity/authorization";
import { getRiskAnalyticsReport, getRiskConfig, getRiskRules, listBlacklistedCustomers } from "@/lib/risk-engine";
import { formatDZD, intlLocale } from "@/lib/utils";

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

const SOURCE_KEYS: Record<string, string> = {
  manual: "orders.source.manual",
  storefront: "orders.source.storefront",
  webstore: "orders.source.webstore",
  ai_chat: "orders.source.aiChat",
};

export default async function RiskPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; tab?: string }>;
}) {
  const actorContext = await requireTrustedAction("risk.read");
  const { t, locale } = await getI18n();
  const resource = { shopId: actorContext.shop.shopId };
  const can = (action: Parameters<typeof trustedActionAllowed>[1]) => trustedActionAllowed(actorContext, action, resource);
  const canAssess = can("customers.read") && can("customers.contact.read") && can("orders.financials.read");
  const canManage = can("risk.manage");

  if (!canAssess) {
    return (
      <div className="app-content page-sections">
        <PageHeader title={t("risk.title")} description={t("risk.subtitle")} />
        <StateSurface icon={ShieldAlert} title={t("error.forbidden")} description={t("error.forbiddenDesc")} tone="warning" size="panel" />
      </div>
    );
  }

  const params = await searchParams;
  const requestedDays = Number(params.days);
  const days = [7, 14, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const allowedTabs = new Set(["overview", "analysis", "blacklist", ...(canManage ? ["control", "rules"] : [])]);
  const activeTab = params.tab && allowedTabs.has(params.tab) ? params.tab : "overview";
  const context = { prisma: db, shop: shopContext };
  const [report, config, blacklisted, rules] = await Promise.all([
    getRiskAnalyticsReport(context, days),
    getRiskConfig(context),
    listBlacklistedCustomers(context),
    canManage ? getRiskRules(context) : Promise.resolve([]),
  ]);

  const kpis = report.kpis;
  const outcomes = report.insights.outcomes;
  const dateLocale = intlLocale(locale);
  const integerFormatter = new Intl.NumberFormat(dateLocale, { maximumFractionDigits: 0 });
  const percentFormatter = new Intl.NumberFormat(dateLocale, { style: "percent", maximumFractionDigits: 1 });
  const decimalFormatter = new Intl.NumberFormat(dateLocale, { maximumFractionDigits: 1 });
  const signedPointsFormatter = new Intl.NumberFormat(dateLocale, { signDisplay: "exceptZero", maximumFractionDigits: 1 });
  const pct = (value: number) => percentFormatter.format(value);
  const riskCopy = (key: RiskWorkspaceCopyKey, values?: Record<string, string | number>) =>
    getRiskWorkspaceCopy(locale, key, values);
  const copy = (key: string, values?: Record<string, string | number>) => riskCopy(key as RiskWorkspaceCopyKey, values);
  const format = {
    t: (key: string) => t(key),
    pct,
    dzd: (value: number) => formatDZD(value, locale),
    int: (value: number) => integerFormatter.format(value),
    dec: (value: number) => decimalFormatter.format(value),
  };
  const sourceLabel = (source: string) => (SOURCE_KEYS[source] ? t(SOURCE_KEYS[source]) : source.charAt(0).toUpperCase() + source.slice(1));

  const weekLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(dateLocale, { month: "short", day: "numeric" });
  const trendData = report.insights.weekly.map((row) => ({
    week: weekLabel(row.week),
    orders: row.orders,
    cameBack: row.cameBack,
  }));
  const trendConfig: ChartConfig = {
    orders: { label: riskCopy("seriesOrders"), color: "var(--color-chart-1)" },
    cameBack: { label: riskCopy("seriesCameBack"), color: "var(--color-destructive)" },
  };
  const wilayaRanked: RankedMetricDatum[] = report.insights.wilayaActivity.map((row) => ({
    key: row.wilaya,
    label: row.wilaya,
    value: row.orders,
    displayValue: integerFormatter.format(row.orders),
    detail: row.finished
      ? `${riskCopy("colReturnRate")} ${pct(row.returnRate)} · ${riskCopy("finished", { count: integerFormatter.format(row.finished) })}`
      : riskCopy("finished", { count: "0" }),
    color: row.finished && row.returnRate >= 0.3 ? "var(--color-destructive)" : "var(--color-chart-1)",
  }));
  const topFactor = report.attentionFactors[0];

  return (
    <div className="app-content page-sections" data-risk-analytics-generation="class-aaa" data-risk-seller-workspace="v4">
      {/* Page grammar: identity with its period control, then the KPIs, then
          the workspace tabs — the numbers lead, whichever tab is open. */}
      <PageHeader
        title={t("risk.title")}
        description={riskCopy("subtitle")}
        actions={
          <div className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-surface border bg-background p-1">
            {RANGES.map((range) => (
              <Link
                key={range.days}
                href={`/risk?days=${range.days}&tab=${activeTab}`}
                className={`rounded-control px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                  days === range.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {t(range.labelKey)}
              </Link>
            ))}
          </div>
        }
      />

      <div data-risk-overview-kpis="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={riskCopy("kpiDelivered")}
          value={outcomes.completed ? pct(outcomes.deliverySuccessRate) : "—"}
          icon={<Truck />}
          subtitle={riskCopy("kpiDeliveredHint", { delivered: integerFormatter.format(outcomes.delivered), completed: integerFormatter.format(outcomes.completed) })}
          emphasis="standard"
          tone="neutral"
        />
        <StatCard
          label={riskCopy("kpiReturnRate")}
          value={outcomes.completed ? pct(outcomes.returnRate) : "—"}
          icon={<TrendingDown />}
          subtitle={riskCopy("kpiReturnHint", { count: integerFormatter.format(outcomes.cameBack) })}
          emphasis="standard"
          tone="neutral"
        />
        <StatCard
          label={riskCopy("kpiLost")}
          value={formatDZD(outcomes.lostToReturnsDzd, locale)}
          icon={<Banknote />}
          subtitle={
            outcomes.unknownCostReturns > 0
              ? riskCopy("kpiLostUnknown", { count: integerFormatter.format(outcomes.unknownCostReturns) })
              : riskCopy("kpiLostHint")
          }
          emphasis="standard"
          tone="neutral"
        />
        <StatCard
          label={riskCopy("kpiToCheck")}
          value={integerFormatter.format(report.openRiskyCount)}
          icon={<PhoneCall />}
          subtitle={riskCopy("kpiToCheckHint")}
          emphasis="standard"
          tone="neutral"
        />
      </div>

      <Tabs defaultValue={activeTab} className="w-full space-y-5">
        <div data-risk-workspace-toolbar="true" className="flex flex-wrap items-center gap-3 border-b border-border/70 pb-4">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 lg:w-auto">
            <TabsTrigger value="overview" asChild>
              <Link href={`/risk?days=${days}&tab=overview`}>{t("risk.overview")}</Link>
            </TabsTrigger>
            <TabsTrigger value="analysis" asChild>
              <Link href={`/risk?days=${days}&tab=analysis`}>{riskCopy("tabLoss")}</Link>
            </TabsTrigger>
            <TabsTrigger value="blacklist" asChild>
              <Link href={`/risk?days=${days}&tab=blacklist`}>
                {t("risk.blacklist")}
                {kpis.blacklistedCustomerCount > 0 ? (
                  <span className="ms-1.5 rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                    {integerFormatter.format(kpis.blacklistedCustomerCount)}
                  </span>
                ) : null}
              </Link>
            </TabsTrigger>
            {canManage ? (
              <TabsTrigger value="control" asChild>
                <Link href={`/risk?days=${days}&tab=control`}>{t("risk.control")}</Link>
              </TabsTrigger>
            ) : null}
            {canManage ? (
              <TabsTrigger value="rules" asChild>
                <Link href={`/risk?days=${days}&tab=rules`}>{t("risk.rules")}</Link>
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0 space-y-5">
          <div data-risk-seller-signals="true" className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,1fr)]">
            <CheckBeforeShipping report={report} copy={copy} format={format} />
            <ScoreCheck report={report} copy={copy} format={format} />
          </div>

          <div data-risk-primary-trend="true">
            <ChartCard
              title={riskCopy("trendTitle")}
              description={riskCopy("trendHint")}
              summary={`${riskCopy("kpiReturnRate")}: ${outcomes.completed ? pct(outcomes.returnRate) : "—"}`}
              icon={<TrendingUp className="size-4" />}
              config={trendConfig}
              className="w-full"
              height="clamp(18rem, 26vw, 22rem)"
            >
              {trendData.length > 0 ? (
                <AreaTrendChart
                  data={trendData}
                  xKey="week"
                  series={[
                    { key: "orders", label: riskCopy("seriesOrders"), format: "number" },
                    { key: "cameBack", label: riskCopy("seriesCameBack"), format: "number" },
                  ]}
                  config={trendConfig}
                  formatY="number"
                />
              ) : (
                <ChartEmpty message={riskCopy("lossEmpty")} />
              )}
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="mt-0 space-y-6">
          <ChartCard
            title={riskCopy("wilayaActivityTitle")}
            description={riskCopy("wilayaActivityHint")}
            summary={`${riskCopy("colPlace")}: ${integerFormatter.format(wilayaRanked.length)}`}
            icon={<TrendingDown className="size-4" />}
            config={{}}
          >
            {wilayaRanked.length > 0 ? <RankedMetricList data={wilayaRanked} /> : <ChartEmpty message={riskCopy("lossEmpty")} />}
          </ChartCard>
          <WhereYouLoseMoney report={report} copy={copy} format={format} sourceLabel={sourceLabel} />

          <details className="group rounded-surface border bg-card" data-risk-score-details="true">
            <summary className="cursor-pointer list-none px-4 py-3.5 text-body font-semibold outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {riskCopy("scoreDetails")}
            </summary>
            <div className="space-y-5 border-t p-4">
              {topFactor ? (
                <p className="text-body-sm">
                  <span className="font-semibold">{riskCopy("highestImpactFactor")}: </span>
                  {t(topFactor.labelKey)} · {formatPositiveRiskPoints(locale, topFactor.positivePoints)}
                </p>
              ) : null}
              <div className="overflow-x-auto" data-risk-confirmation-table="true">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("risk.confirmationByLevel.level")}</TableHead>
                      <TableHead className="text-end">{t("risk.confirmationByLevel.total")}</TableHead>
                      <TableHead className="text-end">{t("risk.confirmationByLevel.delivered")}</TableHead>
                      <TableHead className="text-end">{t("risk.confirmationByLevel.returned")}</TableHead>
                      <TableHead className="text-end">{riskCopy("kpiDelivered")}</TableHead>
                      <TableHead className="text-end">{t("risk.confirmationByLevel.returnRate")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.confirmationByLevel.map((row) => (
                      <TableRow key={row.level}>
                        <TableCell>
                          <RiskLevelBadgeServer level={row.level} label={t(`risk.level.${row.level}`)} />
                        </TableCell>
                        <TableCell className="text-end tabular-nums">{integerFormatter.format(row.total)}</TableCell>
                        <TableCell className="text-end tabular-nums">{integerFormatter.format(row.delivered)}</TableCell>
                        <TableCell className="text-end tabular-nums">{integerFormatter.format(row.returned + row.refused)}</TableCell>
                        <TableCell className="text-end tabular-nums">{pct(row.confirmationRate)}</TableCell>
                        <TableCell className="text-end tabular-nums">{pct(row.returnRate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {report.topFactors.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("risk.topFactors.factor")}</TableHead>
                      <TableHead className="text-end">{t("risk.topFactors.occurrences")}</TableHead>
                      <TableHead className="text-end">{t("risk.topFactors.avgPoints")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.topFactors.map((factor) => (
                      <TableRow key={factor.factorId}>
                        <TableCell>{t(factor.labelKey)}</TableCell>
                        <TableCell className="text-end tabular-nums">{integerFormatter.format(factor.occurrenceCount)}</TableCell>
                        <TableCell className="text-end tabular-nums">{signedPointsFormatter.format(factor.avgPoints)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </div>
          </details>
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
