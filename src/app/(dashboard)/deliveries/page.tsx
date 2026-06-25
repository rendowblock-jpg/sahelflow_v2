import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";

import { formatDZD, formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { DeliveryRowActions } from "@/components/deliveries/delivery-row-actions";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
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

/** i18n-driven delivery status styles */
const DELIVERY_STATUS_STYLES: Record<string, { i18nKey: string; dot: string; bg: string; text: string; border: string }> = {
  pending: { i18nKey: "deliveries.status.pending", dot: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800/50" },
  created: { i18nKey: "deliveries.status.created", dot: "bg-sky-500", bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-400", border: "border-sky-200 dark:border-sky-800/50" },
  picked_up: { i18nKey: "deliveries.status.pickedUp", dot: "bg-sky-500", bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-400", border: "border-sky-200 dark:border-sky-800/50" },
  in_transit: { i18nKey: "deliveries.status.inTransit", dot: "bg-violet-500", bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-400", border: "border-violet-200 dark:border-violet-800/50" },
  at_hub: { i18nKey: "deliveries.status.atHub", dot: "bg-violet-500", bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-400", border: "border-violet-200 dark:border-violet-800/50" },
  out_for_delivery: { i18nKey: "deliveries.status.outForDelivery", dot: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-400", border: "border-blue-200 dark:border-blue-800/50" },
  delivered: { i18nKey: "deliveries.status.delivered", dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800/50" },
  returned: { i18nKey: "deliveries.status.returned", dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800/50" },
  refused: { i18nKey: "deliveries.status.refused", dot: "bg-rose-500", bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-400", border: "border-rose-200 dark:border-rose-800/50" },
  failed: { i18nKey: "deliveries.status.failed", dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800/50" },
};

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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr className="text-start text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3">{t("deliveries.table.tracking")}</th>
                    <th className="px-4 py-3">{t("deliveries.table.order")}</th>
                    <th className="px-4 py-3">{t("deliveries.table.customer")}</th>
                    <th className="px-4 py-3 hidden sm:table-cell">{t("deliveries.table.carrier")}</th>
                    <th className="px-4 py-3 text-end hidden md:table-cell">{t("deliveries.table.cost")}</th>
                    <th className="px-4 py-3">{t("deliveries.table.status")}</th>
                    <th className="px-4 py-3 hidden lg:table-cell">{t("deliveries.table.date")}</th>
                    <th className="px-4 py-3 text-end">{t("deliveries.table.action")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredDeliveries.map((delivery) => {
                    const order = delivery.order;
                    const customer = order?.customer;
                    const statusStyle = DELIVERY_STATUS_STYLES[delivery.status];
                    const providerConfig = deliveryProviderConfig[delivery.provider];
                    const BrandIcon = getBrandIcon(delivery.provider);
                    return (
                      <tr key={delivery.id} className="hover:bg-accent/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">
                          {delivery.trackingNumber ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {order ? (
                            <Link
                              href={`/orders/${order.id}`}
                              className="font-mono text-sm font-medium text-primary hover:underline"
                            >
                              {order.orderNumber}
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium">{customer?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{order?.wilaya ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
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
                        </td>
                        <td className="px-4 py-3 text-end hidden md:table-cell text-sm tabular-nums">
                          {delivery.cost ? formatDZD(delivery.cost) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {statusStyle ? (
                            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                              <span className={`size-1.5 rounded-full ${statusStyle.dot}`} />
                              {t(statusStyle.i18nKey)}
                            </span>
                          ) : (
                            <Badge variant="outline">{delivery.status}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">
                          {formatDate(delivery.createdAt, locale)}
                        </td>
                        <td className="px-4 py-3 text-end">
                          <DeliveryRowActions
                            deliveryId={delivery.id}
                            provider={delivery.provider}
                            trackingNumber={delivery.trackingNumber}
                            orderId={order?.id ?? null}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
