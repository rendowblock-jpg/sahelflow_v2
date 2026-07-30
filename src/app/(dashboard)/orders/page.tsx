import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  Package,
  ShieldAlert,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";

import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { EmptyState } from "@/components/shared/empty-state";
import { OrderFormDialog } from "@/components/orders/order-form-dialog";
import { OrdersDataTable } from "@/components/orders/orders-data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { batchAssessOrders } from "@/lib/risk-engine";
import { formatDZD } from "@/lib/utils";
import { orderStatusSchema } from "@/lib/validation";
import type { OrderStatus } from "@/types/domain";
import { computeActiveOrderCount } from "./active-orders";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.orders") };
}

const STATUS_FILTERS: Array<{
  value: "all" | OrderStatus;
  labelKey: string;
}> = [
  { value: "all", labelKey: "common.all" },
  { value: "pending", labelKey: "orders.status.pending" },
  { value: "confirmed", labelKey: "orders.status.confirmed" },
  { value: "shipped", labelKey: "orders.status.shipped" },
  { value: "delivered", labelKey: "orders.status.delivered" },
  { value: "returned", labelKey: "orders.status.returned" },
  { value: "cancelled", labelKey: "orders.status.cancelled" },
];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; risk?: string }>;
}) {
  const { t, locale } = await getI18n();
  const { status: statusFilterRaw, risk: riskFilter } = await searchParams;

  const statusFilter =
    statusFilterRaw && statusFilterRaw !== "all"
      ? orderStatusSchema.safeParse(statusFilterRaw).success
        ? (statusFilterRaw as OrderStatus)
        : undefined
      : undefined;
  const isHighRiskFilter = riskFilter === "high";
  const where = statusFilter ? { status: statusFilter } : undefined;

  const orderSelect = {
    id: true,
    orderNumber: true,
    status: true,
    totalPrice: true,
    deliveryCost: true,
    wilaya: true,
    commune: true,
    source: true,
    createdAt: true,
    deliveredAt: true,
    items: {
      select: {
        id: true,
        productName: true,
        quantity: true,
        unitPrice: true,
        total: true,
      },
    },
    customer: {
      select: {
        id: true,
        name: true,
        phone: true,
        phoneEnc: true,
      },
    },
    phone: true,
  } as const;

  const hasFilter = Boolean(statusFilter);
  const [
    allOrders,
    filteredOrders,
    customers,
    products,
    statusGroups,
    totalCount,
  ] = await Promise.all([
    db.order.findMany({
      where: { deletedAt: null },
      select: orderSelect,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    hasFilter
      ? db.order.findMany({
          where: { ...where, deletedAt: null },
          select: orderSelect,
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : Promise.resolve([]),
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
    db.order.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    db.order.count({ where: { deletedAt: null } }),
  ]);

  const riskMap = await batchAssessOrders(
    { prisma: db, shop: shopContext },
    allOrders.map((order) => order.id),
  );
  const highRiskCount = Array.from(riskMap.values()).filter(
    (assessment) =>
      assessment.level === "high" || assessment.level === "critical",
  ).length;

  const baseOrders = hasFilter ? filteredOrders : allOrders;
  const displayOrders = isHighRiskFilter
    ? baseOrders.filter((order) => {
        const assessment = riskMap.get(order.id);
        return (
          assessment &&
          (assessment.level === "high" || assessment.level === "critical")
        );
      })
    : baseOrders;

  const trustedManualRows =
    displayOrders.length > 0
      ? await db.orderChange.findMany({
          where: {
            orderId: { in: displayOrders.map((order) => order.id) },
            actionType: "created",
            payload: { contains: "trusted-manual-v1" },
          },
          select: { orderId: true },
        })
      : [];
  const canonicalOrderIds = new Set(
    trustedManualRows.map((entry) => entry.orderId),
  );
  const tableOrders = displayOrders.map((order) => ({
    ...order,
    mutationAuthority: canonicalOrderIds.has(order.id)
      ? ("canonical_v1" as const)
      : ("legacy_compatibility" as const),
  }));

  const riskData: Record<string, { level: string; score: number }> = {};
  for (const [orderId, assessment] of riskMap) {
    riskData[orderId] = {
      level: assessment.level,
      score: assessment.score,
    };
  }

  const counts: Record<string, number> = { all: totalCount };
  for (const group of statusGroups) {
    counts[group.status] = group._count._all;
  }

  const activeOrders = computeActiveOrderCount(statusGroups);
  const deliveredToday = allOrders.filter(
    (order) =>
      order.status === "delivered" &&
      order.deliveredAt &&
      new Date(order.deliveredAt).toDateString() === new Date().toDateString(),
  );
  const todayRevenue = deliveredToday.reduce(
    (sum, order) => sum + order.totalPrice,
    0,
  );
  const pendingCount = counts.pending ?? 0;

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.orders")}
        description={t("orders.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <ImportExportButtons
              exportRoute="/api/export/orders"
              importRoute="/api/import/orders"
            />
            <OrderFormDialog customers={customers} products={products} />
          </div>
        }
      />

      <div className="card-grid-4 stagger-grid">
        <StatCard
          label={t("orders.activeOrders")}
          value={activeOrders}
          icon={<ShoppingBag />}
          accentBg="bg-teal-500/10 dark:bg-teal-500/15"
          accentIcon="text-teal-600 dark:text-teal-400"
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("orders.pendingLabel")}
          value={pendingCount}
          icon={<Clock />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-warning"
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("orders.deliveredToday")}
          value={deliveredToday.length}
          icon={<CheckCircle2 />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-success"
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("orders.todayRevenue")}
          value={formatDZD(todayRevenue)}
          icon={<TrendingUp />}
          accentBg="bg-violet-500/10 dark:bg-violet-500/15"
          accentIcon="text-violet-600 dark:text-violet-400"
          style={{ animationDelay: "240ms" }}
        />
      </div>

      <Tabs
        defaultValue={
          isHighRiskFilter ? "high-risk" : (statusFilter ?? "all")
        }
      >
        <TabsList className="flex-wrap h-auto">
          {STATUS_FILTERS.map((filter) => (
            <TabsTrigger key={filter.value} value={filter.value} asChild>
              <Link
                href={
                  filter.value === "all"
                    ? "/orders"
                    : `/orders?status=${filter.value}`
                }
                className="flex items-center gap-1.5"
              >
                {t(filter.labelKey)}
                {counts[filter.value] !== undefined && (
                  <Badge
                    variant="secondary"
                    className="me-1 text-xs px-1.5 py-0"
                  >
                    {counts[filter.value]}
                  </Badge>
                )}
              </Link>
            </TabsTrigger>
          ))}
          <TabsTrigger value="high-risk" asChild>
            <Link href="/orders?risk=high" className="flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" />
              {t("risk.level.high")}/{t("risk.level.critical")}
              {highRiskCount > 0 && (
                <Badge
                  variant="destructive"
                  className="me-1 text-xs px-1.5 py-0"
                >
                  {highRiskCount}
                </Badge>
              )}
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardContent className="p-0">
          {displayOrders.length === 0 ? (
            <EmptyState
              icon={isHighRiskFilter ? ShieldAlert : Package}
              title={
                isHighRiskFilter
                  ? t("orders.empty.highRiskTitle")
                  : t("orders.empty.title")
              }
              description={
                isHighRiskFilter
                  ? t("orders.empty.highRiskDesc")
                  : t("orders.empty.description")
              }
              actionLabel={t("orders.createOrder")}
              actionHref="/orders"
            />
          ) : (
            <div className="space-y-3 p-4">
              <OrdersDataTable
                fallback={{
                  orders: isHighRiskFilter
                    ? tableOrders
                    : tableOrders.slice(0, 25),
                  total: displayOrders.length,
                  hasNextPage:
                    isHighRiskFilter ? false : displayOrders.length > 25,
                  page: 1,
                  pageSize: isHighRiskFilter ? displayOrders.length : 25,
                }}
                locale={locale}
                statusFilter={
                  isHighRiskFilter
                    ? "all"
                    : ((statusFilter as OrderStatus | "all") ?? "all")
                }
                riskData={riskData}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
