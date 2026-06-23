import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDZD, formatDate } from "@/lib/utils";
import type { OrderStatus } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { Package, TrendingUp, Clock, CheckCircle2, ShoppingBag, Download } from "lucide-react";
import { OrderFormDialog } from "@/components/orders/order-form-dialog";
import { orderStatusStyles } from "@/lib/shared";
import { statusI18nKey } from "@/lib/shared/status-colors";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Orders — SahelFlow" };
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
  const include = { items: true, customer: { select: { name: true, phone: true } } };
  const [allOrders, filteredOrders, customers, products] = await Promise.all([
    db.order.findMany({ include, orderBy: { createdAt: "desc" }, take: 200 }),
    db.order.findMany({ where, include, orderBy: { createdAt: "desc" }, take: 200 }),
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, wilaya: true, commune: true, address: true } }),
    db.product.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, price: true, stock: true, isActive: true } }),
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
    <div className="space-y-6 p-6">
      <PageHeader
        title={t("nav.orders")}
        description={t("orders.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/api/export/orders">
                <Download className="mr-1.5 h-4 w-4" />
                {t("orders.exportCSV")}
              </Link>
            </Button>
            <OrderFormDialog customers={customers} products={products} />
          </div>
        }
      />

      {/* KPI stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                  <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                    {counts[filter.value]}
                  </Badge>
                )}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Orders table */}
      <Card className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardContent className="p-0">
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-5 mb-5 ring-1 ring-primary/10">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-1">{t("orders.noOrders")}</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                {t("orders.noOrdersDesc")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3">{t("orders.orderNumber")}</th>
                    <th className="px-4 py-3">{t("orders.customer")}</th>
                    <th className="px-4 py-3 hidden md:table-cell">{t("orders.items")}</th>
                    <th className="px-4 py-3 hidden sm:table-cell">{t("orders.wilaya")}</th>
                    <th className="px-4 py-3 text-right">{t("orders.total")}</th>
                    <th className="px-4 py-3">{t("orders.status")}</th>
                    <th className="px-4 py-3 hidden lg:table-cell">{t("orders.date")}</th>
                    <th className="px-4 py-3 text-right">{t("orders.action")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredOrders.map((order) => {
                    const customer = order.customer;
                    const statusStyle = orderStatusStyles[order.status as OrderStatus];
                    const itemCount = order.items.length;
                    const itemLabel = itemCount > 1
                      ? t("orders.itemsCount").replace("{n}", String(itemCount))
                      : t("orders.itemsCountSingular").replace("{n}", String(itemCount));
                    return (
                      <tr key={order.id} className="hover:bg-accent/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-sm font-medium">
                          {order.orderNumber}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium">{customer?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{order.phone}</div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground">
                          {itemLabel}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-sm">
                          {order.wilaya}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-sm tabular-nums">
                          {formatDZD(order.totalPrice)}
                        </td>
                        <td className="px-4 py-3">
                          {statusStyle ? (
                            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                              <span className={`size-1.5 rounded-full ${statusStyle.dot}`} />
                              {locale === "ar" ? statusStyle.labelAr : statusStyle.label}
                            </span>
                          ) : (
                            <Badge variant="outline">{t(statusI18nKey(order.status))}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">
                          {formatDate(order.createdAt, locale)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/orders/${order.id}`}>
                              {t("orders.details")}
                            </Link>
                          </Button>
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
