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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCustomerWorkbenchDetail } from "@/lib/customers/customer-workbench";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { orderStatusStyles } from "@/lib/shared";
import { statusI18nKey } from "@/lib/shared/status-colors";
import { formatDZD, formatDate } from "@/lib/utils";
import type { OrderStatus } from "@/types/domain";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ id: string }> };

function riskLevel(score: number): "low" | "medium" | "high" {
  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const actorContext = await requireTrustedAction("customers.read");
  const { t, locale } = await getI18n();
  const { id } = await params;
  let detail;
  try {
    detail = await getCustomerWorkbenchDetail(actorContext, id);
  } catch (error) {
    if (error instanceof SahelFlowError && error.statusCode === 404) notFound();
    throw error;
  }

  const { customer, stats, orders, fieldAccess } = detail;
  const label = customer.name ?? t("inbox.restrictedContact");
  const score = customer.riskScore;
  const level = score === null ? null : riskLevel(score);

  return (
    <div className="app-content page-sections">
      <Breadcrumbs items={[{ label: t("customers.title"), href: "/customers" }, { label }]} />
      <PageHeader
        title={label}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {fieldAccess.contact && customer.phone ? (
              <span className="inline-flex items-center gap-1 font-mono"><Phone className="size-3.5" />{customer.phone}</span>
            ) : null}
            {fieldAccess.contact && customer.wilaya ? (
              <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{customer.wilaya}{customer.commune ? ` · ${customer.commune}` : ""}</span>
            ) : null}
            <span className="inline-flex items-center gap-1"><Calendar className="size-3.5" />{t("customers.customerSince")} {formatDate(customer.createdAt, locale)}</span>
          </span>
        }
        actions={
          fieldAccess.risk && level && score !== null ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={level === "high" ? "destructive" : level === "medium" ? "outline" : "secondary"}>
                <AlertTriangle className="size-3.5" />
                {t(`risk.${level}Risk`)} · {score}
              </Badge>
              {fieldAccess.riskManage ? (
                <BlacklistToggle customerId={customer.id} isBlacklisted={Boolean(customer.isBlacklisted)} variant="button" />
              ) : null}
            </div>
          ) : undefined
        }
      />

      {fieldAccess.risk && customer.isBlacklisted ? (
        <div className="flex items-start gap-3 rounded-md border border-destructive/25 bg-destructive/[0.04] p-3">
          <Ban className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-destructive">{t("customers.blacklisted")}</p>
            {customer.blacklistReason ? <p className="text-sm text-muted-foreground">{customer.blacklistReason}</p> : null}
          </div>
        </div>
      ) : null}

      {stats ? (
        <div className="card-grid-4">
          {stats.totalSpent !== null ? (
            <StatCard label={t("customers.lifetimeValue")} value={formatDZD(stats.totalSpent, locale)} icon={<TrendingUp />} />
          ) : null}
          <StatCard label={t("customers.totalOrders")} value={stats.totalOrders} icon={<ShoppingBag />} />
          <StatCard label={t("customers.deliveryRate")} value={`${stats.deliveryRate}%`} icon={<Truck />} />
          {stats.avgOrderValue !== null ? (
            <StatCard label={t("customers.avgOrderValue")} value={formatDZD(stats.avgOrderValue, locale)} icon={<TrendingUp />} />
          ) : null}
        </div>
      ) : null}

      {fieldAccess.contact ? (
        <Card>
          <CardHeader><CardTitle className="text-base">{customer.notes ? t("publicForm.notes") : t("customers.address")}</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm">{customer.notes || customer.address || "—"}</p></CardContent>
        </Card>
      ) : null}

      {fieldAccess.orders ? (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("customers.orderHistory")}</CardTitle></CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("customers.noOrders")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>#</TableHead><TableHead>{t("orders.status")}</TableHead>{fieldAccess.orderFinancials ? <TableHead className="text-end">{t("orders.total")}</TableHead> : null}<TableHead>{t("orders.date")}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {orders.map((order) => {
                      const status = order.status as OrderStatus;
                      const style = orderStatusStyles[status];
                      return (
                        <TableRow key={order.id}>
                          <TableCell><Link href={`/orders/${order.id}`} className="rounded-sm font-mono font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring">{order.orderNumber}</Link></TableCell>
                          <TableCell>{style ? <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text} ${style.border}`}><span className={`size-1.5 rounded-full ${style.dot}`} />{t(style.i18nKey)}</span> : <Badge variant="outline">{t(statusI18nKey(status))}</Badge>}</TableCell>
                          {fieldAccess.orderFinancials ? <TableCell className="text-end tabular-nums">{formatDZD(order.totalPrice ?? 0, locale)}</TableCell> : null}
                          <TableCell className="text-sm text-muted-foreground">{formatDate(order.createdAt, locale)}</TableCell>
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
