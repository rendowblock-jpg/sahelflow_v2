import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";

import { formatDZD, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import {
  Truck,
  PackageCheck,
  Clock,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { deliveryProviderConfig } from "@/lib/shared";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Livraisons — SahelFlow" };
export const revalidate = 30;
export const dynamic = "force-dynamic";

// Delivery status styling — theme-aware with dot indicator
const deliveryStatusStyles: Record<string, { label: string; dot: string; bg: string; text: string; border: string }> = {
  pending: { label: "En attente", dot: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800/50" },
  created: { label: "Créée", dot: "bg-sky-500", bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-400", border: "border-sky-200 dark:border-sky-800/50" },
  picked_up: { label: "Récupérée", dot: "bg-sky-500", bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-400", border: "border-sky-200 dark:border-sky-800/50" },
  in_transit: { label: "En transit", dot: "bg-violet-500", bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-400", border: "border-violet-200 dark:border-violet-800/50" },
  at_hub: { label: "Au dépôt", dot: "bg-violet-500", bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-400", border: "border-violet-200 dark:border-violet-800/50" },
  out_for_delivery: { label: "En livraison", dot: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-400", border: "border-blue-200 dark:border-blue-800/50" },
  delivered: { label: "Livrée", dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800/50" },
  returned: { label: "Retournée", dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800/50" },
  refused: { label: "Refusée", dot: "bg-rose-500", bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-400", border: "border-rose-200 dark:border-rose-800/50" },
  failed: { label: "Échec", dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800/50" },
};

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { t } = await getI18n();
  const { status: statusFilter } = await searchParams;

  // Fetch deliveries with order + customer info
  const where = statusFilter && statusFilter !== "all"
    ? { status: statusFilter }
    : undefined;

  const [allDeliveries, filteredDeliveries] = await Promise.all([
    db.delivery.findMany({
      include: { order: { include: { customer: { select: { name: true, phone: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.delivery.findMany({
      where,
      include: { order: { include: { customer: { select: { name: true, phone: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  // Counts by status
  const counts: Record<string, number> = { all: allDeliveries.length };
  for (const d of allDeliveries) {
    counts[d.status] = (counts[d.status] ?? 0) + 1;
  }

  // Stat cards — upgraded with accent icons
  const active = allDeliveries.filter((d) =>
    ["pending", "created", "picked_up", "in_transit", "at_hub", "out_for_delivery"].includes(d.status),
  );
  const delivered = allDeliveries.filter((d) => d.status === "delivered");
  const returned = allDeliveries.filter((d) => ["returned", "refused", "failed"].includes(d.status));
  const totalCost = allDeliveries.reduce((sum, d) => sum + (d.cost ?? 0), 0);

  const stats = [
    { label: "Livraisons actives", value: String(active.length), icon: Truck, accentBg: "bg-sky-500/10 dark:bg-sky-500/15", accentIcon: "text-sky-600 dark:text-sky-400" },
    { label: "Livrées", value: String(delivered.length), icon: PackageCheck, accentBg: "bg-emerald-500/10 dark:bg-emerald-500/15", accentIcon: "text-emerald-600 dark:text-emerald-400" },
    { label: "Retours/Échecs", value: String(returned.length), icon: AlertCircle, accentBg: "bg-red-500/10 dark:bg-red-500/15", accentIcon: "text-red-600 dark:text-red-400" },
    { label: "Coût total", value: formatDZD(totalCost), icon: Clock, accentBg: "bg-violet-500/10 dark:bg-violet-500/15", accentIcon: "text-violet-600 dark:text-violet-400" },
  ];

  const STATUS_FILTERS = [
    { value: "all", label: "Toutes" },
    { value: "pending", label: "En attente" },
    { value: "in_transit", label: "En transit" },
    { value: "delivered", label: "Livrées" },
    { value: "returned", label: "Retournées" },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.delivery")}</h1>
        <p className="text-sm text-muted-foreground">
          Suivez toutes vos expéditions de livraison
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="card-hover animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <div className={`flex size-8 items-center justify-center rounded-lg ${stat.accentBg}`}>
                  <Icon className={`h-4 w-4 ${stat.accentIcon}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Status filter */}
      <Tabs defaultValue={statusFilter ?? "all"}>
        <TabsList className="flex-wrap h-auto">
          {STATUS_FILTERS.map((filter) => (
            <TabsTrigger key={filter.value} value={filter.value} asChild>
              <Link
                href={filter.value === "all" ? "/deliveries" : `/deliveries?status=${filter.value}`}
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

      {/* Deliveries table — upgraded with shared delivery status styles */}
      <Card className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardContent className="p-0">
          {filteredDeliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-5 mb-5 ring-1 ring-primary/10">
                <Truck className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Aucune livraison</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                Les livraisons apparaîtront ici une fois les commandes expédiées.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3">Suivi</th>
                    <th className="px-4 py-3">Commande</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3 hidden sm:table-cell">Transporteur</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">Coût</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Date</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredDeliveries.map((delivery) => {
                    const order = delivery.order;
                    const customer = order?.customer;
                    const statusStyle = deliveryStatusStyles[delivery.status];
                    const providerConfig = deliveryProviderConfig[delivery.provider];
                    return (
                      <tr key={delivery.id} className="hover:bg-accent/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">
                          {delivery.trackingNumber ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {order ? (
                            <Link
                              href={`/orders/${order.id}`}
                              className="font-mono text-sm font-medium text-primary hover:underline"
                            >
                              {order.orderNumber}
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium">{customer?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{order?.wilaya ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          {providerConfig ? (
                            <span className="inline-flex items-center gap-1.5 text-sm">
                              <span className={`size-2 rounded-full ${providerConfig.color}`} />
                              {providerConfig.label}
                            </span>
                          ) : (
                            <span className="text-sm">{delivery.provider}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell text-sm tabular-nums">
                          {delivery.cost ? formatDZD(delivery.cost) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {statusStyle ? (
                            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                              <span className={`size-1.5 rounded-full ${statusStyle.dot}`} />
                              {statusStyle.label}
                            </span>
                          ) : (
                            <Badge variant="outline">{delivery.status}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">
                          {formatDate(delivery.createdAt, "fr")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {order && (
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/orders/${order.id}`}>
                                <ArrowRight className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
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
