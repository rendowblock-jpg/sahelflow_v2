import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  ShieldAlert,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";

import { OrderFormDialog } from "@/components/orders/order-form-dialog";
import { OrdersDataTable } from "@/components/orders/orders-data-table";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import {
  getOrdersWorkbenchPage,
  resolveOrdersWorkbenchAccess,
} from "@/lib/orders/order-list-workbench";
import { formatDZD } from "@/lib/utils";
import { orderStatusSchema } from "@/lib/validation";
import type { OrderStatus } from "@/types/domain";
import { computeActiveOrderCount } from "./active-orders";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.orders") };
}

const STATUS_FILTERS: Array<{ value: "all" | OrderStatus; labelKey: string }> = [
  { value: "all", labelKey: "common.all" },
  { value: "pending", labelKey: "orders.status.pending" },
  { value: "confirmed", labelKey: "orders.status.confirmed" },
  { value: "shipped", labelKey: "orders.status.shipped" },
  { value: "delivered", labelKey: "orders.status.delivered" },
  { value: "returned", labelKey: "orders.status.returned" },
  { value: "cancelled", labelKey: "orders.status.cancelled" },
];

function localDayBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    risk?: string;
    page?: string;
    sort?: string;
  }>;
}) {
  const actorContext = await requireTrustedAction("orders.read");
  const { t, locale } = await getI18n();
  const {
    status: statusFilterRaw,
    risk: riskFilterRaw,
    page: pageRaw,
    sort: sortRaw,
  } = await searchParams;

  const riskFilter = riskFilterRaw === "high" ? "high" as const : undefined;
  const statusFilter =
    statusFilterRaw && statusFilterRaw !== "all"
      ? orderStatusSchema.safeParse(statusFilterRaw).success
        ? (statusFilterRaw as OrderStatus)
        : undefined
      : undefined;
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
  const resource = { shopId: actorContext.shop.shopId };
  const can = (action: Parameters<typeof trustedActionAllowed>[1]) =>
    trustedActionAllowed(actorContext, action, resource);

  const canCreateOrder =
    can("orders.create") &&
    can("customers.read") &&
    can("customers.contact.read") &&
    can("customers.contact.update") &&
    can("orders.financials.read") &&
    can("orders.financials.update") &&
    can("products.read");
  const canExport =
    can("data.export") &&
    can("customers.contact.read") &&
    can("orders.financials.read");
  const canImport =
    can("data.import") &&
    can("orders.create") &&
    can("customers.contact.read") &&
    can("customers.contact.update") &&
    can("orders.financials.read") &&
    can("orders.financials.update");

  const { start, end } = localDayBounds();
  const fieldAccess = resolveOrdersWorkbenchAccess(actorContext);
  const deliveredWhere = {
    deletedAt: null,
    status: "delivered" as const,
    deliveredAt: { gte: start, lt: end },
  };
  const [
    fallback,
    statusGroups,
    totalCount,
    deliveredTodayCount,
    deliveredRevenue,
    creationData,
  ] = await Promise.all([
    getOrdersWorkbenchPage(actorContext, {
      status: statusFilter,
      risk: riskFilter,
      page,
      pageSize: 25,
      sort: sortRaw,
    }),
    db.order.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    db.order.count({ where: { deletedAt: null } }),
    db.order.count({ where: deliveredWhere }),
    fieldAccess.financials
      ? db.order.aggregate({
          where: deliveredWhere,
          _sum: { totalPrice: true },
        })
      : Promise.resolve(null),
    canCreateOrder
      ? Promise.all([
          db.customer.findMany({
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              phone: true,
              phoneEnc: true,
              wilaya: true,
              commune: true,
              address: true,
            },
          }),
          db.product.findMany({
            where: { isActive: true, deletedAt: null },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              price: true,
              stock: true,
              isActive: true,
              productVariants: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  price: true,
                  stock: true,
                  isActive: true,
                },
              },
            },
          }),
        ])
      : Promise.resolve(null),
  ]);

  const lastPage = Math.max(1, Math.ceil(fallback.total / fallback.pageSize));
  if (page > lastPage) {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (riskFilter) params.set("risk", riskFilter);
    params.set("sort", fallback.sort);
    params.set("page", String(lastPage));
    redirect(`/orders?${params.toString()}`);
  }

  const counts: Record<string, number> = { all: totalCount };
  for (const group of statusGroups) counts[group.status] = group._count._all;

  const activeOrders = computeActiveOrderCount(statusGroups);
  const pendingCount = counts.pending ?? 0;
  const todayRevenue = fieldAccess.financials
    ? (deliveredRevenue?._sum.totalPrice ?? 0)
    : null;
  const customers = creationData?.[0] ?? [];
  const products = creationData?.[1] ?? [];

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.orders")}
        description={t("orders.subtitle")}
        actions={
          canExport || canImport || canCreateOrder ? (
            <div className="flex flex-wrap items-center gap-2">
              {canExport || canImport ? (
                <ImportExportButtons
                  exportRoute={canExport ? "/api/export/orders" : undefined}
                  importRoute={canImport ? "/api/import/orders" : undefined}
                />
              ) : null}
              {canCreateOrder ? (
                <OrderFormDialog customers={customers} products={products} />
              ) : null}
            </div>
          ) : null
        }
      />

      <div className="card-grid-4">
        <StatCard label={t("orders.activeOrders")} value={activeOrders} icon={<ShoppingBag />} />
        <StatCard label={t("orders.pendingLabel")} value={pendingCount} icon={<Clock />} />
        <StatCard label={t("orders.deliveredToday")} value={deliveredTodayCount} icon={<CheckCircle2 />} />
        <StatCard
          label={t("orders.todayRevenue")}
          value={todayRevenue === null ? "—" : formatDZD(todayRevenue, locale)}
          icon={<TrendingUp />}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs defaultValue={statusFilter ?? "all"}>
          <TabsList className="h-auto flex-wrap">
            {STATUS_FILTERS.map((filter) => (
              <TabsTrigger key={filter.value} value={filter.value} asChild>
                <Link
                  href={filter.value === "all" ? "/orders" : `/orders?status=${filter.value}`}
                  className="flex items-center gap-1.5"
                >
                  {t(filter.labelKey)}
                  {counts[filter.value] !== undefined ? (
                    <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                      {counts[filter.value]}
                    </Badge>
                  ) : null}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {fallback.fieldAccess.risk ? (
          <Link
            href={riskFilter ? "/orders" : "/orders?risk=high"}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${
              riskFilter ? "bg-muted text-foreground" : "text-muted-foreground"
            }`}
          >
            <ShieldAlert className="size-4" aria-hidden="true" />
            {t("risk.highRisk")}
            {riskFilter ? (
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {fallback.total}
              </Badge>
            ) : null}
          </Link>
        ) : null}
      </div>

      <OrdersDataTable
        fallback={fallback}
        locale={locale}
        statusFilter={statusFilter ?? "all"}
        riskFilter={riskFilter}
      />
    </div>
  );
}
