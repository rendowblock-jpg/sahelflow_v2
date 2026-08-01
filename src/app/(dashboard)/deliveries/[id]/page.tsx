import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Truck,
  Package,
  PackageCheck,
  Banknote,
  Calendar,
  User,
  Hash,
  Clock,
} from "lucide-react";

import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDZD, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { StatCard } from "@/components/shared/stat-card";
import { deliveryProviderConfig } from "@/lib/shared";
import { orderStatusStyles } from "@/lib/shared";
import { statusI18nKey } from "@/lib/shared/status-colors";
import type { Metadata } from "next";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";

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

  // Use findFirst (not findUnique) so we can filter out soft-deleted
  // deliveries — a stale link to a deleted delivery should 404 (C-audit S2-10).
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

  // Status timeline (based on status transitions)
  const statusOrder = ["created", "pending", "picked_up", "in_transit", "at_hub", "out_for_delivery", "delivered", "returned", "refused", "failed"];
  const currentIdx = statusOrder.indexOf(delivery.status);

  return (
    <div className="app-content page-sections">
      <Breadcrumbs
        items={[
          { label: t("nav.deliveries"), href: "/deliveries" },
          { label: delivery.trackingNumber ?? delivery.order.orderNumber },
        ]}
        className="mb-4"
      />

      <PageHeader
        title={delivery.trackingNumber ?? delivery.order.orderNumber}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" />
              {provider.label}
            </span>
            <span className="inline-flex items-center gap-1">
              <Hash className="h-3.5 w-3.5" />
              <Link href={`/orders/${delivery.order.id}`} className="font-mono hover:underline">
                {delivery.order.orderNumber}
              </Link>
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDate(delivery.createdAt, locale)}
            </span>
          </span>
        }
        actions={
          <Badge variant="outline" className="gap-1.5">
            <span className={`size-1.5 rounded-full ${delivery.status === "delivered" ? "bg-success" : delivery.status === "returned" || delivery.status === "refused" ? "bg-destructive" : "bg-warning"}`} />
            {t(`deliveries.status.${delivery.status}` as string)}
          </Badge>
        }
      />

      {/* Stat cards */}
      <div className="card-grid-4 stagger-grid">
        <StatCard
          label={t("deliveries.table.status")}
          value={t(`deliveries.status.${delivery.status}` as string)}
          icon={<Package />}
          accentBg="bg-teal-500/10 dark:bg-teal-500/15"
          accentIcon="text-teal-600 dark:text-teal-400"
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("deliveries.table.cost")}
          value={delivery.cost ? formatDZD(delivery.cost) : "—"}
          icon={<Banknote />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-success"
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("orders.total")}
          value={formatDZD(delivery.order.totalPrice)}
          icon={<Banknote />}
          accentBg="bg-violet-500/10 dark:bg-violet-500/15"
          accentIcon="text-violet-600 dark:text-violet-400"
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("deliveries.estimatedDelivery")}
          value={delivery.estimatedDelivery ? formatDate(delivery.estimatedDelivery, locale) : "—"}
          icon={<Calendar />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-warning"
          style={{ animationDelay: "240ms" }}
        />
      </div>

      {/* Order + Customer info */}
      <div className="card-grid-2">
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              {t("nav.orders")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("orders.orderNumber")}</span>
              <Link href={`/orders/${delivery.order.id}`} className="font-mono text-sm font-medium hover:underline">
                {delivery.order.orderNumber}
              </Link>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("orders.status")}</span>
              {orderStyle ? (
                <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${orderStyle.bg} ${orderStyle.text} ${orderStyle.border}`}>
                  <span className={`size-1.5 rounded-full ${orderStyle.dot}`} />
                  {t(orderStyle.i18nKey)}
                </span>
              ) : (
                <Badge variant="outline">{t(statusI18nKey(orderStatus))}</Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("orders.total")}</span>
              <span className="text-sm font-semibold tabular-nums">{formatDZD(delivery.order.totalPrice)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("orders.date")}</span>
              <span className="text-sm">{formatDate(delivery.order.createdAt, locale)}</span>
            </div>
            <div className="pt-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/orders/${delivery.order.id}`}>
                  {t("orders.viewDetails")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              {t("nav.customers")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("customers.name")}</span>
              <Link href={`/customers/${delivery.order.customer.id}`} className="text-sm font-medium hover:underline">
                {delivery.order.customer.name}
              </Link>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("customers.phone")}</span>
              <span className="font-mono text-sm">{delivery.order.customer.phone}</span>
            </div>
            {delivery.order.customer.wilaya && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("customers.location")}</span>
                <span className="text-sm">
                  {delivery.order.customer.wilaya}
                  {delivery.order.customer.commune ? ` · ${delivery.order.customer.commune}` : ""}
                </span>
              </div>
            )}
            {delivery.order.customer.address && (
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm text-muted-foreground">{t("customers.address")}</span>
                <span className="text-end text-sm">{delivery.order.customer.address}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status timeline */}
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="text-base">{t("deliveries.timeline")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {statusOrder.map((s, i) => {
              const isPast = i <= currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      isCurrent
                        ? "border-primary bg-primary/10 text-primary"
                        : isPast
                          ? "border-emerald-500/20 bg-emerald-500/5 text-success"
                          : "border-border bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    {isPast && !isCurrent && <PackageCheck className="h-3 w-3" />}
                    {isCurrent && <Truck className="h-3 w-3" />}
                    {t(`deliveries.status.${s}` as string)}
                  </div>
                  {i < statusOrder.length - 1 && (
                    <div className={`h-px w-4 ${isPast ? "bg-success/30" : "bg-border"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
