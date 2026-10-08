import type { Metadata } from "next";
import Link from "next/link";
import { Activity, AlertTriangle, Bot, CheckCircle2, Sparkles, Zap } from "lucide-react";

import { AutomationActions } from "@/components/automations/automation-actions";
import type { AutomationCardData } from "@/components/automations/automation-card";
import { AutomationRunRecoveryPanel } from "@/components/automations/automation-run-recovery-panel";
import { AutomationTemplatesGallery } from "@/components/automations/automation-templates-gallery";
import { AutomationsListClient } from "@/components/automations/automations-list-client";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StateSurface } from "@/components/shared/state-surface";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AUTOMATION_PERFORMANCE_DAYS,
  emptyAutomationPerformance,
  successRate,
  summarizeAutomationRuns,
} from "@/lib/automations/automation-performance";
import { whatsappConnected } from "@/lib/automations/automation-readiness";
import { getSellerActionSpec, getSellerTriggerSpec } from "@/lib/automations/catalog";
import {
  parseStoredAutomationDefinition,
  type CanonicalAutomationDefinition,
} from "@/lib/automations/contracts";
import { normalizeLegacyDemoAutomations } from "@/lib/automations/demo-normalization";
import { listAutomationRunHistory } from "@/lib/automations/recovery";
import { assertSellerAutomationWritePolicy } from "@/lib/automations/seller-policy";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  getAutomationWorkspaceCopy,
  type AutomationWorkspaceCopyKey,
} from "@/lib/i18n/automation-workspace";
import { requireTrustedAction, trustedActionAllowed } from "@/lib/identity/authorization";
import { formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.automations") };
}

export const dynamic = "force-dynamic";

function readStructuralDefinition(
  automation: Parameters<typeof parseStoredAutomationDefinition>[0],
): CanonicalAutomationDefinition | null {
  try {
    return parseStoredAutomationDefinition(automation);
  } catch {
    return null;
  }
}

/** A definition the seller policy accepts; anything else needs repair. */
function readDefinition(
  automation: Parameters<typeof parseStoredAutomationDefinition>[0],
): CanonicalAutomationDefinition | null {
  try {
    const definition = parseStoredAutomationDefinition(automation);
    const firstStep = definition.steps[0];
    if (!firstStep) return null;
    assertSellerAutomationWritePolicy({
      name: definition.name,
      trigger: definition.trigger,
      action: firstStep.action,
      config: firstStep.config,
      isActive: definition.isActive,
      dryRun: definition.dryRun,
      conditions: definition.conditions,
      steps: definition.steps,
      maxRetries: definition.maxRetries,
      retryDelayMs: definition.retryDelayMs,
    });
    return definition;
  } catch {
    return null;
  }
}

function conditionCount(definition: CanonicalAutomationDefinition | null): number {
  if (!definition?.conditions) return 0;
  return "all" in definition.conditions ? definition.conditions.all.length : definition.conditions.any.length;
}

/**
 * The retired engine wrote identifiers such as "order_created" or
 * "low_stock". Where one means exactly what a current catalog entry means,
 * the card borrows that entry's localized label; anything else reads as a
 * localized "retired" chip, never as a raw English key.
 */
const RETIRED_TRIGGER_EQUIVALENTS: Readonly<Record<string, string>> = {
  low_stock: "stock.low",
};
const RETIRED_ACTION_EQUIVALENTS: Readonly<Record<string, string>> = {
  notify_seller: "send_notification",
};

function triggerSpecFor(trigger: string) {
  return (
    getSellerTriggerSpec(trigger) ??
    getSellerTriggerSpec(RETIRED_TRIGGER_EQUIVALENTS[trigger] ?? trigger.replace(/_/g, "."))
  );
}

function actionSpecFor(action: string) {
  return getSellerActionSpec(action) ?? getSellerActionSpec(RETIRED_ACTION_EQUIVALENTS[action] ?? action);
}

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actorContext = await requireTrustedAction("automations.read");
  const { t, locale } = await getI18n();
  const c = (key: AutomationWorkspaceCopyKey, params?: Record<string, string | number>) =>
    getAutomationWorkspaceCopy(locale, key, params);
  const canManage = trustedActionAllowed(actorContext, "automations.manage", {
    shopId: actorContext.shop.shopId,
  });
  const params = await searchParams;
  const activeTab = params.tab && ["my", "templates", "activity"].includes(params.tab) ? params.tab : "my";

  // The deterministic Founder demo predates the durable automation contract.
  // Repair only its three exact known legacy IDs, and only for an actor who may
  // manage automations. Seller-created rows are never rewritten here.
  if (canManage) {
    await normalizeLegacyDemoAutomations(db);
  }

  const now = new Date();
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - AUTOMATION_PERFORMANCE_DAYS);

  const [automations, runs, recentRuns, recentLogs, waConnected] = await Promise.all([
    db.automation.findMany({
      where: { deletedAt: null },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    }),
    db.automationRun.findMany({
      where: { createdAt: { gte: since } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5000,
      select: { automationId: true, status: true, createdAt: true },
    }),
    canManage ? listAutomationRunHistory({ prisma: db, shop: shopContext }, 20) : Promise.resolve([]),
    db.automationLog.findMany({
      take: 20,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { automation: { select: { name: true } } },
    }),
    whatsappConnected(),
  ]);

  const { total, byAutomation } = summarizeAutomationRuns(runs, now);
  const totalSuccess = successRate(total);

  const cards: AutomationCardData[] = automations.map((automation) => {
    const structural = readStructuralDefinition(automation);
    const definition = readDefinition(automation);
    const trigger = definition?.trigger ?? automation.trigger;
    const triggerSpec = triggerSpecFor(trigger);
    const steps = definition?.steps ?? structural?.steps ?? [];
    const actionKeys = steps.length ? steps.map((step) => step.action as string) : [automation.action];
    const performance = byAutomation.get(automation.id) ?? emptyAutomationPerformance(now);
    return {
      id: automation.id,
      name: automation.name,
      isActive: automation.isActive,
      dryRun: automation.dryRun,
      repairRequired: !definition,
      trigger,
      triggerLabel: triggerSpec ? t(triggerSpec.labelKey) : c("workspace.retiredTrigger"),
      conditionCount: conditionCount(definition ?? structural),
      actions: actionKeys.map((action) => {
        const spec = actionSpecFor(action);
        return { action, label: spec ? c(spec.copyKey as AutomationWorkspaceCopyKey) : c("workspace.retiredStep") };
      }),
      lastRunAt: automation.lastRunAt ? automation.lastRunAt.toISOString() : null,
      whatsappBlocked: !waConnected && actionKeys.includes("send_whatsapp"),
      statusStepGoverned: actionKeys.includes("update_status"),
      stats: {
        runs: performance.runs,
        successRate: successRate(performance),
        attention: performance.attention,
        trend: performance.trend,
      },
      raw: {
        id: automation.id,
        name: automation.name,
        trigger: automation.trigger,
        action: automation.action,
        isActive: automation.isActive,
        conditions: automation.conditions,
        config: automation.config,
        steps: automation.steps,
        dryRun: automation.dryRun,
        maxRetries: automation.maxRetries,
        retryDelayMs: automation.retryDelayMs,
      },
    };
  });

  // An automation that needs repair cannot run, so it never counts as active.
  const activeCount = cards.filter((card) => card.isActive && !card.repairRequired).length;

  return (
    <div className="app-content page-sections" data-automation-workspace="seller-v2" data-automation-builder="when-if-then">
      <PageHeader
        title={c("workspace.title")}
        description={c("workspace.subtitle")}
        actions={canManage ? <AutomationActions variant="create" /> : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={c("workspace.kpiActive")}
          value={String(activeCount)}
          icon={<Zap />}
          subtitle={c("workspace.activeOf", { active: activeCount, total: automations.length })}
        />
        <StatCard
          label={c("workspace.kpiRuns")}
          value={String(total.runs)}
          icon={<Activity />}
          spark={total.trend.some((point) => point.value > 0) ? total.trend : undefined}
          sparkZeroBaseline
        />
        <StatCard
          label={c("workspace.kpiSuccess")}
          value={totalSuccess === null ? "—" : `${totalSuccess}%`}
          icon={<CheckCircle2 />}
          tone={totalSuccess !== null && totalSuccess < 90 ? "warning" : "neutral"}
        />
        <StatCard
          label={c("workspace.kpiAttention")}
          value={String(total.attention)}
          icon={<AlertTriangle />}
          tone={total.attention > 0 ? "danger" : "neutral"}
          href={total.attention > 0 ? "/automations?tab=activity" : undefined}
          hrefLabel={c("workspace.activity")}
        />
      </div>

      <Tabs value={activeTab} className="w-full space-y-5">
        <TabsList variant="line" className="w-full justify-start border-b [&>[data-slot=tabs-trigger]]:flex-none">
          <TabsTrigger value="my" asChild>
            <Link href="/automations?tab=my">
              <Bot className="me-1.5 size-4" />
              {c("workspace.my")}
            </Link>
          </TabsTrigger>
          <TabsTrigger value="templates" asChild>
            <Link href="/automations?tab=templates">
              <Sparkles className="me-1.5 size-4" />
              {c("workspace.templates")}
            </Link>
          </TabsTrigger>
          <TabsTrigger value="activity" asChild>
            <Link href="/automations?tab=activity">
              <Activity className="me-1.5 size-4" />
              {c("workspace.activity")}
            </Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my">
          <AutomationsListClient automations={cards} canManage={canManage} />
        </TabsContent>

        <TabsContent value="templates">
          <AutomationTemplatesGallery canManage={canManage} />
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          {canManage ? (
            <AutomationRunRecoveryPanel initialRuns={recentRuns} />
          ) : recentLogs.length > 0 ? (
            <Card>
              <CardContent className="divide-y p-0">
                {recentLogs.map((log) => (
                  <div key={log.id} className="flex items-start justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{log.automation.name}</p>
                      {log.message ? <p className="mt-1 truncate text-xs text-muted-foreground">{log.message}</p> : null}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(log.createdAt, locale)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <StateSurface icon={Activity} title={c("workspace.latest")} description={c("workspace.noActivity")} size="panel" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
