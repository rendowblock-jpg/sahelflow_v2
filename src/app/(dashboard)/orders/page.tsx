import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDZD, formatDate } from "@/lib/utils";
import type { OrderStatus } from "@/types/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { Package, TrendingUp, Clock, CheckCircle2, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Commandes — SahelFlow" };
export const revalidate = 30;

const STATUS_FILTERS = [
  { value: "all", label: "Toutes" },
  { value: "draft", label: "Brouillons" },
  { value: "pending", label: "En attente" },
  { value: "confirmed", label: "Confirmées" },
  { value: "shipped", label: "Expédiées" },
  { value: "delivered", label: "Livrées" },
  { value: "returned", label: "Retournées" },
  { value: "cancelled", label: "Annulées" },
] as const;

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  pending: "secondary",
  confirmed: "default",
  shipped: "default",
  delivered: "default",
  returned: "destructive",
  refused: "destructive",
  cancelled: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  pending: "En attente",
  confirmed: "Confirmée",
  shipped: "Expédiée",
  delivered: "Livrée",
  returned: "Retournée",
  refused: "Refusée",
  cancelled: "Annulée",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { t } = await getI18n();
  const { status: statusFilter } = await searchParams;

  // Fetch all orders (for counts) + filtered list — include customer for display
  const where = statusFilter && statusFilter !== "all"
    ? { status: statusFilter as OrderStatus }
    : undefined;
  const include = { items: true, customer: { select: { name: true, phone: true } } };
  const [allOrders, filteredOrders] = await Promise.all([
    db.order.findMany({ include, orderBy: { createdAt: "desc" }, take: 200 }),
    db.order.findMany({ where, include, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  // Count by status for the tab badges
  const counts: Record<string, number> = { all: allOrders.length };
  for (const o of allOrders) {
    counts[o.status] = (counts[o.status] ?? 0) + 1;
  }

  // Stat cards
  const activeOrders = allOrders.filter((o) =>
    ["pending", "confirmed", "shipped"].includes(o.status),
  );
  const deliveredToday = allOrders.filter(
    (o) => o.status === "delivered" && o.deliveredAt &&
    new Date(o.deliveredAt).toDateString() === new Date().toDateString(),
  );
  const todayRevenue = deliveredToday.reduce((sum, o) => sum + o.totalPrice, 0);
  const pendingCount = allOrders.filter((o) => o.status === "pending").length;

  const stats = [
    {
      label: "Commandes actives",
      value: String(activeOrders.length),
      icon: ShoppingBag,
    },
    {
      label: "En attente",
      value: String(pendingCount),
      icon: Clock,
    },
    {
      label: "Livrées aujourd'hui",
      value: String(deliveredToday.length),
      icon: CheckCircle2,
    },
    {
      label: "Revenu du jour",
      value: formatDZD(todayRevenue),
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav.orders")}</h1>
          <p className="text-sm text-muted-foreground">
            Gérez toutes vos commandes en un seul endroit
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Status filter tabs */}
      <Tabs defaultValue={statusFilter ?? "all"}>
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
                {filter.label}
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
      <Card>
        <CardContent className="p-0">
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Aucune commande</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                Les commandes apparaîtront ici une fois reçues via WhatsApp, TikTok ou saisie manuelle.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3">N° Commande</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3 hidden md:table-cell">Articles</th>
                    <th className="px-4 py-3 hidden sm:table-cell">Wilaya</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Date</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredOrders.map((order) => {
                    const customer = order.customer;
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
                          {order.items.length} article{order.items.length > 1 ? "s" : ""}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-sm">
                          {order.wilaya}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-sm">
                          {formatDZD(order.totalPrice)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_BADGE[order.status] ?? "outline"}>
                            {STATUS_LABELS[order.status] ?? order.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">
                          {formatDate(order.createdAt, "fr")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/orders/${order.id}`}>
                              Détails
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
