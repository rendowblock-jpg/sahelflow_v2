import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Phone,
  MapPin,
  MessageSquare,
  ArrowLeft,
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { customerService } from "@/lib/data";
import { formatDZD, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SahelFlowError } from "@/types/errors";
import type { OrderStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function getRiskLevel(score: number): "low" | "medium" | "high" {
  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { t, locale } = await getI18n();
  const { id } = await params;

  let customer;
  try {
    customer = await customerService.getById({ prisma: db }, id);
  } catch (err) {
    if (err instanceof SahelFlowError && err.statusCode === 404) {
      notFound();
    }
    throw err;
  }

  // Pull order history directly via prisma (no service method yet)
  const orders = await db.order.findMany({
    where: { customerId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const riskLevel = getRiskLevel(customer.riskScore);
  const riskBadgeVariant: Record<"low" | "medium" | "high", "default" | "secondary" | "destructive" | "outline"> = {
    low: "secondary",
    medium: "outline",
    high: "destructive",
  };
  const riskLabel: Record<"low" | "medium" | "high", string> = {
    low: t("risk.lowRisk"),
    medium: t("risk.mediumRisk"),
    high: t("risk.highRisk"),
  };

  const statusLabels: Record<OrderStatus, string> = {
    draft: t("status.draft"),
    pending: t("status.pending"),
    confirmed: t("status.confirmed"),
    shipped: t("status.shipped"),
    delivered: t("status.delivered"),
    returned: t("status.returned"),
    refused: t("status.refused"),
    cancelled: t("status.cancelled"),
  };
  const statusBadgeVariant: Record<OrderStatus, "default" | "secondary" | "destructive" | "outline"> = {
    draft: "outline",
    pending: "secondary",
    confirmed: "default",
    shipped: "default",
    delivered: "default",
    returned: "destructive",
    refused: "destructive",
    cancelled: "destructive",
  };

  return (
    <div className="space-y-6 p-6">
      {/* Back link */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/customers">
          <ArrowLeft className="h-4 w-4" />
          {t("customers.title")}
        </Link>
      </Button>

      {/* Customer header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              <span className="font-mono">{customer.phone}</span>
            </span>
            {customer.phone2 && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                <span className="font-mono">{customer.phone2}</span>
              </span>
            )}
            {customer.wilaya && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {customer.wilaya}
                {customer.commune ? ` · ${customer.commune}` : ""}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              {t("customers.customerStats")} · {formatDate(customer.createdAt, locale)}
            </span>
          </div>
          {customer.address && (
            <p className="mt-2 text-sm">{customer.address}</p>
          )}
        </div>
        <Badge variant={riskBadgeVariant[riskLevel]} className="self-start">
          <AlertTriangle className="h-3.5 w-3.5" />
          {riskLabel[riskLevel]} · {customer.riskScore}
        </Badge>
      </div>

      {/* Stats strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("customers.totalOrders")}
            </CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customer.orderCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("customers.totalSpent")}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDZD(customer.totalSpent)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("customers.avgOrder")}
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customer.orderCount > 0
                ? formatDZD(Math.round(customer.totalSpent / customer.orderCount))
                : formatDZD(0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes (if any) */}
      {customer.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("publicForm.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Order history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("customers.recentOrders")}</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t("customers.noOrders")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("customers.spent")}</TableHead>
                  <TableHead>{t("customers.lastOrder")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const status = order.status as OrderStatus;
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-sm">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-medium hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant[status]}>
                          {statusLabels[status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDZD(order.totalPrice)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(order.createdAt, locale)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
