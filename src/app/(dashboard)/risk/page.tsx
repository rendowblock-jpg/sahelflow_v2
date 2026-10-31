import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StateSurface } from "@/components/shared/state-surface";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction, trustedActionAllowed } from "@/lib/identity/authorization";
import { getRiskAnalyticsReport, getRiskConfig, getRiskRules, listBlacklistedCustomers } from "@/lib/risk-engine";
import { RiskView } from "@/components/risk/risk-view";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.risk") };
}

export const dynamic = "force-dynamic";


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

  return (
    <RiskView
      t={t}
      locale={locale}
      report={report}
      config={config}
      blacklisted={blacklisted}
      rules={rules}
      canManage={canManage}
      days={days}
      activeTab={activeTab}
    />
  );
}
