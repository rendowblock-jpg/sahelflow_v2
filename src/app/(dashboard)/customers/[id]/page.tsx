import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  Calendar,
  MapPin,
  Phone,
  ShoppingBag,
  TrendingUp,
  Truck,
} from "lucide-react";

import { BlacklistToggle } from "@/components/customers/blacklist-toggle";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCustomerDetailWorkbench } from "@/lib/customers/customer-detail-workbench";
import { getI18n } from "@/lib/i18n-server";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import { orderStatusStyles } from "@/lib/shared";
import { statusI18nKey } from "@/lib/shared/status-colors";
import { formatDZD, formatDate } from "@/lib/utils";
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
  const actorContext = await requireTrustedAction("customers.read");
  const { id } = await params;
  const workbench = await getCustomerDetailWorkbench(actorContext, id);
  if (!workbench) notFound();

  const { customer, stats, orders, canReadOrderFinancials } = workbench;
  const resource = { shopId: actorContext.shop.shopId };
  const canManageRisk =
    customer.fieldAccess.risk &&
    trustedActionAllowed(actorContext, "risk.manage", resource);
  const riskScore = customer.riskScore;
  const riskLevel = riskScore === null ? null : getRiskLevel(riskScore);
  const riskBadge = riskLevel
    ? {
        low: { variant: "secondary" as const, label: t("risk.lowRisk") },
        medium: { variant: "outline" as const, label: t("risk.mediumRisk") },
        high: { variant: "destructive" as const, label: t("risk.highRisk") },
      }[riskLevel]
    : null;
  const spendingSeries = canReadOrderFinancials
    ? orders
        .slice(0, 20)
        .reverse()
        .map((order) => ({ value: order.totalPrice ?? 0 }))
    : [];
  const customerLabel = customer.name ?? t("inbox.restrictedContact");

  return (
    <div className="app-content page-sections">
      <Breadcrumbs
        items={[
          { label: t("customers.title"), href: "/customers" },
          { label: customerLabel },
        ]}
      />

      <PageHeader
        title={customerLabel}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {customer.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" aria-hidden="true" />
                <span className="font-mono">{customer.phone}</span>
              </span>
            ) : null}
            {customer.phone2 ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" aria-hidden="true" />
                <span className="font-mono">{customer.phone2}</span>
              </span>
            ) : null}
            {customer.wilaya ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {customer.wilaya}{customer.commune ? ` · ${customer.commune}` : ""}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" aria-hidden="true" />
              {t("customers.customerSince")} {formatDate(customer.createdAt, locale)}
            </span>
          </span>
        }
        actions={riskBadge && riskScore !== null ? (
          <div className="flex items-center gap-2">
            <Badge variant={riskBadge.variant}>
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {riskBadge.label} · {riskScore}
            </Badge>
            {canManageRisk ? (
              <BlacklistToggle
                customerId={customer.id}
                isBlacklisted={customer.isBlacklisted === true}
                variant="button"
              />
            ) : null}
          </div>
        ) : undefined}
      />

      {customer.fieldAccess.risk && customer.isBlacklisted === true ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/25 bg-destructive/[0.025] p-4">
          <Ban className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">
              {t("customers.blacklisted")}
            </p>
            {customer.blacklistReason ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("risk.blacklist.reason")}: {customer.blacklistReason}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {stats ? (
        <div className="card-grid-4">
          {stats.totalSpent !== null ? (
            <StatCard
              label={t("customers.lifetimeValue")}
              value={formatDZD(stats.totalSpent, locale)}
              icon={<TrendingUp />}
              spark={spendingSeries}
              sparkColor="var(--color-chart-2)"
            />
          ) : null}
          <StatCard
            label={t("customers.totalOrders")}
            value={stats.totalOrders}
            icon={<ShoppingBag />}
          />
          <StatCard
            label={t("customers.deliveryRate")}
            value={`${stats.deliveryRate}%`}
            icon={<Truck />}
          />
          {stats.avgOrderValue !== null ? (
            <StatCard
              label={t("customers.avgOrderValue")}
              value={formatDZD(stats.avgOrderValue, locale)}
              icon={<TrendingUp />}
            />
          ) : null}
        </div>
      ) : null}

      {stats || customer.fieldAccess.contact ? (
        <div className="card-grid-3">
          {stats ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("customers.deliveryRate")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{t("customers.delivered")}</p>
                    <p className="text-lg font-bold tabular-nums">{stats.deliveredCount}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{t("customers.returned")}</p>
                    <p className="text-lg font-bold tabular-nums">{stats.returnedCount}</p>
                  </div>
                </div>
                {stats.firstOrderDate ? (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t("customers.firstOrder")}</p>
                    <p className="text-sm font-medium">{formatDate(stats.firstOrderDate, locale)}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {customer.fieldAccess.contact ? (
            <Card className={stats ? "lg:col-span-2" : "lg:col-span-3"}>
              <CardHeader>
                <CardTitle className="text-base">
                  {customer.notes ? t("publicForm.notes") : t("customers.address")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">
                  {customer.notes ?? customer.address ?? "—"}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {workbench.canReadOrders ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("customers.orderHistory")}</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <ShoppingBag className="mb-2 size-8 text-muted-foreground" aria-hidden="true" />
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
                            <Link
                              href={`/orders/${order.id}`}
                              className="font-medium text-primary hover:underline"
                            >
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
                            {order.totalPrice === null ? "—" : formatDZD(order.totalPrice, locale)}
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
      ) : null}
    </div>
  );
}
