import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDZD } from "@/lib/utils";
import type { OrderStatus } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { Package, TrendingUp, Clock, CheckCircle2, ShoppingBag, Download } from "lucide-react";
import { OrderFormDialog } from "@/components/orders/order-form-dialog";
import { OrdersTableClient } from "@/components/orders/orders-table-client";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.orders") };
}
export const revalidate = 30;

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
  searchParams: Promise<{ status?: string }>;
}) {
  const { t, locale } = await getI18n();
  const { status: statusFilter } = await searchParams;

  const where = statusFilter && statusFilter !== "all"
    ? { status: statusFilter as OrderStatus }
    : undefined;
  const include = { items: true, customer: { select: { id: true, name: true, phone: true, phoneEnc: true } } };
  const [allOrders, filteredOrders, customers, products] = await Promise.all([
    db.order.findMany({ include, orderBy: { createdAt: "desc" }, take: 200 }),
    db.order.findMany({ where, include, orderBy: { createdAt: "desc" }, take: 200 }),
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, phoneEnc: true, wilaya: true, commune: true, address: true } }),
    db.product.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, price: true, stock: true, isActive: true, productVariants: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, sku: true, price: true, stock: true, isActive: true } } } }),
  ]);

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
          accentBg="bg-sky-500/10 dark:bg-sky-500/15"
          accentIcon="text-sky-600 dark:text-sky-400"
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
      <Tabs defaultValue={statusFilter ?? "all"}>
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
        </TabsList>
      </Tabs>

      {/* Orders table with bulk selection */}
      <Card className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardContent className="p-0">
          {filteredOrders.length === 0 ? (
            <EmptyState
              icon={Package}
              title={t("orders.empty.title")}
              description={t("orders.empty.description")}
              actionLabel={t("orders.createOrder")}
              actionHref="/orders"
            />
          ) : (
            <div className="space-y-3 p-4">
              <OrdersTableClient orders={filteredOrders as unknown as Array<{
                id: string; orderNumber: string; status: string; totalPrice: number;
                wilaya: string; phone: string; createdAt: Date;
                items: Array<{ id: string }>;
                customer: { name: string | null; phone: string | null } | null;
              }>} locale={locale} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
