import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, Calendar, Clock, Hash, Package, Truck, User } from "lucide-react";

import { EntityLink, EntityTimeline } from "@/components/entities/entity-context";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { assertTrustedAction, requireTrustedAction } from "@/lib/identity/authorization";
import { deliveryProviderConfig, orderStatusStyles } from "@/lib/shared";
import { statusI18nKey } from "@/lib/shared/status-colors";
import { formatDZD, formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.deliveries") };
}

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ id: string }> };

export default async function DeliveryDetailPage({ params }: PageProps) {
  const actorContext = await requireTrustedAction("deliveries.read");
  assertTrustedAction(actorContext, "customers.contact.read");
  assertTrustedAction(actorContext, "orders.financials.read");
  const { t, locale } = await getI18n();
  const { id } = await params;

  const delivery = await db.delivery.findFirst({
    where: { id, deletedAt: null },
    include: {
      order: {
        include: {
          customer: { select: { id: true, name: true, phone: true, wilaya: true, commune: true, address: true } },
          items: true,
        },
      },
    },
  });
  if (!delivery) notFound();

  const provider = deliveryProviderConfig[delivery.provider] ?? { label: delivery.provider, icon: Truck };
  const orderStatus = delivery.order.status;
  const orderStyle = orderStatusStyles[orderStatus as keyof typeof orderStatusStyles];
  const statusOrder = ["created", "pending", "picked_up", "in_transit", "at_hub", "out_for_delivery", "delivered", "returned", "refused", "failed"];
  const currentIdx = statusOrder.indexOf(delivery.status);
  const terminalFailure = ["returned", "refused", "failed"].includes(delivery.status);
  const timelineItems = statusOrder.map((status, index) => ({
    id: status,
    title: t(`deliveries.status.${status}`),
    timestamp: index === 0 ? formatDate(delivery.createdAt, locale) : undefined,
    icon: index === currentIdx ? Truck : Package,
    tone:
      index === currentIdx
        ? terminalFailure
          ? ("danger" as const)
          : delivery.status === "delivered"
            ? ("success" as const)
            : ("warning" as const)
        : index < currentIdx
          ? ("success" as const)
          : ("neutral" as const),
  }));

  return (
    <div className="app-content page-sections">
      <Breadcrumbs
        items={[
          { label: t("nav.deliveries"), href: "/deliveries" },
          { label: delivery.trackingNumber ?? delivery.order.orderNumber },
        ]}
      />

      <PageHeader
        title={delivery.trackingNumber ?? delivery.order.orderNumber}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Truck className="size-3.5" aria-hidden="true" />
              {provider.label}
            </span>
            <span className="inline-flex items-center gap-1">
              <Hash className="size-3.5" aria-hidden="true" />
              <EntityLink
                href={`/orders/${delivery.order.id}`}
                label={delivery.order.orderNumber}
                className="font-mono"
              />
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden="true" />
              {formatDate(delivery.createdAt, locale)}
            </span>
          </span>
        }
        actions={
          <Badge variant={delivery.status === "delivered" ? "default" : terminalFailure ? "destructive" : "secondary"}>
            {t(`deliveries.status.${delivery.status}`)}
          </Badge>
        }
      />

      <div className="card-grid-4">
        <StatCard label={t("deliveries.table.status")} value={t(`deliveries.status.${delivery.status}`)} icon={<Package />} />
        <StatCard label={t("deliveries.table.cost")} value={delivery.cost ? formatDZD(delivery.cost, locale) : "—"} icon={<Banknote />} />
        <StatCard label={t("orders.total")} value={formatDZD(delivery.order.totalPrice, locale)} icon={<Banknote />} />
        <StatCard label={t("deliveries.estimatedDelivery")} value={delivery.estimatedDelivery ? formatDate(delivery.estimatedDelivery, locale) : "—"} icon={<Calendar />} />
      </div>

      <div className="card-grid-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="size-4" aria-hidden="true" />
              {t("nav.orders")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{t("orders.orderNumber")}</span>
              <EntityLink
                href={`/orders/${delivery.order.id}`}
                label={delivery.order.orderNumber}
                className="font-mono"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{t("orders.status")}</span>
              {orderStyle ? (
                <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${orderStyle.bg} ${orderStyle.text} ${orderStyle.border}`}>
                  <span className={`size-1.5 rounded-full ${orderStyle.dot}`} aria-hidden="true" />
                  {t(orderStyle.i18nKey)}
                </span>
              ) : (
                <Badge variant="outline">{t(statusI18nKey(orderStatus))}</Badge>
              )}
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{t("orders.total")}</span>
              <span className="text-sm font-semibold tabular-nums">{formatDZD(delivery.order.totalPrice, locale)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{t("orders.date")}</span>
              <span className="text-sm">{formatDate(delivery.order.createdAt, locale)}</span>
            </div>
            <div className="pt-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/orders/${delivery.order.id}`}>{t("orders.viewDetails")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="size-4" aria-hidden="true" />
              {t("nav.customers")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{t("customers.name")}</span>
              <EntityLink
                href={`/customers/${delivery.order.customer.id}`}
                label={delivery.order.customer.name}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{t("customers.phone")}</span>
              <span className="font-mono text-sm" dir="ltr">{delivery.order.customer.phone}</span>
            </div>
            {delivery.order.customer.wilaya ? (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">{t("customers.location")}</span>
                <span className="text-sm">
                  {delivery.order.customer.wilaya}
                  {delivery.order.customer.commune ? ` · ${delivery.order.customer.commune}` : ""}
                </span>
              </div>
            ) : null}
            {delivery.order.customer.address ? (
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm text-muted-foreground">{t("customers.address")}</span>
                <span className="text-end text-sm">{delivery.order.customer.address}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("deliveries.timeline")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EntityTimeline items={timelineItems} />
        </CardContent>
      </Card>
    </div>
  );
}
