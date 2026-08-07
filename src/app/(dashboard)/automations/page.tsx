import type { Metadata } from "next";
import { Bot, CheckCircle2, Zap } from "lucide-react";

import { AutomationRunRecoveryPanel } from "@/components/automations/automation-run-recovery-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StateSurface } from "@/components/shared/state-surface";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAutomationRunHistory } from "@/lib/automations/recovery";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction, trustedActionAllowed } from "@/lib/identity/authorization";
import { AutomationActions } from "./automation-actions";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { const { t } = await getI18n(); return { title: t("metadata.title.automations") }; }

export default async function AutomationsPage() {
  const actorContext = await requireTrustedAction("automations.read");
  const canManage = trustedActionAllowed(actorContext, "automations.manage", { shopId: actorContext.shop.shopId });
  const { t } = await getI18n();
  const [automations, recentRuns] = await Promise.all([
    db.automation.findMany({ where: { deletedAt: null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    listAutomationRunHistory({ prisma: db, shop: shopContext }, 20),
  ]);
  const activeCount = automations.filter((automation) => automation.isActive).length;
  const totalRuns = automations.reduce((sum, automation) => sum + automation.runCount, 0);
  return (
    <div className="app-content page-sections">
      <PageHeader title={t("nav.automations")} description={t("automations.subtitle")} actions={canManage ? <AutomationActions variant="create" /> : undefined} />
      <div className="card-grid-3"><StatCard label={t("automations.total")} value={automations.length} icon={<Bot />} /><StatCard label={t("common.active")} value={activeCount} icon={<Zap />} /><StatCard label={t("automations.totalRuns")} value={totalRuns} icon={<CheckCircle2 />} /></div>
      {automations.length === 0 ? <StateSurface icon={Bot} title={t("automations.empty.title")} description={t("automations.empty.description")} /> : <Card><CardHeader><CardTitle className="text-base">{t("automations.yourAutomations")}</CardTitle></CardHeader><CardContent className="p-0"><div className="divide-y">{automations.map((automation) => <div key={automation.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{automation.name}</span><Badge variant={automation.isActive ? "secondary" : "outline"}>{automation.isActive ? t("common.active") : t("common.inactive")}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{automation.trigger} · {t("automations.runsLabel")}: {automation.runCount}</p></div>{canManage ? <div className="flex items-center gap-1"><AutomationActions variant="edit" automation={{ id: automation.id, name: automation.name, trigger: automation.trigger, action: automation.action, isActive: automation.isActive, conditions: automation.conditions }} /><AutomationActions variant="toggle" automationId={automation.id} isActive={automation.isActive} /></div> : null}</div>)}</div></CardContent></Card>}
      <AutomationRunRecoveryPanel initialRuns={recentRuns} canRecover={canManage} />
    </div>
  );
}
