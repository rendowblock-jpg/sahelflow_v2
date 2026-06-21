import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RotateCcw, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Retours — SahelFlow" };
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  requested: "secondary",
  approved: "default",
  rejected: "destructive",
  completed: "default",
};

const STATUS_LABELS: Record<string, string> = {
  requested: "Demandé",
  approved: "Approuvé",
  rejected: "Refusé",
  completed: "Terminé",
};

const TYPE_LABELS: Record<string, string> = {
  return: "Retour",
  exchange: "Échange",
};

export default async function ReturnsPage() {
  const { t } = await getI18n();

  const returns = await db.return.findMany({
    include: { order: { include: { customer: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const stats = [
    { label: "Total retours", value: String(returns.length), icon: RotateCcw },
    { label: "En attente", value: String(returns.filter((r) => r.status === "requested").length), icon: Clock },
    { label: "Terminés", value: String(returns.filter((r) => r.status === "completed").length), icon: CheckCircle2 },
    { label: "Échanges", value: String(returns.filter((r) => r.type === "exchange").length), icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.returns")}</h1>
        <p className="text-sm text-muted-foreground">
          Gérez les retours et échanges de vos commandes
        </p>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historique des retours</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {returns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <RotateCcw className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Aucun retour</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Les retours et échanges apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3">Commande</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 hidden md:table-cell">Raison</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Date</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {returns.map((ret) => (
                    <tr key={ret.id} className="hover:bg-accent/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/orders/${ret.orderId}`}
                          className="font-mono text-sm font-medium text-primary hover:underline"
                        >
                          {ret.order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {ret.order.customer?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{TYPE_LABELS[ret.type] ?? ret.type}</Badge>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground max-w-xs truncate">
                        {ret.reason}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE[ret.status] ?? "outline"}>
                          {STATUS_LABELS[ret.status] ?? ret.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">
                        {formatDate(ret.createdAt, "fr")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/orders/${ret.orderId}`}>
                            Voir
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
