import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, Banknote, PackageCheck, Truck } from "lucide-react";

import { DeliveriesDataTable } from "@/components/deliveries/deliveries-data-table";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/lib/db";
import {
  getDeliveryWorkbenchPage,
  resolveDeliveryWorkbenchAccess,
} from "@/lib/deliveries/delivery-workbench";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { formatDZD } from "@/lib/utils";

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
const FILTERS = new Set(Object.keys(FILTER_I18N));
const ACTIVE_STATUSES = ["pending", "created", "picked_up", "in_transit", "at_hub", "out_for_delivery"];
const RETURN_STATUSES = ["returned", "refused", "failed"];

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const actorContext = await requireTrustedAction("deliveries.read");
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const status = params.status && FILTERS.has(params.status) ? params.status : "all";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const access = resolveDeliveryWorkbenchAccess(actorContext);

  const [fallback, statusCounts, costAggregate] = await Promise.all([
    getDeliveryWorkbenchPage(actorContext, { page, pageSize: 25, status }),
    db.delivery.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    access.financials
      ? db.delivery.aggregate({
          where: { deletedAt: null },
          _sum: { cost: true },
        })
      : Promise.resolve(null),
  ]);
  const lastPage = Math.max(1, Math.ceil(fallback.total / fallback.pageSize));
  if (page > lastPage) {
    const query = new URLSearchParams();
    if (status !== "all") query.set("status", status);
    query.set("page", String(lastPage));
    redirect(`/deliveries?${query.toString()}`);
  }

  const counts: Record<string, number> = {};
  let allCount = 0;
  for (const group of statusCounts) {
    counts[group.status] = group._count._all;
    allCount += group._count._all;
  }
  counts.all = allCount;
  counts.pending = (counts.pending ?? 0) + (counts.created ?? 0);
  const activeCount = ACTIVE_STATUSES.reduce(
    (sum, current) => sum + (counts[current] ?? 0),
    0,
  );
  const deliveredCount = counts.delivered ?? 0;
  const returnedCount = RETURN_STATUSES.reduce(
    (sum, current) => sum + (counts[current] ?? 0),
    0,
  );
  const totalCost = access.financials ? (costAggregate?._sum.cost ?? 0) : null;
  const filters = Object.entries(FILTER_I18N).map(([value, key]) => ({
    value,
    label: t(key),
  }));

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.delivery")}
        description={t("deliveries.subtitle")}
        actions={
          access.export ? (
            <ImportExportButtons exportRoute="/api/export/deliveries" />
          ) : undefined
        }
      />

      <div className="card-grid-4">
        <StatCard label={t("deliveries.activeDeliveries")} value={activeCount} icon={<Truck />} />
        <StatCard label={t("deliveries.delivered")} value={deliveredCount} icon={<PackageCheck />} />
        <StatCard label={t("deliveries.returnsFailed")} value={returnedCount} icon={<AlertCircle />} />
        <StatCard
          label={t("deliveries.totalCost")}
          value={totalCost === null ? "—" : formatDZD(totalCost, locale)}
          icon={<Banknote />}
        />
      </div>

      <Tabs defaultValue={status}>
        <TabsList className="h-auto flex-wrap">
          {filters.map((filter) => (
            <TabsTrigger key={filter.value} value={filter.value} asChild>
              <Link
                href={filter.value === "all" ? "/deliveries" : `/deliveries?status=${filter.value}`}
                className="flex items-center gap-1.5"
              >
                {filter.label}
                {counts[filter.value] !== undefined ? (
                  <Badge variant="secondary" className="ms-1 px-1.5 py-0 text-xs">
                    {counts[filter.value]}
                  </Badge>
                ) : null}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DeliveriesDataTable
        fallback={{
          ...fallback,
          deliveries: fallback.deliveries.map((delivery) => ({
            ...delivery,
            estimatedDelivery:
              delivery.estimatedDelivery instanceof Date
                ? delivery.estimatedDelivery.toISOString()
                : delivery.estimatedDelivery,
            createdAt:
              delivery.createdAt instanceof Date
                ? delivery.createdAt.toISOString()
                : delivery.createdAt,
          })),
        }}
        status={status}
        locale={locale}
      />
    </div>
  );
}
