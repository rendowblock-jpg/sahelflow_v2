import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bot, Zap, Clock, CheckCircle2 } from "lucide-react";
import { AutomationActions } from "./automation-actions";
import { EmptyState } from "@/components/shared/empty-state";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.automations") };
}
export const dynamic = "force-dynamic";

/** i18n keys for trigger events */
const TRIGGER_I18N: Record<string, string> = {
  "order.created": "automations.triggers.orderCreated",
  "order.confirmed": "automations.triggers.orderConfirmed",
  "order.shipped": "automations.triggers.orderShipped",
  "order.delivered": "automations.triggers.orderDelivered",
  "order.returned": "automations.triggers.orderReturned",
  "customer.created": "automations.triggers.customerCreated",
  "message.received": "automations.triggers.messageReceived",
  "stock.low": "automations.triggers.stockLow",
};

/** i18n keys for actions */
const ACTION_I18N: Record<string, string> = {
  "send_whatsapp": "automations.actions.sendWhatsapp",
  "create_order": "automations.actions.createOrder",
  "update_status": "automations.actions.updateStatus",
  "send_notification": "automations.actions.sendNotification",
  "tag_customer": "automations.actions.tagCustomer",
};

export default async function AutomationsPage() {
  const { t, locale } = await getI18n();

  const automations = await db.automation.findMany({
    orderBy: { createdAt: "desc" },
  });

  const activeCount = automations.filter((a) => a.isActive).length;
  const totalRuns = automations.reduce((sum, a) => sum + a.runCount, 0);

  const stats = [
    { label: t("automations.total"), value: String(automations.length), icon: Bot },
    { label: t("common.active"), value: String(activeCount), icon: Zap },
    { label: t("automations.totalRuns"), value: String(totalRuns), icon: CheckCircle2 },
  ];

  // Pre-built recipe templates
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav.automations")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("automations.subtitle")}
          </p>
        </div>
        <AutomationActions variant="create" />
      </div>

      {/* Stats */}
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

      {/* Active automations */}
      {automations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("automations.yourAutomations")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {automations.map((auto) => (
                <div key={auto.id} className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{auto.name}</span>
                      <Badge variant={auto.isActive ? "default" : "outline"}>
                        {auto.isActive ? t("common.active") : t("common.inactive")}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{t("automations.triggerLabel")}: {t(TRIGGER_I18N[auto.trigger] ?? auto.trigger)}</span>
                      <span>·</span>
                      <span>{t("automations.runsLabel")}: {auto.runCount}</span>
                      {auto.lastRunAt && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {formatDate(auto.lastRunAt, locale)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <AutomationActions variant="toggle" automationId={auto.id} isActive={auto.isActive} />
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

      {/* Recipe templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("automations.templates")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {recipes.map((recipe) => (
              <div key={recipe.nameKey} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <span className="font-medium">{t(recipe.nameKey)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{t(recipe.descKey)}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline">
                        {t(TRIGGER_I18N[recipe.trigger] ?? recipe.trigger)}
                      </Badge>
                      <span className="text-muted-foreground">→</span>
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

      <Separator />

      <div className="rounded-lg border border-dashed p-6 text-center">
        <Bot className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          {t("automations.engineNotice")}
        </p>
      </div>
    </div>
  );
}
