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
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import {
  getOrdersWorkbenchPage,
  getOrdersWorkbenchStatusCounts,
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

/**
 * R2-c: server-passed seed rows for the create-order comboboxes. The
 * searchable pickers query /api/customers/search and /api/products for
 * the rest of the catalog, so the page no longer serializes the entire
 * customer base and active catalog into the dialog trigger button.
 */
const ORDER_FORM_INITIAL_SLICE = 50;

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

/**
 * Status tabs are real links so the scope stays shareable: switching a tab
 * keeps the active search/wilaya/date/sort context and restarts at page 1.
 */
function buildOrdersHref(
  status: "all" | OrderStatus,
  scope: {
    statusFilter?: OrderStatus;
    q?: string;
    wilayaCode?: number;
    dateFrom?: string;
    dateTo?: string;
    sortRaw?: string;
  },
): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (scope.q) params.set("q", scope.q);
  if (scope.wilayaCode) params.set("wilaya", String(scope.wilayaCode));
  if (scope.dateFrom) params.set("from", scope.dateFrom);
  if (scope.dateTo) params.set("to", scope.dateTo);
  if (scope.sortRaw) params.set("sort", scope.sortRaw);
  const query = params.toString();
  return query ? `/orders?${query}` : "/orders";
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    risk?: string;
    page?: string;
    sort?: string;
    q?: string;
    wilaya?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const actorContext = await requireTrustedAction("orders.read");
  const { t, locale } = await getI18n();
  const {
    status: statusFilterRaw,
    risk: riskFilter,
    page: pageRaw,
    sort: sortRaw,
    q: qRaw,
    wilaya: wilayaRaw,
    from: fromRaw,
    to: toRaw,
  } = await searchParams;

  if (riskFilter === "high") redirect("/risk");

  const statusFilter =
    statusFilterRaw && statusFilterRaw !== "all"
      ? orderStatusSchema.safeParse(statusFilterRaw).success
        ? (statusFilterRaw as OrderStatus)
        : undefined
      : undefined;
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);

  // URL-driven scope (q / wilaya / date range) shared by the SSR fallback, the
  // filtered status-tab counts and the filtered export.
  const q = qRaw?.trim() || undefined;
  const wilayaCodeRaw = Number.parseInt(wilayaRaw ?? "", 10);
  const wilayaCode =
    Number.isSafeInteger(wilayaCodeRaw) && wilayaCodeRaw > 0
      ? wilayaCodeRaw
      : undefined;
  const dateFrom = fromRaw?.trim() || undefined;
  const dateTo = toRaw?.trim() || undefined;
  const hasListFilters = Boolean(q || wilayaCode || dateFrom || dateTo);
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
    filteredStatusCounts,
    deliveredTodayCount,
    deliveredRevenue,
    creationData,
  ] = await Promise.all([
    getOrdersWorkbenchPage(actorContext, {
      status: statusFilter,
      q,
      wilayaCode,
      dateFrom,
      dateTo,
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
    hasListFilters
      ? getOrdersWorkbenchStatusCounts(actorContext, {
          q,
          wilayaCode,
          dateFrom,
          dateTo,
        })
      : Promise.resolve(null),
    db.order.count({ where: deliveredWhere }),
    fieldAccess.financials
      ? db.order.aggregate({
          where: deliveredWhere,
          _sum: { totalPrice: true },
        })
      : Promise.resolve(null),
    canCreateOrder
      ? Promise.all([
          // R2-c: the create dialog renders a capped most-recent seed slice
          // only - its comboboxes search the live catalog on demand instead
          // of the page shipping every customer/product into the DOM.
          db.customer.findMany({
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: ORDER_FORM_INITIAL_SLICE,
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
            orderBy: { createdAt: "desc" },
            take: ORDER_FORM_INITIAL_SLICE,
            select: {
              id: true,
              name: true,
              sku: true,
              price: true,
              stock: true,
              lowStockThreshold: true,
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
    if (q) params.set("q", q);
    if (wilayaCode) params.set("wilaya", String(wilayaCode));
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    params.set("sort", fallback.sort);
    params.set("page", String(lastPage));
    redirect(`/orders?${params.toString()}`);
  }

  // Global counts keep the confirmation-queue badge and KPI cards shop-wide;
  // the status tab badges switch to the filtered truth while a scope is active.
  const counts: Record<string, number> = { all: totalCount };
  for (const group of statusGroups) counts[group.status] = group._count._all;
  const tabCounts = filteredStatusCounts?.counts ?? counts;

  const activeOrders = computeActiveOrderCount(statusGroups);
  const pendingCount = counts.pending ?? 0;
  const todayRevenue = fieldAccess.financials
    ? (deliveredRevenue?._sum.totalPrice ?? 0)
    : null;
  const customers = creationData?.[0] ?? [];
  const products = creationData?.[1] ?? [];
  const statusTabHref = (status: "all" | OrderStatus) =>
    buildOrdersHref(status, { q, wilayaCode, dateFrom, dateTo, sortRaw });

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.orders")}
        description={t("orders.subtitle")}
        actions={
          pendingCount > 0 || canExport || canImport || canCreateOrder ? (
            <div className="flex flex-wrap items-center gap-2">
              {pendingCount > 0 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/orders/confirmation-queue">
                    <CheckCircle2 className="me-1.5 size-4" aria-hidden="true" />
                    {t("confirmationQueue.title")}
                    <Badge variant="secondary" className="ms-1 px-1.5 py-0 text-xs">
                      {pendingCount}
                    </Badge>
                  </Link>
                </Button>
              ) : null}
              {canExport || canImport ? (
                <ImportExportButtons
                  exportRoute={canExport ? "/api/export/orders" : undefined}
                  importRoute={canImport ? "/api/import/orders" : undefined}
                  filterParams={["q", "wilaya", "from", "to", "status", "sort"]}
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
        <StatCard
          label={t("orders.activeOrders")}
          value={activeOrders}
          icon={<ShoppingBag />}
        />
        <StatCard
          label={t("orders.pendingLabel")}
          value={pendingCount}
          icon={<Clock />}
        />
        <StatCard
          label={t("orders.deliveredToday")}
          value={deliveredTodayCount}
          icon={<CheckCircle2 />}
        />
        <StatCard
          label={t("orders.todayRevenue")}
          value={todayRevenue === null ? "—" : formatDZD(todayRevenue, locale)}
          icon={<TrendingUp />}
        />
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <Tabs defaultValue={statusFilter ?? "all"} className="w-full min-w-0">
          <TabsList className="h-auto w-full min-w-0 flex-wrap justify-start">
            {STATUS_FILTERS.map((filter) => (
              <TabsTrigger key={filter.value} value={filter.value} asChild>
                <Link
                  href={statusTabHref(filter.value)}
                  className="flex max-w-full !flex-none items-center gap-1.5"
                >
                  {t(filter.labelKey)}
                  {tabCounts[filter.value] !== undefined ? (
                    <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                      {tabCounts[filter.value]}
                    </Badge>
                  ) : null}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {fallback.fieldAccess.risk ? (
          <Link
            href="/risk"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ShieldAlert className="size-4" aria-hidden="true" />
            {t("nav.risk")}
          </Link>
        ) : null}
      </div>

      <OrdersDataTable
        fallback={fallback}
        locale={locale}
        statusFilter={statusFilter ?? "all"}
        canCreateOrder={canCreateOrder}
        customers={canCreateOrder ? customers : undefined}
        products={canCreateOrder ? products : undefined}
      />
    </div>
  );
}
