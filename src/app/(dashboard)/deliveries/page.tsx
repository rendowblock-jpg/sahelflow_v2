import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";

import { formatDZD } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { StatCard } from "@/components/shared/stat-card";
import { DeliveriesDataTable } from "@/components/deliveries/deliveries-data-table";
import Link from "next/link";
import {
  Truck,
  PackageCheck,
  AlertCircle,
  Banknote,
} from "lucide-react";
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

const FILTER_I18N: Record<string, string> = {
  all: "deliveries.filter.all",
  pending: "deliveries.filter.pending",
  in_transit: "deliveries.filter.inTransit",
  delivered: "deliveries.filter.delivered",
  returned: "deliveries.filter.returned",
};

const PENDING_STATUSES = ["pending", "created"] as const;
const ACTIVE_STATUSES = ["pending", "created", "picked_up", "in_transit", "at_hub", "out_for_delivery"];
const RETURN_STATUSES = ["returned", "refused", "failed"];

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actorContext = await requireTrustedAction("deliveries.read");
  assertTrustedAction(actorContext, "customers.contact.read");
  assertTrustedAction(actorContext, "orders.financials.read");
  const { t, locale } = await getI18n();
  const { status: statusFilter } = await searchParams;
  const status = statusFilter ?? "all";

  const PAGE_SIZE = 25;
  const where =
    status === "pending"
      ? { status: { in: [...PENDING_STATUSES] }, deletedAt: null }
      : status !== "all"
        ? { status, deletedAt: null }
        : { deletedAt: null };
  const offset = 0;

  const [deliveries, total, statusCounts, costAggregate] = await Promise.all([
    db.delivery.findMany({
      where,
      include: { order: { include: { customer: { select: { name: true, phone: true } } } } },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: offset,
    }),
    db.delivery.count({ where }),
    db.delivery.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: true,
    }),
    db.delivery.aggregate({
      where: { deletedAt: null },
      _sum: { cost: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  let allCount = 0;
  for (const group of statusCounts) {
    counts[group.status] = group._count;
    allCount += group._count;
  }
  counts.all = allCount;

  const activeCount = ACTIVE_STATUSES.reduce(
    (sum, activeStatus) => sum + (counts[activeStatus] ?? 0),
    0,
  );
  const deliveredCount = counts.delivered ?? 0;
  const returnedCount = RETURN_STATUSES.reduce(
    (sum, returnStatus) => sum + (counts[returnStatus] ?? 0),
    0,
  );
  const totalCost = costAggregate._sum.cost ?? 0;
  // Seller-facing pending is one operational bucket: provider `pending` plus
  // freshly `created` rows that have not yet advanced to pickup/transit.
  counts.pending = (counts.pending ?? 0) + (counts.created ?? 0);

  const STATUS_FILTERS = Object.entries(FILTER_I18N).map(([value, key]) => ({
    value,
    label: t(key),
  }));

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.delivery")}
        description={t("deliveries.subtitle")}
        actions={<ImportExportButtons exportRoute="/api/export/deliveries" />}
      />

      <div className="card-grid-4 stagger-grid">
        <StatCard
          label={t("deliveries.activeDeliveries")}
          value={activeCount}
          icon={<Truck />}
          accentBg="bg-teal-500/10 dark:bg-teal-500/15"
          accentIcon="text-teal-600 dark:text-teal-400"
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("deliveries.delivered")}
          value={deliveredCount}
          icon={<PackageCheck />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-success"
          subtitle={t("dashboard.deliveryRate")}
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("deliveries.returnsFailed")}
          value={returnedCount}
          icon={<AlertCircle />}
          accentBg="bg-red-500/10 dark:bg-red-500/15"
          accentIcon="text-destructive"
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

      <Tabs defaultValue={status}>
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

      <div className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <DeliveriesDataTable
          fallback={{
            deliveries: deliveries.map((delivery) => ({
              id: delivery.id,
              orderId: delivery.orderId,
              provider: delivery.provider,
              trackingNumber: delivery.trackingNumber,
              cost: delivery.cost,
              status: delivery.status,
              estimatedDelivery: delivery.estimatedDelivery?.toISOString() ?? null,
              createdAt: delivery.createdAt.toISOString(),
              order: delivery.order
                ? {
                    id: delivery.order.id,
                    orderNumber: delivery.order.orderNumber,
                    wilaya: delivery.order.wilaya,
                    customer: delivery.order.customer
                      ? {
                          name: delivery.order.customer.name,
                          phone: delivery.order.customer.phone,
                        }
                      : null,
                  }
                : null,
            })),
            total,
            hasNextPage: total > PAGE_SIZE,
            page: 1,
            pageSize: PAGE_SIZE,
          }}
          status={status}
          locale={locale}
        />
      </div>
    </div>
  );
}
