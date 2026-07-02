import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Phone,
  MapPin,
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  Truck,
  Calendar,
} from "lucide-react";

import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { customerService, customerServiceExtensions } from "@/lib/data";
import { formatDZD, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SahelFlowError } from "@/types/errors";
import { orderStatusStyles } from "@/lib/shared";
import { statusI18nKey } from "@/lib/shared/status-colors";
import type { OrderStatus } from "@/types/domain";
import { PageHeader } from "@/components/shared/page-header";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { StatCard } from "@/components/shared/stat-card";

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

  // Use the new stats service for accurate aggregation
  const [stats, orders] = await Promise.all([
    customerServiceExtensions.getStats({ prisma: db }, id),
    customerServiceExtensions.getOrderHistory({ prisma: db }, id, { limit: 50 }),
  ]);

  const riskLevel = getRiskLevel(customer.riskScore);
  const riskBadge: Record<typeof riskLevel, { variant: "secondary" | "outline" | "destructive"; label: string }> = {
    low: { variant: "secondary", label: t("risk.lowRisk") },
    medium: { variant: "outline", label: t("risk.mediumRisk") },
    high: { variant: "destructive", label: t("risk.highRisk") },
  };

  // Spending sparkline (last 20 orders by date)
  const spendingSeries = orders
    .slice(0, 20)
    .reverse()
    .map((o) => ({ value: o.totalPrice }));

  return (
    <div className="app-content page-sections">
      <Breadcrumbs
        items={[
          { label: t("customers.title"), href: "/customers" },
          { label: customer.name },
        ]}
        className="mb-4"
      />

      <PageHeader
        title={customer.name}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
                {customer.wilaya}{customer.commune ? ` · ${customer.commune}` : ""}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {t("customers.customerSince")} {formatDate(customer.createdAt, locale)}
            </span>
          </span>
        }
        actions={
          <Badge variant={riskBadge[riskLevel].variant}>
            <AlertTriangle className="h-3.5 w-3.5" />
            {riskBadge[riskLevel].label} · {customer.riskScore}
          </Badge>
        }
      />

      {/* Customer 360 stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("customers.lifetimeValue")}
          value={formatDZD(stats.totalSpent)}
          icon={<TrendingUp />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-emerald-600 dark:text-emerald-400"
          spark={spendingSeries}
          sparkColor="var(--color-chart-2)"
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("customers.totalOrders")}
          value={stats.totalOrders}
          icon={<ShoppingBag />}
          accentBg="bg-teal-500/10 dark:bg-teal-500/15"
          accentIcon="text-teal-600 dark:text-teal-400"
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("customers.deliveryRate")}
          value={`${stats.deliveryRate}%`}
          icon={<Truck />}
          accentBg="bg-violet-500/10 dark:bg-violet-500/15"
          accentIcon="text-violet-600 dark:text-violet-400"
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("customers.avgOrderValue")}
          value={formatDZD(stats.avgOrderValue)}
          icon={<TrendingUp />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-amber-600 dark:text-amber-400"
          style={{ animationDelay: "240ms" }}
        />
      </div>

      {/* Delivery breakdown + Notes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1 animate-fade-up">
          <CardHeader>
            <CardTitle className="text-base">{t("customers.deliveryRate")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground">{t("customers.delivered")}</p>
                <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{stats.deliveredCount}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground">{t("customers.returned")}</p>
                <p className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">{stats.returnedCount}</p>
              </div>
            </div>
            {stats.firstOrderDate && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-[11px] text-muted-foreground">{t("customers.firstOrder")}</p>
                <p className="text-sm font-medium">{formatDate(stats.firstOrderDate, locale)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {customer.notes && (
          <Card className="lg:col-span-2 animate-fade-up">
            <CardHeader>
              <CardTitle className="text-base">{t("publicForm.notes")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
            </CardContent>
          </Card>
        )}
        {!customer.notes && (
          <Card className="lg:col-span-2 animate-fade-up">
            <CardHeader>
              <CardTitle className="text-base">{t("customers.address")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{customer.address || "—"}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Order history */}
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="text-base">{t("customers.orderHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t("customers.noOrders")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
        <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t("orders.status")}</TableHead>
                  <TableHead className="text-end">{t("orders.total")}</TableHead>
                  <TableHead>{t("orders.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const status = order.status as OrderStatus;
                  const style = orderStatusStyles[status];
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-sm">
                        <Link href={`/orders/${order.id}`} className="font-medium hover:underline">
                          {order.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {style ? (
                          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text} ${style.border}`}>
                            <span className={`size-1.5 rounded-full ${style.dot}`} />
                            {t(style.i18nKey)}
                          </span>
                        ) : (
                          <Badge variant="outline">{t(statusI18nKey(status))}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
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
        </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
