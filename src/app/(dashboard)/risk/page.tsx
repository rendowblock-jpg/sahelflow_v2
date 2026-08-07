import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Ban, MapPin, PiggyBank, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";

import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import { ChartCard, ChartEmpty } from "@/components/charts/chart-primitives";
import { DonutChart, type DonutDatum } from "@/components/charts/donut-chart";
import { HorizontalBarChart, type HBarDatum } from "@/components/charts/horizontal-bar-chart";
import { RiskBlacklistPanel } from "@/components/risk/risk-blacklist-panel";
import { RiskControlPanel } from "@/components/risk/risk-control-panel";
import { RiskLevelBadgeServer } from "@/components/risk/risk-badges";
import { RiskRulesPanel } from "@/components/risk/risk-rules-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { assertTrustedAction, requireTrustedAction, trustedActionAllowed } from "@/lib/identity/authorization";
import { getRiskAnalyticsReport, getRiskConfig, getRiskRules, listBlacklistedCustomers, type RiskLevel } from "@/lib/risk-engine";
import { formatDZD } from "@/lib/utils";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { const { t } = await getI18n(); return { title: t("metadata.title.risk") }; }
const RANGES = [7, 14, 30, 90] as const;
const LEVEL_COLORS: Record<RiskLevel, string> = { low: "var(--color-chart-2)", medium: "var(--color-chart-3)", high: "var(--status-returned)", critical: "var(--color-destructive)" };

export default async function RiskPage({ searchParams }: { searchParams: Promise<{ days?: string; tab?: string }> }) {
  const actorContext = await requireTrustedAction("risk.read");
  const resource = { shopId: actorContext.shop.shopId };
  assertTrustedAction(actorContext, "customers.read", resource);
  assertTrustedAction(actorContext, "customers.contact.read", resource);
  assertTrustedAction(actorContext, "orders.financials.read", resource);
  const canManage = trustedActionAllowed(actorContext, "risk.manage", resource);
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const requestedDays = Number(params.days);
  const days = RANGES.includes(requestedDays as (typeof RANGES)[number]) ? requestedDays : 30;
  const requestedTab = params.tab ?? "overview";
  const activeTab = !canManage && ["control", "rules"].includes(requestedTab) ? "overview" : requestedTab;
  const context = { prisma: db, shop: shopContext };
  const [report, config, rules, blacklisted] = await Promise.all([getRiskAnalyticsReport(context, days), getRiskConfig(context), getRiskRules(context), listBlacklistedCustomers(context)]);
  const k = report.kpis;
  const fmtPct = (value: number) => `${(value * 100).toFixed(1)}%`;
  const dateLocale = locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-FR";
  const distribution: DonutDatum[] = report.distribution.map((row) => ({ key: row.level, label: t(`risk.level.${row.level}`), value: row.count, color: LEVEL_COLORS[row.level] }));
  const distributionConfig: ChartConfig = Object.fromEntries(distribution.map((row) => [row.key, { label: row.label, color: row.color }]));
  const trend = report.trend.map((row) => ({ date: new Date(row.date).toLocaleDateString(dateLocale, { month: "short", day: "numeric" }), score: row.avgScore }));
  const trendConfig: ChartConfig = { score: { label: t("risk.kpi.avgScore"), color: "var(--color-chart-1)" } };
  const wilaya: HBarDatum[] = report.riskByWilaya.map((row) => ({ key: row.wilaya, label: row.wilaya, value: row.avgScore }));
  const wilayaConfig: ChartConfig = { value: { label: t("risk.kpi.avgScore"), color: "var(--color-chart-3)" } };

  return (
    <div className="app-content page-sections">
      <PageHeader title={t("risk.title")} description={t("risk.subtitle")} actions={<Link href="/orders?risk=high" className="inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><ShieldAlert className="size-4" />{t("risk.kpi.highRiskOrders")}<Badge variant={k.highRiskOrderCount > 0 ? "destructive" : "secondary"}>{k.highRiskOrderCount}</Badge></Link>} />
      <div className="flex flex-wrap gap-1 rounded-md border p-1">{RANGES.map((range) => <Link key={range} href={`/risk?days=${range}&tab=${activeTab}`} className={`rounded px-3 py-1.5 text-xs font-medium ${days === range ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t(`risk.ranges.last${range}`)}</Link>)}</div>
      <div className="card-grid-3">
        <StatCard label={t("risk.kpi.avgScore")} value={k.avgRiskScore} icon={<ShieldAlert />} subtitle="/ 100" />
        <StatCard label={t("risk.kpi.confirmationRate")} value={fmtPct(k.confirmationRate)} icon={<TrendingUp />} trend={k.confirmationRate >= 0.7 ? 1 : -1} />
        <StatCard label={t("risk.kpi.returnRate")} value={fmtPct(k.returnRate)} icon={<TrendingDown />} trend={k.returnRate <= 0.2 ? 1 : -1} />
        <StatCard label={t("risk.kpi.highRiskOrders")} value={k.highRiskOrderCount} icon={<AlertTriangle />} />
        <StatCard label={t("risk.kpi.blacklistedCustomers")} value={k.blacklistedCustomerCount} icon={<Ban />} />
        <StatCard label={t("risk.kpi.potentialSavings")} value={formatDZD(k.potentialSavingsDzd, locale)} icon={<PiggyBank />} />
      </div>

      <Tabs defaultValue={activeTab}>
        <TabsList className="h-auto flex-wrap"><TabsTrigger value="overview" asChild><Link href={`/risk?days=${days}&tab=overview`}>{t("risk.overview")}</Link></TabsTrigger><TabsTrigger value="analysis" asChild><Link href={`/risk?days=${days}&tab=analysis`}>{t("risk.analysis")}</Link></TabsTrigger>{canManage ? <TabsTrigger value="control" asChild><Link href={`/risk?days=${days}&tab=control`}>{t("risk.control")}</Link></TabsTrigger> : null}<TabsTrigger value="blacklist" asChild><Link href={`/risk?days=${days}&tab=blacklist`}>{t("risk.blacklist")}</Link></TabsTrigger>{canManage ? <TabsTrigger value="rules" asChild><Link href={`/risk?days=${days}&tab=rules`}>{t("risk.rules")}</Link></TabsTrigger> : null}</TabsList>
        <TabsContent value="overview" className="space-y-4">
          <div className="card-grid-2"><ChartCard title={t("risk.distribution.title")} description={t("risk.distribution.subtitle")} summary={`${report.totalOrders} ${t("risk.confirmationByLevel.total")}`} config={distributionConfig}>{distribution.some((row) => row.value > 0) ? <DonutChart data={distribution} config={distributionConfig} /> : <ChartEmpty message={`${t("risk.confirmationByLevel.total")}: 0`} />}</ChartCard><ChartCard title={t("risk.trend.title")} description={t("risk.trend.subtitle")} summary={trend.length ? `${trend.length} ${t("common.days")}` : undefined} config={trendConfig}>{trend.length ? <AreaTrendChart data={trend} xKey="date" series={[{ key: "score", label: t("risk.kpi.avgScore") }]} config={trendConfig} /> : <ChartEmpty message="—" />}</ChartCard></div>
          <Card><CardHeader><CardTitle className="text-base">{t("risk.confirmationByLevel.title")}</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t("risk.confirmationByLevel.level")}</TableHead><TableHead className="text-end">{t("risk.confirmationByLevel.total")}</TableHead><TableHead className="text-end">{t("risk.confirmationByLevel.delivered")}</TableHead><TableHead className="text-end">{t("risk.confirmationByLevel.confirmationRate")}</TableHead><TableHead className="text-end">{t("risk.confirmationByLevel.returnRate")}</TableHead></TableRow></TableHeader><TableBody>{report.confirmationByLevel.map((row) => <TableRow key={row.level}><TableCell><RiskLevelBadgeServer level={row.level} label={t(`risk.level.${row.level}`)} /></TableCell><TableCell className="text-end tabular-nums">{row.total}</TableCell><TableCell className="text-end tabular-nums">{row.delivered}</TableCell><TableCell className="text-end tabular-nums">{fmtPct(row.confirmationRate)}</TableCell><TableCell className="text-end tabular-nums">{fmtPct(row.returnRate)}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
        </TabsContent>
        <TabsContent value="analysis" className="space-y-4"><ChartCard title={t("risk.byWilaya.title")} description={t("risk.byWilaya.subtitle")} icon={<MapPin className="size-4" />} config={wilayaConfig}>{wilaya.length ? <HorizontalBarChart data={wilaya} config={wilayaConfig} /> : <ChartEmpty message="—" />}</ChartCard><Card><CardHeader><CardTitle className="text-base">{t("risk.topFactors.title")}</CardTitle></CardHeader><CardContent><div className="space-y-2">{report.topFactors.map((factor) => <div key={factor.factorId} className="flex items-center justify-between border-b py-2 text-sm last:border-0"><span>{t(factor.labelKey)}</span><span className="tabular-nums text-muted-foreground">{factor.occurrenceCount} · {factor.avgPoints >= 0 ? "+" : ""}{factor.avgPoints}</span></div>)}</div></CardContent></Card></TabsContent>
        {canManage ? <TabsContent value="control"><RiskControlPanel config={config} /></TabsContent> : null}
        <TabsContent value="blacklist">{canManage ? <RiskBlacklistPanel customers={blacklisted} /> : <Card><CardHeader><CardTitle className="text-base">{t("risk.blacklist.title")}</CardTitle></CardHeader><CardContent><div className="space-y-2">{blacklisted.length === 0 ? <p className="text-sm text-muted-foreground">{t("risk.blacklist.empty")}</p> : blacklisted.map((customer) => <div key={customer.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0"><Link href={`/customers/${customer.id}`} className="font-medium hover:underline">{customer.name}</Link><span className="font-mono text-muted-foreground">{customer.phone}</span></div>)}</div></CardContent></Card>}</TabsContent>
        {canManage ? <TabsContent value="rules"><RiskRulesPanel rules={rules} /></TabsContent> : null}
      </Tabs>
    </div>
  );
}
