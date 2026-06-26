import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";

import { formatDZD, formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { DeliveryRowActions } from "@/components/deliveries/delivery-row-actions";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { PremiumTable } from "@/components/shared/premium-table";
import { DeliveryStatusBadge } from "@/components/deliveries/delivery-status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { getBrandIcon } from "@/components/brand/brand-icons";
import Link from "next/link";
import {
  Truck,
  PackageCheck,
  AlertCircle,
  Banknote,
} from "lucide-react";
import { deliveryProviderConfig } from "@/lib/shared";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.deliveries") };
}
export const revalidate = 30;
export const dynamic = "force-dynamic";


const FILTER_I18N: Record<string, string> = {
  all: "deliveries.filter.all",
  pending: "deliveries.filter.pending",
  in_transit: "deliveries.filter.inTransit",
  delivered: "deliveries.filter.delivered",
  returned: "deliveries.filter.returned",
};

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { t, locale } = await getI18n();
  const { status: statusFilter } = await searchParams;

  // Fetch deliveries with order + customer info
  const where = statusFilter && statusFilter !== "all"
    ? { status: statusFilter }
    : undefined;

  const [allDeliveries, filteredDeliveries] = await Promise.all([
    db.delivery.findMany({
      include: { order: { include: { customer: { select: { name: true, phone: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.delivery.findMany({
      where,
      include: { order: { include: { customer: { select: { name: true, phone: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  // Counts by status
  const counts: Record<string, number> = { all: allDeliveries.length };
  for (const d of allDeliveries) {
    counts[d.status] = (counts[d.status] ?? 0) + 1;
  }

  // Stat cards — using the premium StatCard component
  const active = allDeliveries.filter((d) =>
    ["pending", "created", "picked_up", "in_transit", "at_hub", "out_for_delivery"].includes(d.status),
  );
  const delivered = allDeliveries.filter((d) => d.status === "delivered");
  const returned = allDeliveries.filter((d) => ["returned", "refused", "failed"].includes(d.status));
  const totalCost = allDeliveries.reduce((sum, d) => sum + (d.cost ?? 0), 0);
  const deliveryRate = allDeliveries.length > 0
    ? Math.round((delivered.length / allDeliveries.length) * 100)
    : 0;

  const STATUS_FILTERS = Object.entries(FILTER_I18N).map(([value, key]) => ({
    value,
    label: t(key),
  }));

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.delivery")}
        description={t("deliveries.subtitle")}
      />

      {/* Stat cards — premium StatCard with proper icons */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("deliveries.activeDeliveries")}
          value={active.length}
          icon={<Truck />}
          accentBg="bg-sky-500/10 dark:bg-sky-500/15"
          accentIcon="text-sky-600 dark:text-sky-400"
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("deliveries.delivered")}
          value={delivered.length}
          icon={<PackageCheck />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-emerald-600 dark:text-emerald-400"
          trend={deliveryRate}
          trendLabel={t("dashboard.deliveryRate")}
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("deliveries.returnsFailed")}
          value={returned.length}
          icon={<AlertCircle />}
          accentBg="bg-red-500/10 dark:bg-red-500/15"
          accentIcon="text-red-600 dark:text-red-400"
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("deliveries.totalCost")}
          value={formatDZD(totalCost)}
          icon={<Banknote />}
          accentBg="bg-violet-500/10 dark:bg-violet-500/15"
          accentIcon="text-violet-600 dark:text-violet-400"
          style={{ animationDelay: "240ms" }}
        />
      </div>

      {/* Status filter */}
      <Tabs defaultValue={statusFilter ?? "all"}>
        <TabsList className="flex-wrap h-auto">
          {STATUS_FILTERS.map((filter) => (
            <TabsTrigger key={filter.value} value={filter.value} asChild>
              <Link
                href={filter.value === "all" ? "/deliveries" : `/deliveries?status=${filter.value}`}
                className="flex items-center gap-1.5"
              >
                {filter.label}
                {counts[filter.value] !== undefined && (
                  <Badge variant="secondary" className="ms-1 text-xs px-1.5 py-0">
                    {counts[filter.value]}
                  </Badge>
                )}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Deliveries table */}
      <Card className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardContent className="p-0">
          {filteredDeliveries.length === 0 ? (
            <EmptyState
              icon={Truck}
              title={t("deliveries.empty.title")}
              description={t("deliveries.empty.description")}
              actionLabel={t("deliveries.empty.action")}
              actionHref="/orders"
            />
          ) : (
            <PremiumTable>
              <PremiumTable.Header>
                <PremiumTable.Row>
                  <PremiumTable.Head>{t("deliveries.table.tracking")}</PremiumTable.Head>
                  <PremiumTable.Head>{t("deliveries.table.order")}</PremiumTable.Head>
                  <PremiumTable.Head>{t("deliveries.table.customer")}</PremiumTable.Head>
                  <PremiumTable.Head hideOn="sm">{t("deliveries.table.carrier")}</PremiumTable.Head>
                  <PremiumTable.Head align="end" hideOn="md">{t("deliveries.table.cost")}</PremiumTable.Head>
                  <PremiumTable.Head align="center">{t("deliveries.table.status")}</PremiumTable.Head>
                  <PremiumTable.Head hideOn="lg">{t("deliveries.table.date")}</PremiumTable.Head>
                  <PremiumTable.Head align="end" width="w-20">{t("deliveries.table.action")}</PremiumTable.Head>
                </PremiumTable.Row>
              </PremiumTable.Header>
              <PremiumTable.Body>
                {filteredDeliveries.map((delivery) => {
                  const order = delivery.order;
                  const customer = order?.customer;
                  const providerConfig = deliveryProviderConfig[delivery.provider];
                  const BrandIcon = getBrandIcon(delivery.provider);
                  return (
                    <PremiumTable.Row key={delivery.id}>
                      <PremiumTable.Cell className="font-mono text-xs">
                        {delivery.trackingNumber ?? "—"}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell>
                        {order ? (
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-mono text-sm font-medium text-primary hover:underline"
                          >
                            {order.orderNumber}
                          </Link>
                        ) : "—"}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell>
                        <div className="text-sm font-medium">{customer?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{order?.wilaya ?? "—"}</div>
                      </PremiumTable.Cell>
                      <PremiumTable.Cell hideOn="sm">
                        {providerConfig ? (
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            {BrandIcon ? (
                              <BrandIcon className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <span className={`size-2 rounded-full ${providerConfig.color}`} />
                            )}
                            {providerConfig.label}
                          </span>
                        ) : (
                          <span className="text-sm">{delivery.provider}</span>
                        )}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell align="end" hideOn="md" className="tabular-nums">
                        {delivery.cost ? formatDZD(delivery.cost) : "—"}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell align="center">
                        <DeliveryStatusBadge
                          deliveryId={delivery.id}
                          status={delivery.status}
                          size="sm"
                        />
                      </PremiumTable.Cell>
                      <PremiumTable.Cell hideOn="lg" className="text-muted-foreground">
                        {formatDate(delivery.createdAt, locale)}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell align="end">
                        <DeliveryRowActions
                          deliveryId={delivery.id}
                          provider={delivery.provider}
                          trackingNumber={delivery.trackingNumber}
                          orderId={order?.id ?? null}
                        />
                      </PremiumTable.Cell>
                    </PremiumTable.Row>
                  );
                })}
              </PremiumTable.Body>
            </PremiumTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
