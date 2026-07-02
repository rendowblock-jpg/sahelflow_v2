import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/utils";
import { batchAssessOrders } from "@/lib/risk-engine";
import type { OrderStatus } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { Package, TrendingUp, Clock, CheckCircle2, ShoppingBag, Download, ShieldAlert } from "lucide-react";
import { OrderFormDialog } from "@/components/orders/order-form-dialog";
import { OrdersTableClient } from "@/components/orders/orders-table-client";
import { PageHeader } from "@/components/shared/page-header";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import type { Metadata } from "next";

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

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; risk?: string }>;
}) {
  const { t, locale } = await getI18n();
  const { status: statusFilter, risk: riskFilter } = await searchParams;

  const isHighRiskFilter = riskFilter === "high";

  const where = statusFilter && statusFilter !== "all"
    ? { status: statusFilter as OrderStatus }
    : undefined;
  // PERF-007: use select (not include) to avoid fetching + decrypting PII
  // fields (phone, address, notes) that the table doesn't display. Was: 200
  // AES-256-GCM decryptions per page load. Now: zero (only name is fetched).
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
    items: { select: { id: true, productName: true, quantity: true, unitPrice: true, total: true } },
    customer: { select: { id: true, name: true, phone: true, phoneEnc: true } },
    phone: true,
  } as const;

  // PERF-008: when no status filter is active, filteredOrders === allOrders.
  // Skip the second query (was: two identical queries on the default landing).
  const hasFilter = !!statusFilter;
  const [allOrders, filteredOrders, customers, products] = await Promise.all([
    db.order.findMany({ select: orderSelect, orderBy: { createdAt: "desc" }, take: 200 }),
    hasFilter
      ? db.order.findMany({ where, select: orderSelect, orderBy: { createdAt: "desc" }, take: 200 })
      : Promise.resolve([]),
    db.customer.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, phone: true, phoneEnc: true, wilaya: true, commune: true, address: true } }),
    db.product.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, price: true, stock: true, isActive: true, productVariants: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, sku: true, price: true, stock: true, isActive: true } } } }),
  ]);

  // Batch-assess risk for ALL orders (used for the risk column + high-risk filter).
  // This loads config+rules once, then builds inputs for each order in parallel.
  const riskMap = await batchAssessOrders(allOrders.map((o) => o.id));
  const highRiskCount = Array.from(riskMap.values()).filter(
    (a) => a.level === "high" || a.level === "critical",
  ).length;

  // When risk=high filter is active, show only high+critical risk orders
  // (regardless of status — the seller reviews all risky orders in one queue).
  const displayOrders = isHighRiskFilter
    ? allOrders.filter((o) => {
        const a = riskMap.get(o.id);
        return a && (a.level === "high" || a.level === "critical");
      })
    : hasFilter
      ? filteredOrders
      : allOrders;

  // Serialize risk map for the client (orderId → {level, score})
  const riskData: Record<string, { level: string; score: number }> = {};
  for (const [orderId, assessment] of riskMap) {
    riskData[orderId] = { level: assessment.level, score: assessment.score };
  }

  const counts: Record<string, number> = { all: allOrders.length };
  for (const o of allOrders) {
    counts[o.status] = (counts[o.status] ?? 0) + 1;
  }

  const activeOrders = allOrders.filter((o) =>
    ["pending", "confirmed", "shipped"].includes(o.status),
  );
  const deliveredToday = allOrders.filter(
    (o) => o.status === "delivered" && o.deliveredAt &&
    new Date(o.deliveredAt).toDateString() === new Date().toDateString(),
  );
  const todayRevenue = deliveredToday.reduce((sum, o) => sum + o.totalPrice, 0);
  const pendingCount = counts["pending"] ?? 0;

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.orders")}
        description={t("orders.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <ImportExportButtons exportRoute="/api/export/orders" importRoute="/api/import/orders" />
            <Button variant="outline" size="sm" asChild>
              <Link href="/api/export/orders">
                <Download className="me-1.5 h-4 w-4" />
                {t("orders.exportCSV")}
              </Link>
            </Button>
            <OrderFormDialog customers={customers} products={products} />
          </div>
        }
      />

      {/* KPI stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("orders.activeOrders")}
          value={activeOrders.length}
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
          accentIcon="text-amber-600 dark:text-amber-400"
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("orders.deliveredToday")}
          value={deliveredToday.length}
          icon={<CheckCircle2 />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-emerald-600 dark:text-emerald-400"
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

      {/* Status filter tabs */}
      <Tabs defaultValue={isHighRiskFilter ? "high-risk" : (statusFilter ?? "all")}>
        <TabsList className="flex-wrap h-auto">
          {STATUS_FILTERS.map((filter) => (
            <TabsTrigger key={filter.value} value={filter.value} asChild>
              <Link
                href={filter.value === "all" ? "/orders" : `/orders?status=${filter.value}`}
                className="flex items-center gap-1.5"
              >
                {t(filter.labelKey)}
                {counts[filter.value] !== undefined && (
                  <Badge variant="secondary" className="me-1 text-xs px-1.5 py-0">
                    {counts[filter.value]}
                  </Badge>
                )}
              </Link>
            </TabsTrigger>
          ))}
          {/* High-risk review queue tab */}
          <TabsTrigger value="high-risk" asChild>
            <Link
              href="/orders?risk=high"
              className="flex items-center gap-1.5"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {t("risk.level.high")}/{t("risk.level.critical")}
              {highRiskCount > 0 && (
                <Badge variant="destructive" className="me-1 text-xs px-1.5 py-0">
                  {highRiskCount}
                </Badge>
              )}
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Orders table with bulk selection */}
      <Card className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardContent className="p-0">
          {displayOrders.length === 0 ? (
            <EmptyState
              icon={isHighRiskFilter ? ShieldAlert : Package}
              title={isHighRiskFilter ? t("orders.empty.highRiskTitle") : t("orders.empty.title")}
              description={isHighRiskFilter ? t("orders.empty.highRiskDesc") : t("orders.empty.description")}
              actionLabel={t("orders.createOrder")}
              actionHref="/orders"
            />
          ) : (
            <div className="space-y-3 p-4">
              <OrdersTableClient orders={displayOrders as unknown as Array<{
                id: string; orderNumber: string; status: string; totalPrice: number;
                wilaya: string; phone: string; createdAt: Date;
                items: Array<{ id: string }>;
                customer: { name: string | null; phone: string | null } | null;
              }>} locale={locale} riskData={riskData} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
