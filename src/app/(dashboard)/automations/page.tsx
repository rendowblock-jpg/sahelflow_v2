import type { Metadata } from "next";
import { Bot, CheckCircle2, Clock, Zap } from "lucide-react";

import { AutomationRunRecoveryPanel } from "@/components/automations/automation-run-recovery-panel";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAutomationRunHistory } from "@/lib/automations/recovery";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { formatDate } from "@/lib/utils";
import { AutomationActions } from "./automation-actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.automations") };
}
export const dynamic = "force-dynamic";

const TRIGGER_I18N: Record<string, string> = {
  "order.created": "automations.triggers.orderCreated",
  "order.confirmed": "automations.triggers.orderConfirmed",
  "order.shipped": "automations.triggers.orderShipped",
  "order.delivered": "automations.triggers.orderDelivered",
  "order.returned": "automations.triggers.orderReturned",
  "order.refused": "automations.triggers.orderRefused",
  "order.cancelled": "automations.triggers.orderCancelled",
  "order.failed": "automations.triggers.orderFailed",
  "customer.blacklisted": "automations.triggers.customerBlacklisted",
  "message.received": "automations.triggers.messageReceived",
  "stock.low": "automations.triggers.stockLow",
};

const ACTION_I18N: Record<string, string> = {
  send_whatsapp: "automations.actions.sendWhatsapp",
  update_status: "automations.actions.updateStatus",
  send_notification: "automations.actions.sendNotification",
  tag_customer: "automations.actions.tagCustomer",
};

export default async function AutomationsPage() {
  await requireTrustedAction("automations.read");
  const { t, locale } = await getI18n();

  const [automations, recentRuns, recentLogs] = await Promise.all([
    db.automation.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    listAutomationRunHistory({ prisma: db, shop: shopContext }, 20),
    db.automationLog.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { automation: { select: { name: true } } },
    }),
  ]);

  const activeCount = automations.filter((automation) => automation.isActive).length;
  const totalRuns = automations.reduce(
    (sum, automation) => sum + automation.runCount,
    0,
  );

  const stats = [
    {
      label: t("automations.total"),
      value: String(automations.length),
      icon: Bot,
    },
    {
      label: t("common.active"),
      value: String(activeCount),
      icon: Zap,
    },
    {
      label: t("automations.totalRuns"),
      value: String(totalRuns),
      icon: CheckCircle2,
    },
  ];

  const recipes = [
    {
      nameKey: "automations.recipes.autoConfirm",
      trigger: "order.created",
      action: "send_whatsapp",
      descKey: "automations.recipes.autoConfirmDesc",
    },
    {
      nameKey: "automations.recipes.deliveryTracking",
      trigger: "order.shipped",
      action: "send_whatsapp",
      descKey: "automations.recipes.deliveryTrackingDesc",
    },
    {
      nameKey: "automations.recipes.lowStockAlert",
      trigger: "stock.low",
      action: "send_notification",
      descKey: "automations.recipes.lowStockAlertDesc",
    },
    {
      nameKey: "automations.recipes.postDeliveryThanks",
      trigger: "order.delivered",
      action: "send_whatsapp",
      descKey: "automations.recipes.postDeliveryThanksDesc",
    },
  ];

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.automations")}
        description={t("automations.subtitle")}
        actions={<AutomationActions variant="create" />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {automations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("automations.yourAutomations")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {automations.map((automation) => (
                <div
                  key={automation.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{automation.name}</span>
                      <Badge
                        variant={automation.isActive ? "default" : "outline"}
                      >
                        {automation.isActive
                          ? t("common.active")
                          : t("common.inactive")}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {t("automations.triggerLabel")}: {t(
                          TRIGGER_I18N[automation.trigger] ?? automation.trigger,
                        )}
                      </span>
                      <span>·</span>
                      <span>
                        {t("automations.runsLabel")}: {automation.runCount}
                      </span>
                      {automation.lastRunAt && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {formatDate(automation.lastRunAt, locale)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <AutomationActions
                      variant="edit"
                      automation={{
                        id: automation.id,
                        name: automation.name,
                        trigger: automation.trigger,
                        action: automation.action,
                        isActive: automation.isActive,
                        conditions: automation.conditions,
                      }}
                    />
                    <AutomationActions
                      variant="toggle"
                      automationId={automation.id}
                      isActive={automation.isActive}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon={Bot}
              title={t("automations.empty.title")}
              description={t("automations.empty.description")}
              actionLabel={t("automations.empty.action")}
              actionHref="/automations"
            />
          </CardContent>
        </Card>
      )}

      <AutomationRunRecoveryPanel initialRuns={recentRuns} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("automations.templates")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {recipes.map((recipe) => (
              <div key={recipe.nameKey} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <span className="font-medium">{t(recipe.nameKey)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t(recipe.descKey)}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="outline">
                        {t(TRIGGER_I18N[recipe.trigger] ?? recipe.trigger)}
                      </Badge>
                      <span className="icon-rtl-flip text-muted-foreground">
                        →
                      </span>
                      <Badge variant="outline">
                        {t(ACTION_I18N[recipe.action] ?? recipe.action)}
                      </Badge>
                    </div>
                  </div>
                  <AutomationActions
                    variant="activate"
                    recipeName={t(recipe.nameKey)}
                    trigger={recipe.trigger}
                    action={recipe.action}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {recentLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("automations.recentActivity")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 divide-y overflow-y-auto">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 p-3 text-sm"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          log.status === "success"
                            ? "bg-success"
                            : log.status === "failed"
                              ? "bg-destructive"
                              : "bg-warning"
                        }`}
                      />
                      <span className="truncate font-medium">
                        {log.automation.name}
                      </span>
                    </div>
                    {log.message && (
                      <p className="truncate ps-3.5 text-xs text-muted-foreground">
                        {log.message}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(log.createdAt, locale)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
