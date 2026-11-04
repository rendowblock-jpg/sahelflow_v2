import { db, shopContext } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { deliveryService } from "@/lib/data/delivery-service";
import { assessOrderRisk } from "@/lib/risk-engine";
import { formatDZD, formatDate } from "@/lib/utils";
import { NotFoundError } from "@/types/errors";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  assertTrustedAction,
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OrderLifecycleRail } from "@/components/orders/order-lifecycle-rail";
import { OrderStepper, terminalStepFor } from "@/components/orders/order-stepper";
import { OrderSummaryStrip } from "@/components/orders/order-summary-strip";
import { OrderWhatsAppButton } from "@/components/orders/order-whatsapp-button";
import {
  DeliverySlipPrintButton,
  type DeliverySlipData,
} from "@/components/orders/delivery-slip";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { OrderEditPanel } from "@/components/orders/order-edit-panel";
import { OrderDeleteButton } from "@/components/orders/order-delete-button";
import { CreateShipment } from "@/components/orders/create-shipment";
import {
  RiskActionBadgeServer,
  RiskLevelBadgeServer,
} from "@/components/risk/risk-badges";
import { RecentRecordTracker } from "@/components/shared/recent-record-tracker";
import { getI18n } from "@/lib/i18n-server";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clock,
  DollarSign,
  MapPin,
  Package,
  Phone,
  ShieldAlert,
  Sparkles,
  User,
} from "lucide-react";
import { askAiHref } from "@/lib/ai/ask-ai-link";
import { getOrderTimeline } from "@/lib/data/order-change-service";
import {
  getRefundsForOrder,
  getTotalRefunded,
} from "@/lib/data/refund-service";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { DetailOfflineBanner, OfflineWriteGate } from "@/components/orders/offline-write-gate";
import { RefundDialog } from "@/components/orders/refund-dialog";
import { CanonicalCodActions } from "@/components/orders/canonical-cod-actions";
import { CanonicalCourierActions } from "@/components/orders/canonical-courier-actions";
import { CanonicalCustomerReturnActions } from "@/components/orders/canonical-customer-return-actions";
import { CanonicalOrderRecoveryActions } from "@/components/orders/canonical-order-recovery-actions";
import {
  isImportPendingOrderAuthority,
  isSellerEditableLinesAuthority,
  isTrustedManualOrderAuthority,
} from "@/lib/orders/manual-order-authority";
import {
  getOrderRiskFactorPresentation,
  getOrderRiskRuleLabelKey,
  riskActionCopyKey,
} from "@/lib/orders/order-risk-presentation";
import { displayWilaya } from "@/lib/wilaya-display";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("orders.detail.metadataTitle") };
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actorContext = await requireTrustedAction("orders.read");
  assertTrustedAction(actorContext, "customers.contact.read");
  assertTrustedAction(actorContext, "orders.financials.read");
  const { t, locale } = await getI18n();
  const { id } = await params;

  let order;
  try {
    order = await orderService.getById({ prisma: db, shop: shopContext }, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const canonicalManual = isTrustedManualOrderAuthority(
    order.source,
    order.sourceMetadata,
  );
  const importConfirmationBlocked = isImportPendingOrderAuthority(
    order.source,
    order.sourceMetadata,
  );
  const mutationAuthority = canonicalManual
    ? "canonical_v1"
    : importConfirmationBlocked
      ? "confirmation_blocked"
      : "legacy_compatibility";
  const isConfirmationReview = order.status === "pending";
  // R4-e: contextual "Ask AI" entry — permission-gated so sellers without
  // ai.use never see a button that only bounces off /agents.
  const canAskAi = trustedActionAllowed(actorContext, "ai.use");

  // Governed delivered orders surface the COD collection/remit controls when
  // cash is actually expected (parity with the former fulfillment card).
  const showCodAuthority =
    order.status === "delivered" &&
    order.deliveryState === "delivered" &&
    order.codState !== null &&
    order.codState !== "not_expected";

  // Latest milestone timestamp, for the lifecycle rail's "Updated" line.
  const lastChangeAt = [
    order.createdAt,
    order.confirmedAt,
    order.packedAt,
    order.shippedAt,
    order.deliveredAt,
  ].reduce<Date | null>(
    (latest, current) =>
      current && (!latest || current > latest) ? current : latest,
    null,
  );

  // Fetch customer + delivery + risk assessment + timeline + refunds.
  const [
    customer,
    delivery,
    riskAssessment,
    timelineEntries,
    refunds,
    totalRefunded,
  ] = await Promise.all([
    db.customer.findUnique({ where: { id: order.customerId } }),
    deliveryService.getByOrderId({ prisma: db, shop: shopContext }, order.id),
    assessOrderRisk({ prisma: db, shop: shopContext }, order.id).catch(() => null),
    getOrderTimeline({ prisma: db, shop: shopContext }, order.id),
    getRefundsForOrder({ prisma: db, shop: shopContext }, order.id),
    getTotalRefunded({ prisma: db, shop: shopContext }, order.id),
  ]);

  const itemsTotal = order.items.reduce((sum, item) => sum + item.total, 0);
  const deliveryCost = order.deliveryCost ?? 0;
  // R3-b: bon de livraison payload — server-resolved so the slip carries the
  // customer name and the live courier tracking even before any API round-trip.
  const slipData: DeliverySlipData = {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    customerName: customer?.name ?? null,
    phone: order.phone,
    wilaya: order.wilaya,
    commune: order.commune,
    address: order.address,
    items: order.items.map((item) => ({
      name: item.productName,
      variant: item.productVariantName ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    })),
    itemsTotal,
    deliveryCost: order.deliveryCost,
    total: order.totalPrice,
    provider: delivery?.provider ?? null,
    trackingNumber: delivery?.trackingNumber ?? null,
    notes: order.notes,
  };
  const triggeredRuleLabelKeys =
    riskAssessment?.triggeredRules
      .map(getOrderRiskRuleLabelKey)
      .filter((key): key is string => Boolean(key)) ?? [];

  const SOURCE_LABELS: Record<string, string> = {
    whatsapp: "WhatsApp",
    tiktok: "TikTok",
    manual: t("orders.source.manual"),
    storefront: t("orders.source.storefront"),
    ai_chat: t("orders.source.aiChat"),
    shopify: "Shopify",
    woocommerce: "WooCommerce",
    youcan: "YouCan",
  };

  const timeline: Array<{ label: string; date: Date | null; done: boolean }> = [
    { label: t("orders.created"), date: order.createdAt, done: true },
    {
      label: t("orders.status.confirmed"),
      date: order.confirmedAt,
      done: !!order.confirmedAt,
    },
    {
      label: t("orders.statusActions.packed"),
      date: order.packedAt,
      done: !!order.packedAt,
    },
    {
      label: t("orders.status.shipped"),
      date: order.shippedAt,
      done: !!order.shippedAt,
    },
    {
      label: t("orders.status.delivered"),
      date: order.deliveredAt,
      done: !!order.deliveredAt,
    },
  ];

  type RiskFactor = NonNullable<typeof riskAssessment>["factors"][number];
  const renderRiskFactor = (factor: RiskFactor) => {
    const presentation = getOrderRiskFactorPresentation(factor);
    return (
      <div
        key={factor.id}
        className="flex items-start justify-between gap-2 text-sm"
      >
        <div className="min-w-0 flex-1">
          <span className="font-medium">{t(factor.labelKey)}</span>
          <p className="text-xs text-muted-foreground">
            {t(presentation.key, presentation.params)}
          </p>
        </div>
        <span
          className={`font-medium tabular-nums ${factor.points > 0 ? "text-destructive" : "text-success"}`}
        >
          {factor.points > 0 ? "+" : ""}
          {factor.points}
        </span>
      </div>
    );
  };

  return (
    <div className="app-content page-sections">
      <DetailOfflineBanner />
      {/* R4-f: journal this visit for the command palette's Recent section. */}
      <RecentRecordTracker
        kind="order"
        id={order.id}
        label={order.orderNumber}
        href={`/orders/${order.id}`}
      />

      {/* HEADER (not a card): breadcrumb, number + status, one action group. */}
      <header className="space-y-3">
        <nav aria-label={t("orders.detail.breadcrumbLabel")}>
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>
              <Link
                href="/orders"
                className="inline-flex items-center rounded-control hover:text-foreground hover:underline max-sm:min-h-10"
              >
                {t("orders.title")}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="size-4 rtl:rotate-180" />
            </li>
          </ol>
        </nav>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="break-words font-mono text-2xl font-semibold">
                {order.orderNumber}
              </h1>
              <OrderStatusBadge
                orderId={order.id}
                status={order.status}
                disabled={canonicalManual || importConfirmationBlocked}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(order.createdAt, locale)}
              {" · "}
              {SOURCE_LABELS[order.source] ?? order.source}
              {" · "}
              {t("orders.detail.itemsCount", { count: order.items.length })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {canAskAi ? (
              /* R4-e deep link: order NUMBER only in the URL — the assistant
                 resolves the full record through its permission-checked
                 tools; no customer PII rides in the address bar. */
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={askAiHref(
                    t("ai.ask.orderPrompt", {
                      orderNumber: order.orderNumber,
                    }),
                  )}
                  data-testid="order-header-ask-ai"
                >
                  <Sparkles className="me-1.5 size-4" aria-hidden="true" />
                  {t("ai.ask.button")}
                </Link>
              </Button>
            ) : null}
            <DeliverySlipPrintButton
              slips={[slipData]}
              className="whitespace-normal h-auto min-h-10 text-center"
            />
            {!canonicalManual && (
              <OfflineWriteGate>
                <OrderDeleteButton orderId={order.id} orderStatus={order.status} />
              </OfflineWriteGate>
            )}
          </div>
        </div>
      </header>

      {/* SUMMARY STRIP: who, how much, where, what next. The lower part of the same
          card is the lifecycle: the stepper (the former Tracking card) and the rail. */}
      <OrderSummaryStrip
        t={t}
        locale={locale}
        status={order.status}
        totalPrice={order.totalPrice}
        deliveryCost={deliveryCost}
        itemCount={order.items.length}
        customerName={customer?.name ?? null}
        phone={order.phone ?? customer?.phone ?? null}
        wilaya={order.wilaya}
        commune={order.commune}
        address={order.address}
        codState={order.codState}
        deliveryState={order.deliveryState}
        delivery={
          delivery
            ? {
                provider: delivery.provider,
                trackingNumber: delivery.trackingNumber,
                status: delivery.status,
              }
            : null
        }
        whatsapp={
          <OfflineWriteGate>
            <OrderWhatsAppButton
              phone={order.phone ?? customer?.phone ?? null}
              customerName={customer?.name ?? null}
              orderNumber={order.orderNumber}
              total={order.totalPrice}
            />
          </OfflineWriteGate>
        }
      >
        {isConfirmationReview ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                {t("orders.workspace.confirmation.title")}
              </h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t("orders.workspace.confirmation.description")}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/orders/confirmation-queue">
                <ArrowLeft className="me-1.5 size-4 rtl:rotate-180" />
                {t("orders.workspace.confirmation.backToQueue")}
              </Link>
            </Button>
          </div>
        ) : null}
        <div id="order-tracking" className="scroll-mt-20">
          <OrderStepper
            steps={timeline}
            terminal={terminalStepFor(order.status, t)}
            locale={locale}
            ariaLabel={t("orderLifecycle.stepsLabel")}
            stateLabels={{
              done: t("orders.detail.stepper.done"),
              current: t("orders.detail.stepper.current"),
              upcoming: t("orders.detail.stepper.upcoming"),
            }}
          />
        </div>
        {/* R3-a: one lifecycle rail replaces the former dual action cards
            (legacy free transitions vs canonical governed commands). The
            stepper above draws the path, so the rail shows only its actions. */}
        <OrderLifecycleRail
          orderId={order.id}
          orderNumber={order.orderNumber}
          status={order.status}
          version={order.version}
          mutationAuthority={mutationAuthority}
          fulfillmentState={order.fulfillmentState}
          deliveryState={order.deliveryState}
          inventoryState={order.inventoryState}
          codState={order.codState}
          packedAt={order.packedAt ? order.packedAt.toISOString() : null}
          lastChangeAt={lastChangeAt ? lastChangeAt.toISOString() : null}
          showProgress={false}
          className="space-y-2"
        />
        {canonicalManual &&
          order.status !== "pending" &&
          order.status !== "cancelled" && (
            <div className="space-y-3 border-t pt-4">
              <h2 className="text-sm font-semibold">
                {t("orderLifecycle.aux.heading")}
              </h2>
              <OfflineWriteGate className="m-0 min-w-0 space-y-5 border-0 p-0">
                <CanonicalCourierActions orderId={order.id} />
                {showCodAuthority ? (
                  <div className="border-t pt-5">
                    <CanonicalCodActions orderId={order.id} />
                  </div>
                ) : null}
                <CanonicalOrderRecoveryActions orderId={order.id} />
                <CanonicalCustomerReturnActions orderId={order.id} />
              </OfflineWriteGate>
            </div>
          )}
      </OrderSummaryStrip>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <OfflineWriteGate className="m-0 min-w-0 border-0 p-0">
            <OrderEditPanel
              // A new version remounts the panel, so what it shows after a save is what is stored.
              key={`${order.id}:${order.version}`}
              orderId={order.id}
              readOnly={canonicalManual && order.status !== "pending"}
              canonicalVersion={
                canonicalManual && order.status === "pending"
                  ? order.version
                  : undefined
              }
              linesEditable={
                order.status === "pending" &&
                isSellerEditableLinesAuthority(order.source, order.sourceMetadata)
              }
              initialItems={order.items.map((i) => ({
                id: i.id,
                productId: i.productId,
                productVariantId: i.productVariantId ?? null,
                productName: i.productName,
                productVariantName: i.productVariantName ?? null,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                total: i.total,
              }))}
              initialDeliveryCost={deliveryCost}
              initialWilaya={order.wilaya}
              initialCommune={order.commune}
              initialAddress={order.address}
              initialPhone={order.phone}
              initialNotes={order.notes}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package className="size-4" />
                    {t("orders.detail.itemsWithCount", { n: order.items.length })}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="divide-y">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-4 py-3 first:pt-0"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <p className="break-words text-sm font-medium">
                            {item.productName}
                          </p>
                          {item.productVariantName && (
                            <p className="text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1 rounded-control border px-1.5 py-0.5">
                                {t("products.variant")}: {item.productVariantName}
                              </span>
                            </p>
                          )}
                          <p className="text-xs tabular-nums text-muted-foreground">
                            {item.quantity} × {formatDZD(item.unitPrice, locale)}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-medium tabular-nums">
                          {formatDZD(item.total, locale)}
                        </p>
                      </li>
                    ))}
                  </ul>

                  <div className="ms-auto w-full max-w-xs space-y-2 border-t pt-4">
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {t("orders.detail.subtotal")}
                      </span>
                      <span className="tabular-nums">
                        {formatDZD(itemsTotal, locale)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {t("orders.detail.shipping")}
                      </span>
                      <span className="tabular-nums">
                        {deliveryCost > 0 ? formatDZD(deliveryCost, locale) : "—"}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex items-baseline justify-between gap-4 text-lg font-semibold">
                      <span>{t("orders.total")}</span>
                      <span className="tabular-nums">
                        {formatDZD(order.totalPrice, locale)}
                      </span>
                    </div>
                  </div>

                  {order.notes ? (
                    <div className="space-y-1 border-t pt-4">
                      <h3 className="text-sm font-medium">{t("orders.notes")}</h3>
                      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {order.notes}
                      </p>
                    </div>
                  ) : null}

                  {!canonicalManual &&
                    ["delivered", "returned", "refused"].includes(order.status) && (
                      <div className="space-y-3 border-t pt-4">
                        <h3 className="flex items-center gap-2 text-sm font-medium">
                          <DollarSign className="size-4" />
                          {t("orders.refund.title")}
                        </h3>
                        {refunds.length > 0 && (
                          <div className="space-y-1.5">
                            {refunds.map((r) => (
                              <div
                                key={r.id}
                                className="flex items-center justify-between gap-3 rounded-surface border p-2.5 text-sm"
                              >
                                <div className="min-w-0">
                                  <span className="font-medium">
                                    {formatDZD(r.amount, locale)}
                                  </span>
                                  <span className="ms-2 text-muted-foreground">
                                    · {r.method}
                                  </span>
                                  {r.reason && (
                                    <span className="ms-2 text-muted-foreground">
                                      · {r.reason}
                                    </span>
                                  )}
                                </div>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {formatDate(r.createdAt, locale)}
                                </span>
                              </div>
                            ))}
                            <div className="flex justify-between border-t pt-2 text-sm">
                              <span className="font-medium">
                                {t("orders.refund.total")}
                              </span>
                              <span className="font-bold text-destructive">
                                {formatDZD(totalRefunded, locale)}
                              </span>
                            </div>
                          </div>
                        )}
                        {totalRefunded < order.totalPrice && (
                          <OfflineWriteGate>
                            <RefundDialog
                              orderId={order.id}
                              orderNumber={order.orderNumber}
                              maxAmount={order.totalPrice}
                              alreadyRefunded={totalRefunded}
                            />
                          </OfflineWriteGate>
                        )}
                      </div>
                    )}
                </CardContent>
              </Card>

              {!canonicalManual && (
                <OfflineWriteGate>
                  <CreateShipment
                    orderId={order.id}
                    orderStatus={order.status}
                    delivery={
                      delivery
                        ? {
                            id: delivery.id,
                            provider: delivery.provider,
                            trackingNumber: delivery.trackingNumber,
                            labelUrl: delivery.labelUrl,
                            cost: delivery.cost,
                            status: delivery.status,
                          }
                        : null
                    }
                  />
                </OfflineWriteGate>
              )}
            </OrderEditPanel>
          </OfflineWriteGate>
        </div>

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-4 lg:-m-1 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:p-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="size-4" />
                {t("orders.detail.customerAddress")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {customer ? (
                <div className="space-y-1">
                  <p className="break-words text-sm font-medium">
                    <bdi dir="auto">{customer.name}</bdi>
                  </p>
                  {customer.orderCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {customer.orderCount > 1
                        ? t("orders.detail.ordersCountPlural", {
                            n: customer.orderCount,
                          })
                        : t("orders.detail.ordersCountSingular", {
                            n: customer.orderCount,
                          })}
                      {" · "}
                      {formatDZD(customer.totalSpent, locale)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("orders.detail.customerNotFound")}
                </p>
              )}
              <div className="space-y-2 text-sm">
                {(order.phone ?? customer?.phone) ? (
                  <div className="flex items-center gap-2">
                    <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                    <a
                      href={`tel:${order.phone ?? customer?.phone}`}
                      dir="ltr"
                      className="tabular-nums hover:underline"
                    >
                      {order.phone ?? customer?.phone}
                    </a>
                  </div>
                ) : null}
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    {order.address ? (
                      <p className="break-words">{order.address}</p>
                    ) : null}
                    <p className="text-muted-foreground">
                      {order.commune}, {displayWilaya(order.wilaya, locale)}
                    </p>
                  </div>
                </div>
              </div>
              {customer ? (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href={`/customers/${customer.id}`}>
                    {t("orders.detail.viewCustomer")}
                    <ArrowRight className="ms-1 size-3.5 rtl:rotate-180" />
                  </Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {riskAssessment && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="size-4" />
                  {t("risk.assessment.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-semibold tabular-nums">
                      {riskAssessment.score}
                    </span>
                    <span className="text-sm text-muted-foreground">/ 100</span>
                    <RiskLevelBadgeServer
                      level={riskAssessment.level}
                      label={t(`risk.level.${riskAssessment.level}`)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {t("risk.assessment.action")}
                    </span>
                    <RiskActionBadgeServer
                      action={riskAssessment.action}
                      label={t(riskActionCopyKey(riskAssessment.action))}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("risk.assessment.factors")}
                  </p>
                  {riskAssessment.factors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("risk.assessment.noFactors")}
                    </p>
                  ) : (
                    <>
                      {riskAssessment.factors.slice(0, 3).map(renderRiskFactor)}
                      {riskAssessment.factors.length > 3 ? (
                        <details>
                          <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium text-primary hover:underline">
                            {t("orders.detail.risk.moreFactors", {
                              count: riskAssessment.factors.length - 3,
                            })}
                          </summary>
                          <div className="mt-2 space-y-2">
                            {riskAssessment.factors.slice(3).map(renderRiskFactor)}
                          </div>
                        </details>
                      ) : null}
                    </>
                  )}
                </div>

                {riskAssessment.ruleOverride && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {t("risk.assessment.ruleOverride")}
                      </p>
                      {triggeredRuleLabelKeys.length > 0 ? (
                        <p className="text-xs font-medium">
                          {triggeredRuleLabelKeys.map((key) => t(key)).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </>
                )}

                <Link
                  href="/risk"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline max-sm:min-h-10"
                >
                  <ShieldAlert className="size-3" />
                  {t("risk.title")}
                </Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4" />
                {t("orders.detail.activity")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* The one timeline of the page: it scrolls inside a bounded, focusable region. */}
              <div
                role="region"
                aria-label={t("orders.detail.activity")}
                tabIndex={0}
                className="max-h-72 overflow-y-auto rounded-control pe-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <OrderTimeline
                  entries={timelineEntries.map((e) => ({
                    id: e.id,
                    actionType: e.actionType,
                    actor: e.actor ?? "system",
                    payload: e.payload,
                    status: e.status,
                    createdAt: e.createdAt.toISOString(),
                  }))}
                />
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
