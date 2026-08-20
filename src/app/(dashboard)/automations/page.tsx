import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Sparkles,
  Zap,
} from "lucide-react";

import { AutomationRunRecoveryPanel } from "@/components/automations/automation-run-recovery-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StateSurface } from "@/components/shared/state-surface";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  getSellerActionSpec,
  getSellerTriggerSpec,
  type SellerAutomationAction,
} from "@/lib/automations/catalog";
import {
  parseStoredAutomationDefinition,
  type CanonicalAutomationDefinition,
} from "@/lib/automations/contracts";
import { listAutomationRunHistory } from "@/lib/automations/recovery";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  getAutomationWorkspaceCopy,
  type AutomationWorkspaceCopyKey,
} from "@/lib/i18n/automation-workspace";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import { formatDate } from "@/lib/utils";
import { AutomationActions } from "./automation-actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.automations") };
}

export const dynamic = "force-dynamic";

const ATTENTION_STATES = new Set([
  "failed",
  "dead_letter",
  "ambiguous",
  "partially_completed",
]);

function readDefinition(
  automation: Parameters<typeof parseStoredAutomationDefinition>[0],
): CanonicalAutomationDefinition | null {
  try {
    return parseStoredAutomationDefinition(automation);
  } catch {
    return null;
  }
}

function conditionCount(definition: CanonicalAutomationDefinition | null): number {
  if (!definition?.conditions) return 0;
  return "all" in definition.conditions
    ? definition.conditions.all.length
    : definition.conditions.any.length;
}

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actorContext = await requireTrustedAction("automations.read");
  const { t, locale } = await getI18n();
  const c = (
    key: AutomationWorkspaceCopyKey,
    params?: Record<string, string | number>,
  ) => getAutomationWorkspaceCopy(locale, key, params);
  const canManage = trustedActionAllowed(
    actorContext,
    "automations.manage",
    { shopId: actorContext.shop.shopId },
  );
  const params = await searchParams;
  const activeTab = ["my", "templates", "activity"].includes(params.tab ?? "")
    ? params.tab!
    : "my";

  const [automations, recentRunStats, recentRuns, recentLogs] = await Promise.all([
    db.automation.findMany({
      where: { deletedAt: null },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    }),
    db.automationRun.findMany({
      take: 20,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { status: true },
    }),
    canManage
      ? listAutomationRunHistory({ prisma: db, shop: shopContext }, 20)
      : Promise.resolve([]),
    db.automationLog.findMany({
      take: 20,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { automation: { select: { name: true } } },
    }),
  ]);

  const activeCount = automations.filter((automation) => automation.isActive).length;
  const attentionCount = recentRunStats.filter((run) =>
    ATTENTION_STATES.has(run.status),
  ).length;
  const terminalRuns = recentRunStats.filter((run) =>
    [
      "succeeded",
      "failed",
      "dead_letter",
      "ambiguous",
      "partially_completed",
    ].includes(run.status),
  );
  const successCount = terminalRuns.filter((run) => run.status === "succeeded").length;
  const successRate = terminalRuns.length
    ? Math.round((successCount / terminalRuns.length) * 100)
    : 100;

  const templateMessage = (kind: "confirm" | "shipped" | "thanks") => {
    if (locale === "ar") {
      if (kind === "confirm") {
        return "مرحباً {{customerName}}، استلمنا طلبك {{orderNumber}} وسنتواصل معك لتأكيده.";
      }
      if (kind === "shipped") {
        return "مرحباً {{customerName}}، تم شحن طلبك {{orderNumber}} وهو في الطريق إليك.";
      }
      return "شكراً {{customerName}}! نتمنى أن تكون راضياً عن طلبك {{orderNumber}}.";
    }
    if (locale === "fr") {
      if (kind === "confirm") {
        return "Bonjour {{customerName}}, nous avons bien reçu votre commande {{orderNumber}} et nous allons la confirmer avec vous.";
      }
      if (kind === "shipped") {
        return "Bonjour {{customerName}}, votre commande {{orderNumber}} a été expédiée et est en route.";
      }
      return "Merci {{customerName}} ! Nous espérons que votre commande {{orderNumber}} vous satisfait.";
    }
    if (kind === "confirm") {
      return "Hi {{customerName}}, we received your order {{orderNumber}} and will confirm it with you shortly.";
    }
    if (kind === "shipped") {
      return "Hi {{customerName}}, your order {{orderNumber}} has shipped and is on its way.";
    }
    return "Thank you {{customerName}}! We hope you are happy with order {{orderNumber}}.";
  };

  const templates = [
    {
      key: "confirmation",
      name: c("template.confirmation.name"),
      description: c("template.confirmation.desc"),
      preset: {
        name: c("template.confirmation.name"),
        trigger: "order.created" as const,
        steps: [
          {
            action: "send_whatsapp" as const,
            onFailure: "stop" as const,
            config: { messageTemplate: templateMessage("confirm") },
          },
        ],
      },
    },
    {
      key: "delivery",
      name: c("template.delivery.name"),
      description: c("template.delivery.desc"),
      preset: {
        name: c("template.delivery.name"),
        trigger: "order.shipped" as const,
        steps: [
          {
            action: "send_whatsapp" as const,
            onFailure: "stop" as const,
            config: { messageTemplate: templateMessage("shipped") },
          },
        ],
      },
    },
    {
      key: "thanks",
      name: c("template.thanks.name"),
      description: c("template.thanks.desc"),
      preset: {
        name: c("template.thanks.name"),
        trigger: "order.delivered" as const,
        steps: [
          {
            action: "send_whatsapp" as const,
            onFailure: "stop" as const,
            config: { messageTemplate: templateMessage("thanks") },
          },
        ],
      },
    },
    {
      key: "high-value",
      name: c("template.highValue.name"),
      description: c("template.highValue.desc"),
      preset: {
        name: c("template.highValue.name"),
        trigger: "order.created" as const,
        conditions: {
          all: [
            {
              field: "totalPrice",
              operator: "greater_than" as const,
              value: "7000",
            },
          ],
        },
        steps: [
          {
            action: "tag_customer" as const,
            onFailure: "stop" as const,
            config: {
              noteText:
                locale === "ar"
                  ? "طلب مرتفع القيمة {{orderNumber}} — {{totalPrice}} دج"
                  : locale === "fr"
                    ? "Commande COD à forte valeur {{orderNumber}} — {{totalPrice}} DZD"
                    : "High-value COD order {{orderNumber}} — {{totalPrice}} DZD",
            },
          },
        ],
      },
    },
  ];

  return (
    <div
      className="app-content page-sections"
      data-automation-workspace="seller-v2"
      data-automation-builder="when-if-then"
    >
      <PageHeader
        title={c("workspace.title")}
        description={c("workspace.subtitle")}
        actions={canManage ? <AutomationActions variant="create" /> : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={c("workspace.active")} value={activeCount} icon={<Zap />} />
        <StatCard
          label={c("workspace.attention")}
          value={attentionCount}
          icon={<AlertTriangle />}
        />
        <StatCard
          label={c("workspace.recentRuns")}
          value={recentRunStats.length}
          icon={<Activity />}
        />
        <StatCard
          label={c("workspace.successRate")}
          value={`${successRate}%`}
          icon={<CheckCircle2 />}
        />
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/[0.04] p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
          <CheckCircle2 className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{c("workspace.healthy")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {c("workspace.healthyHint")}
          </p>
        </div>
      </div>

      <Tabs defaultValue={activeTab} className="w-full space-y-5">
        <div className="border-b border-border/70 pb-3">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto sm:w-auto">
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
        </div>

        <TabsContent value="my" className="space-y-4">
          {automations.length === 0 ? (
            <StateSurface
              icon={Bot}
              title={c("workspace.noAutomations")}
              description={c("workspace.noAutomationsHint")}
              actions={canManage ? <AutomationActions variant="create" /> : undefined}
              size="panel"
            />
          ) : (
            <div className="grid gap-3">
              {automations.map((automation) => {
                const definition = readDefinition(automation);
                const repairRequired = !definition;
                const trigger = definition?.trigger ?? automation.trigger;
                const triggerSpec = getSellerTriggerSpec(trigger);
                const triggerLabel = triggerSpec ? t(triggerSpec.labelKey) : trigger;
                const steps = definition?.steps ?? [];
                const visibleActions = steps.length
                  ? steps.map((step) => step.action)
                  : ([automation.action] as string[]);
                const actions = visibleActions.map((action) => {
                  const spec = getSellerActionSpec(action);
                  return spec
                    ? c(spec.copyKey as AutomationWorkspaceCopyKey)
                    : action;
                });
                const conditions = conditionCount(definition);
                const builderAutomation = {
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
                };

                return (
                  <Card
                    key={automation.id}
                    className="overflow-hidden border-border/70 transition-colors hover:border-border"
                  >
                    <CardContent className="p-0">
                      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/[0.06] text-primary">
                            <Zap className="size-5" />
                          </span>
                          <div className="min-w-0 space-y-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold leading-tight">
                                  {automation.name}
                                </h3>
                                {repairRequired ? (
                                  <Badge variant="destructive">
                                    {c("workspace.needsRepair")}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant={automation.isActive ? "default" : "outline"}
                                  >
                                    {automation.isActive
                                      ? c("workspace.active")
                                      : t("common.inactive")}
                                  </Badge>
                                )}
                                {automation.dryRun ? (
                                  <Badge variant="outline">{c("workspace.dryRun")}</Badge>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>{automation.runCount} {c("workspace.runs")}</span>
                                <span className="flex items-center gap-1.5">
                                  <Clock3 className="size-3" />
                                  {automation.lastRunAt
                                    ? `${c("workspace.lastRun")}: ${formatDate(
                                        automation.lastRunAt,
                                        locale,
                                      )}`
                                    : c("workspace.never")}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <Badge variant="secondary" className="gap-1.5">
                                <span className="text-muted-foreground">
                                  {c("workspace.when")}
                                </span>
                                <span>{triggerLabel}</span>
                              </Badge>
                              <span className="icon-rtl-flip text-muted-foreground">→</span>
                              <Badge variant="outline" className="gap-1.5">
                                <span className="text-muted-foreground">
                                  {c("workspace.onlyIf")}
                                </span>
                                <span>
                                  {conditions > 0
                                    ? c("builder.conditionCount", { count: conditions })
                                    : c("workspace.always")}
                                </span>
                              </Badge>
                              <span className="icon-rtl-flip text-muted-foreground">→</span>
                              <div className="flex flex-wrap gap-1.5">
                                {actions.slice(0, 2).map((label, index) => (
                                  <Badge key={`${label}-${index}`} variant="secondary">
                                    {label}
                                  </Badge>
                                ))}
                                {actions.length > 2 ? (
                                  <Badge variant="outline">
                                    {c("workspace.andMore", {
                                      count: actions.length - 2,
                                    })}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>

                        {canManage ? (
                          <div className="flex shrink-0 items-center gap-2 self-end lg:self-center">
                            {!repairRequired ? (
                              <AutomationActions
                                variant="edit"
                                automation={builderAutomation}
                              />
                            ) : null}
                            <AutomationActions
                              variant="menu"
                              automation={builderAutomation}
                              repairRequired={repairRequired}
                            />
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            {templates.map((template) => {
              const triggerSpec = getSellerTriggerSpec(template.preset.trigger);
              const action = template.preset.steps[0]?.action as
                | SellerAutomationAction
                | undefined;
              const actionSpec = action ? getSellerActionSpec(action) : undefined;
              return (
                <Card key={template.key} className="border-border/70">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Sparkles className="size-4" />
                      </span>
                      {canManage ? (
                        <AutomationActions variant="template" preset={template.preset} />
                      ) : null}
                    </div>
                    <div>
                      <h3 className="font-semibold">{template.name}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {template.description}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="outline">
                        {triggerSpec ? t(triggerSpec.labelKey) : template.preset.trigger}
                      </Badge>
                      <span className="icon-rtl-flip text-muted-foreground">→</span>
                      <Badge variant="secondary">
                        {actionSpec
                          ? c(actionSpec.copyKey as AutomationWorkspaceCopyKey)
                          : action}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
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
                      <p className="truncate text-sm font-medium">
                        {log.automation.name}
                      </p>
                      {log.message ? (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {log.message}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(log.createdAt, locale)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <StateSurface
              icon={Activity}
              title={c("workspace.latest")}
              description={c("workspace.noActivity")}
              size="panel"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
