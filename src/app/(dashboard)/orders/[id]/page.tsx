import { db } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { deliveryService } from "@/lib/data/delivery-service";
import { assessOrderRisk } from "@/lib/risk-engine";
import { formatDZD, formatDate } from "@/lib/utils";
import { NotFoundError } from "@/types/errors";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OrderStatusActions } from "@/components/orders/order-status-actions";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { OrderEditPanel } from "@/components/orders/order-edit-panel";
import { OrderDeleteButton } from "@/components/orders/order-delete-button";
import { CreateShipment } from "@/components/orders/create-shipment";
import { RiskLevelBadgeServer, RiskActionBadgeServer } from "@/components/risk/risk-badges";
import { getI18n } from "@/lib/i18n-server";
import {
  ArrowRight,
  Phone,
  MapPin,
  Calendar,
  MessageSquare,
  Package,
  User,
  ArrowLeft,
  ShieldAlert,
  Clock,
  DollarSign,
} from "lucide-react";
import { getOrderTimeline } from "@/lib/data/order-change-service";
import { getRefundsForOrder, getTotalRefunded } from "@/lib/data/refund-service";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { RefundDialog } from "@/components/orders/refund-dialog";
import { CodControls } from "@/components/orders/cod-controls";

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
  const { t, locale } = await getI18n();
  const { id } = await params;

  let order;
  try {
    order = await orderService.getById({ prisma: db }, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  // Fetch customer + delivery + risk assessment + timeline + refunds + COD fields
  const [customer, delivery, riskAssessment, timelineEntries, refunds, totalRefunded, codData] = await Promise.all([
    db.customer.findUnique({ where: { id: order.customerId } }),
    deliveryService.getByOrderId({ prisma: db }, order.id),
    assessOrderRisk(order.id).catch(() => null),
    getOrderTimeline(order.id),
    getRefundsForOrder(order.id),
    getTotalRefunded(order.id),
    db.order.findUnique({
      where: { id: order.id },
      select: {
        codCollected: true, codCollectedAt: true,
        codRemitted: true, codRemittedAt: true, codRemittanceRef: true,
      },
    }),
  ]);

  const itemsTotal = order.items.reduce((sum, item) => sum + item.total, 0);
  const deliveryCost = order.deliveryCost ?? 0;

  const SOURCE_LABELS: Record<string, string> = {
    whatsapp: "WhatsApp",
    tiktok: "TikTok",
    manual: t("orders.source.manual"),
    webstore: t("orders.source.webstore"),
    shopify: "Shopify",
    woocommerce: "WooCommerce",
    youcan: "YouCan",
  };

  // Status timeline
  const timeline: Array<{ label: string; date: Date | null; done: boolean }> = [
    { label: t("orders.created"), date: order.createdAt, done: true },
    { label: t("orders.status.confirmed"), date: order.confirmedAt, done: !!order.confirmedAt },
    { label: t("orders.status.shipped"), date: order.shippedAt, done: !!order.shippedAt },
    { label: t("orders.status.delivered"), date: order.deliveredAt, done: !!order.deliveredAt },
  ];

  return (
    <div className="app-content page-sections">
      {/* Breadcrumb + header */}
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ms-2">
          <Link href="/orders">
            <ArrowLeft className="h-4 w-4 me-1 rtl:rotate-180" />
            {t("orders.detail.backToOrders")}
          </Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight font-mono">
                {order.orderNumber}
              </h1>
              <OrderStatusBadge
                orderId={order.id}
                status={order.status}
              />
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(order.createdAt, locale)}
              <span className="mx-1">·</span>
              <MessageSquare className="h-3.5 w-3.5" />
              {SOURCE_LABELS[order.source] ?? order.source}
            </p>
          </div>
          <OrderDeleteButton orderId={order.id} orderStatus={order.status} />
        </div>

        {/* Status actions (client component) */}
        <Card>
          <CardContent className="pt-6">
            <OrderStatusActions orderId={order.id} currentStatus={order.status} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: items + totals */}
        <div className="lg:col-span-2 space-y-6">
          <OrderEditPanel
            orderId={order.id}
            initialItems={order.items.map((i) => ({
              id: i.id,
              productId: i.productId,
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
            {/* Items */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="h-4 w-4" />
                  {t("orders.detail.itemsWithCount", { n: order.items.length })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-3 border-b last:border-0"
                    >
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × {formatDZD(item.unitPrice)}
                        </p>
                        {item.productVariantName && (
                          <p className="text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5">
                              {t("products.variant")}: {item.productVariantName}
                            </span>
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-medium">{formatDZD(item.total)}</p>
                    </div>
                  ))}
                </div>

                <Separator className="my-4" />

                {/* Totals */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("orders.detail.subtotal")}</span>
                    <span>{formatDZD(itemsTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("orders.detail.shipping")}</span>
                    <span>{deliveryCost > 0 ? formatDZD(deliveryCost) : "—"}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-base font-bold">
                    <span>{t("orders.total")}</span>
                    <span>{formatDZD(order.totalPrice)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Delivery / shipment */}
            <CreateShipment
              orderId={order.id}
              orderStatus={order.status}
              delivery={delivery ? {
                id: delivery.id,
                provider: delivery.provider,
                trackingNumber: delivery.trackingNumber,
                labelUrl: delivery.labelUrl,
                cost: delivery.cost,
                status: delivery.status,
              } : null}
            />

            {/* Notes */}
            {order.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("orders.notes")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {order.notes}
                  </p>
                </CardContent>
              </Card>
            )}
          </OrderEditPanel>
        </div>

        {/* Right column: risk + customer + timeline */}
        <div className="space-y-6">
          {/* Risk assessment card */}
          {riskAssessment && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="h-4 w-4" />
                  {t("risk.assessment.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Score + level + action */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold tabular-nums">{riskAssessment.score}</span>
                      <span className="text-sm text-muted-foreground">/ 100</span>
                    </div>
                    <RiskLevelBadgeServer level={riskAssessment.level} label={t(`risk.level.${riskAssessment.level}`)} />
                  </div>
                  <div className="text-end space-y-1">
                    <p className="text-xs text-muted-foreground">{t("risk.assessment.action")}</p>
                    <RiskActionBadgeServer action={riskAssessment.action} label={t(`risk.action.${riskAssessment.action}`)} />
                  </div>
                </div>

                <Separator />

                {/* Factors breakdown */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("risk.assessment.factors")}
                  </p>
                  {riskAssessment.factors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("risk.assessment.noFactors")}</p>
                  ) : (
                    riskAssessment.factors.map((factor) => (
                      <div key={factor.id} className="flex items-start justify-between gap-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{t(factor.labelKey)}</span>
                          <p className="text-xs text-muted-foreground">{factor.explanation}</p>
                        </div>
                        <span
                          className={`tabular-nums font-medium ${factor.points > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
                        >
                          {factor.points > 0 ? "+" : ""}{factor.points}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Rule override notice */}
                {riskAssessment.ruleOverride && (
                  <>
                    <Separator />
                    <p className="text-xs text-muted-foreground">
                      {t("risk.assessment.ruleOverride")}: {riskAssessment.triggeredRules.join(", ")}
                    </p>
                  </>
                )}

                {/* Link to risk dashboard */}
                <Link
                  href="/risk"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ShieldAlert className="h-3 w-3" />
                  {t("risk.title")}
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Customer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                {t("orders.customer")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer ? (
                <>
                  <div>
                    <p className="text-sm font-medium">{customer.name}</p>
                    {customer.orderCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {customer.orderCount > 1
                          ? t("orders.detail.ordersCountPlural", { n: customer.orderCount })
                          : t("orders.detail.ordersCountSingular", { n: customer.orderCount })}
                        {" · "}
                        {formatDZD(customer.totalSpent)}
                      </p>
                    )}
                  </div>
                  <Separator />
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <a href={`tel:${customer.phone}`} className="hover:underline">
                        {customer.phone}
                      </a>
                    </div>
                    {customer.wilaya && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>
                          {customer.commune ?? ""}, {customer.wilaya}
                        </span>
                      </div>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href={`/customers/${customer.id}`}>
                      {t("orders.detail.viewCustomer")}
                      <ArrowRight className="h-3.5 w-3.5 ms-1 rtl:rotate-180" />
                    </Link>
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("orders.detail.customerNotFound")}</p>
              )}
            </CardContent>
          </Card>

          {/* Delivery address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" />
                {t("orders.address")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{order.phone}</p>
              <p className="text-muted-foreground">{order.address}</p>
              <p className="text-muted-foreground">
                {order.commune}, {order.wilaya}
              </p>
            </CardContent>
          </Card>

          {/* Status timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("orders.detail.tracking")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {timeline.map((step, i) => (
                  <div key={step.label} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${
                          step.done ? "bg-primary" : "bg-muted-foreground/30"
                        }`}
                      />
                      {i < timeline.length - 1 && (
                        <div
                          className={`w-0.5 h-8 ${
                            step.done ? "bg-primary" : "bg-muted-foreground/20"
                          }`}
                        />
                      )}
                    </div>
                    <div className="pt-0">
                      <p className={`text-sm font-medium ${step.done ? "" : "text-muted-foreground"}`}>
                        {step.label}
                      </p>
                      {step.date && (
                        <p className="text-xs text-muted-foreground">
                          {formatDate(step.date, locale)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Order change ledger timeline (Phase 4 — Medusa pattern) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                {t("orders.detail.activity")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OrderTimeline entries={timelineEntries.map((e) => ({
                id: e.id,
                actionType: e.actionType,
                actor: e.actor ?? "system",
                payload: e.payload,
                status: e.status,
                createdAt: e.createdAt.toISOString(),
              }))} />
            </CardContent>
          </Card>

          {/* COD reconciliation controls (Phase 4 — killer COD feature) */}
          {order.status === "delivered" && codData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <DollarSign className="h-4 w-4" />
                  {t("orders.cod.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CodControls
                  orderId={order.id}
                  orderNumber={order.orderNumber}
                  amount={order.totalPrice}
                  codCollected={codData.codCollected}
                  codCollectedAt={codData.codCollectedAt?.toISOString() ?? null}
                  codRemitted={codData.codRemitted}
                  codRemittedAt={codData.codRemittedAt?.toISOString() ?? null}
                  codRemittanceRef={codData.codRemittanceRef}
                />
              </CardContent>
            </Card>
          )}

          {/* Refund section (Phase 4) */}
          {["delivered", "returned", "refused"].includes(order.status) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <DollarSign className="h-4 w-4" />
                  {t("orders.refund.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {refunds.length > 0 && (
                  <div className="space-y-1.5">
                    {refunds.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                        <div>
                          <span className="font-medium">{formatDZD(r.amount)}</span>
                          <span className="text-muted-foreground ms-2">· {r.method}</span>
                          {r.reason && <span className="text-muted-foreground ms-2">· {r.reason}</span>}
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDate(r.createdAt, locale)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t pt-2 text-sm">
                      <span className="font-medium">{t("orders.refund.total")}</span>
                      <span className="font-bold text-red-600">{formatDZD(totalRefunded)}</span>
                    </div>
                  </div>
                )}
                {totalRefunded < order.totalPrice && (
                  <RefundDialog
                    orderId={order.id}
                    orderNumber={order.orderNumber}
                    maxAmount={order.totalPrice}
                    alreadyRefunded={totalRefunded}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
