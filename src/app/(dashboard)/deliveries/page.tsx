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
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Livraisons — SahelFlow" };
export const revalidate = 30;
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  created: "secondary",
  picked_up: "secondary",
  in_transit: "default",
  at_hub: "secondary",
  out_for_delivery: "default",
  delivered: "default",
  returned: "destructive",
  refused: "destructive",
  failed: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  created: "Créée",
  picked_up: "Récupérée",
  in_transit: "En transit",
  at_hub: "Au dépôt",
  out_for_delivery: "En livraison",
  delivered: "Livrée",
  returned: "Retournée",
  refused: "Refusée",
  failed: "Échec",
};

const PROVIDER_LABELS: Record<string, string> = {
  yalidine: "Yalidine",
  maystro: "Maystro",
  zrexpress: "ZR Express",
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

  // Stat cards
  const active = allDeliveries.filter((d) =>
    ["pending", "created", "picked_up", "in_transit", "at_hub", "out_for_delivery"].includes(d.status),
  );
  const delivered = allDeliveries.filter((d) => d.status === "delivered");
  const returned = allDeliveries.filter((d) => ["returned", "refused", "failed"].includes(d.status));
  const totalCost = allDeliveries.reduce((sum, d) => sum + (d.cost ?? 0), 0);

  const stats = [
    { label: "Livraisons actives", value: String(active.length), icon: Truck },
    { label: "Livrées", value: String(delivered.length), icon: PackageCheck },
    { label: "Retours/Échecs", value: String(returned.length), icon: AlertCircle },
    { label: "Coût total", value: formatDZD(totalCost), icon: Clock },
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.delivery")}</h1>
        <p className="text-sm text-muted-foreground">
          Suivez toutes vos expéditions de livraison
        </p>
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

      {/* Deliveries table */}
      <Card>
        <CardContent className="p-0">
          {filteredDeliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Truck className="h-8 w-8 text-muted-foreground" />
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
                        <td className="px-4 py-3 hidden sm:table-cell text-sm">
                          {PROVIDER_LABELS[delivery.provider] ?? delivery.provider}
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell text-sm">
                          {delivery.cost ? formatDZD(delivery.cost) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_BADGE[delivery.status] ?? "outline"}>
                            {STATUS_LABELS[delivery.status] ?? delivery.status}
                          </Badge>
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
