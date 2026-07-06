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

const ACTIVE_STATUSES = ["pending", "created", "picked_up", "in_transit", "at_hub", "out_for_delivery"];
const RETURN_STATUSES = ["returned", "refused", "failed"];

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { t, locale } = await getI18n();
  const { status: statusFilter } = await searchParams;
  const status = statusFilter ?? "all";

  const PAGE_SIZE = 25;
  const where = status !== "all" ? { status, deletedAt: null } : { deletedAt: null };
  const offset = 0;

  // Page-1 fallback + total (for the active filter) + stat-card aggregates
  // (across ALL deliveries, not just page 1) + per-status counts for the tabs.
  const [deliveries, total, allDeliveries, statusCounts] = await Promise.all([
    db.delivery.findMany({
      where,
      include: { order: { include: { customer: { select: { name: true, phone: true } } } } },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: offset,
    }),
    db.delivery.count({ where }),
    db.delivery.findMany({
      where: { deletedAt: null },
      select: { status: true, cost: true },
    }),
    db.delivery.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: true,
    }),
  ]);

  // Tab counts: "all" = total; each status = its count
  const counts: Record<string, number> = { all: allDeliveries.length };
  for (const g of statusCounts) {
    counts[g.status] = g._count;
  }

  const activeCount = allDeliveries.filter((d) => ACTIVE_STATUSES.includes(d.status)).length;
  const deliveredCount = allDeliveries.filter((d) => d.status === "delivered").length;
  const returnedCount = allDeliveries.filter((d) => RETURN_STATUSES.includes(d.status)).length;
  const totalCost = allDeliveries.reduce((sum, d) => sum + (d.cost ?? 0), 0);

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

      {/* Stat cards */}
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

      {/* Status filter */}
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

      {/* Deliveries table (DataTable v2) */}
      <div className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <DeliveriesDataTable
            fallback={{
              deliveries: deliveries.map((d) => ({
                id: d.id,
                orderId: d.orderId,
                provider: d.provider,
                trackingNumber: d.trackingNumber,
                cost: d.cost,
                status: d.status,
                estimatedDelivery: d.estimatedDelivery?.toISOString() ?? null,
                createdAt: d.createdAt.toISOString(),
                order: d.order
                  ? {
                      id: d.order.id,
                      orderNumber: d.order.orderNumber,
                      wilaya: d.order.wilaya,
                      customer: d.order.customer
                        ? { name: d.order.customer.name, phone: d.order.customer.phone }
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
