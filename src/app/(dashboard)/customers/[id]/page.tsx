import { notFound } from "next/navigation";
import { Ban, ShoppingBag, TrendingUp, Truck } from "lucide-react";
import { askAiHref } from "@/lib/ai/ask-ai-link";

import { CustomerDetailHeader } from "@/components/customers/customer-detail-header";
import { RecordsOfflineBanner } from "@/components/customers/records-status-banner";
import { CustomerOrderHistory } from "@/components/customers/customer-order-history";
import { CustomerRiskCard } from "@/components/customers/customer-risk-card";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { RecentRecordTracker } from "@/components/shared/recent-record-tracker";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCustomerDetailWorkbench } from "@/lib/customers/customer-detail-workbench";
import { riskActionCopyKey } from "@/lib/orders/order-risk-presentation";
import {
  CUSTOMER_SIGNALS_SCALE,
  getCustomerSignalsLevel,
  type CustomerSignalsLevel,
} from "@/lib/customers/customer-risk-scale";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import {
  assessOrderRisk,
  getRiskConfig,
  type RiskAction,
  type RiskLevel,
} from "@/lib/risk-engine";
import { formatDZD, formatDate } from "@/lib/utils";
import { displayWilaya } from "@/lib/wilaya-display";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: PageProps) {
  const { t, locale } = await getI18n();
  const actorContext = await requireTrustedAction("customers.read");
  const { id } = await params;
  const workbench = await getCustomerDetailWorkbench(actorContext, id);
  if (!workbench) notFound();

  const { customer, stats, orders, canReadOrderFinancials } = workbench;
  const resource = { shopId: actorContext.shop.shopId };
  const canManageRisk =
    customer.fieldAccess.risk &&
    trustedActionAllowed(actorContext, "risk.manage", resource);
  // R3-c: the order risk engine (0-100, seller-configurable thresholds) is
  // surfaced read-only on the customer profile — its verdict on the
  // customer's LATEST order, next to the separate ~0-10 customer signals
  // score. Two scales, explicit labels, no invented equivalence.
  const canReadRisk = trustedActionAllowed(actorContext, "risk.read", resource);
  const latestOrderRow = workbench.canReadOrders ? orders[0] : undefined;
  const latestOrder = latestOrderRow
    ? { id: latestOrderRow.id, orderNumber: latestOrderRow.orderNumber }
    : null;
  const [riskEngineConfig, latestOrderAssessment] = await Promise.all([
    canReadRisk
      ? getRiskConfig({ prisma: db, shop: shopContext })
      : Promise.resolve(null),
    canReadRisk && latestOrder
      ? assessOrderRisk(
          { prisma: db, shop: shopContext },
          latestOrder.id,
        ).catch(() => null)
      : Promise.resolve(null),
  ]);
  const riskScore = customer.riskScore;
  const riskLevel = riskScore === null ? null : getCustomerSignalsLevel(riskScore);
  const riskBadge = riskLevel
    ? {
        low: { variant: "secondary" as const, label: t("risk.lowRisk") },
        medium: { variant: "outline" as const, label: t("risk.mediumRisk") },
        high: { variant: "destructive" as const, label: t("risk.highRisk") },
      }[riskLevel]
    : null;
  const spendingSeries = canReadOrderFinancials
    ? orders
        .slice(0, 20)
        .reverse()
        .map((order) => ({ value: order.totalPrice ?? 0 }))
    : [];
  const customerLabel = customer.name ?? t("inbox.restrictedContact");
  // R4-e: contextual "Ask AI" entry — customer NAME only in the URL (no
  // phone/address); the assistant resolves the record via its own tools.
  const canAskAi = trustedActionAllowed(actorContext, "ai.use");

  return (
    <div className="app-content page-sections">
      {/* R4-f: journal this visit for the command palette's Recent section. */}
      <RecentRecordTracker
        kind="customer"
        id={customer.id}
        label={customerLabel}
        href={`/customers/${customer.id}`}
      />
      <Breadcrumbs
        items={[
          { label: t("customers.title"), href: "/customers" },
          { label: customerLabel },
        ]}
      />

      <RecordsOfflineBanner kind="customer" />

      <CustomerDetailHeader
        label={customerLabel}
        name={customer.name}
        phone={customer.phone}
        phone2={customer.phone2}
        placeLabel={
          customer.wilaya
            ? `${displayWilaya(customer.wilaya, locale)}${customer.commune ? ` · ${customer.commune}` : ""}`
            : null
        }
        sinceLabel={`${t("customers.customerSince")} ${formatDate(customer.createdAt, locale)}`}
        askAi={
          canAskAi && customer.name
            ? { href: askAiHref(t("ai.ask.customerPrompt", { name: customer.name })), label: t("ai.ask.button") }
            : null
        }
        risk={riskBadge && riskScore !== null ? { ...riskBadge, score: riskScore } : null}
        blacklist={
          canManageRisk
            ? { customerId: customer.id, isBlacklisted: customer.isBlacklisted === true }
            : null
        }
      />

      {customer.fieldAccess.risk && customer.isBlacklisted === true ? (
        <div className="flex items-start gap-3 rounded-surface border border-destructive/25 bg-destructive-subtle p-4">
          <Ban className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">
              {t("customers.blacklisted")}
            </p>
            {customer.blacklistReason ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("risk.blacklist.reason")}: {customer.blacklistReason}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {customer.fieldAccess.risk || canReadRisk ? (
        <CustomerRiskCard
          labels={{
            title: t("customers.risk"),
            engineLabel: t("customerRisk.engine.label"),
            engineScaleHint: t("customerRisk.engine.scaleHint", {
              low: riskEngineConfig?.thresholds.low ?? 0,
              medium: riskEngineConfig?.thresholds.medium ?? 0,
              high: riskEngineConfig?.thresholds.high ?? 0,
            }),
            engineLatestOrder: t("customerRisk.engine.latestOrder"),
            engineNoOrders: t("customerRisk.engine.noOrders"),
            engineUnavailable: t("customerRisk.engine.unavailable"),
            engineActionCaption: t("risk.assessment.action"),
            engineMeterAria: (score: number) =>
              t("customerRisk.engine.meterAria", { score }),
            engineLevelLabel: (level: RiskLevel) => t(`risk.level.${level}`),
            engineActionLabel: (action: RiskAction) => t(riskActionCopyKey(action)),
            signalsLabel: t("customerRisk.signals.label"),
            signalsScaleHint: t("customerRisk.signals.scaleHint", {
              medium: CUSTOMER_SIGNALS_SCALE.mediumThreshold,
              high: CUSTOMER_SIGNALS_SCALE.highThreshold,
            }),
            signalsNoScore: t("customerRisk.signals.noScore"),
            signalsMeterAria: (score: number) =>
              t("customerRisk.signals.meterAria", { score }),
            signalsLevelLabel: (level: CustomerSignalsLevel) =>
              t(
                level === "low"
                  ? "risk.lowRisk"
                  : level === "medium"
                    ? "risk.mediumRisk"
                    : "risk.highRisk",
              ),
            disagreeNote: t("customerRisk.disagreeNote"),
          }}
          showEngine={canReadRisk}
          engineAssessment={latestOrderAssessment}
          engineOrder={latestOrder}
          engineThresholds={riskEngineConfig?.thresholds ?? null}
          signalsScore={customer.fieldAccess.risk ? riskScore : null}
        />
      ) : null}

      {stats ? (
        <div className="card-grid-4">
          {stats.totalSpent !== null ? (
            <StatCard
              label={t("customers.lifetimeValue")}
              value={formatDZD(stats.totalSpent, locale)}
              icon={<TrendingUp />}
              spark={spendingSeries}
              sparkColor="var(--color-chart-2)"
            />
          ) : null}
          <StatCard
            label={t("customers.totalOrders")}
            value={stats.totalOrders}
            icon={<ShoppingBag />}
          />
          <StatCard
            label={t("customers.deliveryRate")}
            value={`${stats.deliveryRate}%`}
            icon={<Truck />}
          />
          {stats.avgOrderValue !== null ? (
            <StatCard
              label={t("customers.avgOrderValue")}
              value={formatDZD(stats.avgOrderValue, locale)}
              icon={<TrendingUp />}
            />
          ) : null}
        </div>
      ) : null}

      {stats || customer.fieldAccess.contact ? (
        <div className="card-grid-3">
          {stats ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("customers.deliveryRate")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-surface border p-3">
                    <p className="text-xs text-muted-foreground">{t("customers.delivered")}</p>
                    <p className="text-lg font-bold tabular-nums">{stats.deliveredCount}</p>
                  </div>
                  <div className="rounded-surface border p-3">
                    <p className="text-xs text-muted-foreground">{t("customers.returned")}</p>
                    <p className="text-lg font-bold tabular-nums">{stats.returnedCount}</p>
                  </div>
                </div>
                {stats.firstOrderDate ? (
                  <div className="rounded-surface border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t("customers.firstOrder")}</p>
                    <p className="text-sm font-medium">{formatDate(stats.firstOrderDate, locale)}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {customer.fieldAccess.contact ? (
            <Card className={stats ? "lg:col-span-2" : "lg:col-span-3"}>
              <CardHeader>
                <CardTitle className="text-base">
                  {customer.notes ? t("publicForm.notes") : t("customers.address")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">
                  {customer.notes ?? customer.address ?? "—"}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {workbench.canReadOrders ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("customers.orderHistory")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerOrderHistory orders={orders} locale={locale} t={t} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
