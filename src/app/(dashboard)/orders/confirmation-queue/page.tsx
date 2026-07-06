/**
 * 2-Hour Confirmation Call Queue (Phase 8 — R-1 market research).
 *
 * The #1 lever for reducing COD return rate (cuts refusals 25-35%).
 * Shows pending orders sorted by age, auto-flagging those > 2h old as "stale".
 */
import { getConfirmationQueue } from "@/lib/data/confirmation-queue";
import { getI18n } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { formatDZD } from "@/lib/utils";
import { Clock, AlertTriangle, Phone, CheckCircle2, Banknote } from "lucide-react";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("confirmationQueue.title") + " — SahelFlow" };
}

export default async function ConfirmationQueuePage() {
  const { t } = await getI18n();
  const queue = await getConfirmationQueue();
  const staleCount = queue.filter((o) => o.isStale).length;
  const freshCount = queue.length - staleCount;

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("confirmationQueue.title")}
        description={t("confirmationQueue.description")}
      />

      {/* Stats */}
      <div className="card-grid-4 stagger-grid">
        <StatCard
          label={t("confirmationQueue.pending")}
          value={queue.length}
          icon={<Clock />}
          accentBg="bg-blue-500/10 dark:bg-blue-500/15"
          accentIcon="text-blue-600 dark:text-blue-400"
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("confirmationQueue.fresh")}
          value={freshCount}
          icon={<CheckCircle2 />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-success"
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("confirmationQueue.stale")}
          value={staleCount}
          icon={<AlertTriangle />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-warning"
          hint={t("confirmationQueue.staleHint")}
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("confirmationQueue.totalValue")}
          value={formatDZD(queue.reduce((sum, o) => sum + o.totalPrice, 0))}
          icon={<Banknote />}
          accentBg="bg-teal-500/10 dark:bg-teal-500/15"
          accentIcon="text-teal-600 dark:text-teal-400"
          style={{ animationDelay: "240ms" }}
        />
      </div>

      {/* Queue table */}
      <Card>
        <CardContent className="p-0">
          {queue.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
              <p className="mt-2 text-sm font-medium">{t("confirmationQueue.allCaughtUp")}</p>
              <p className="text-xs text-muted-foreground">{t("confirmationQueue.noPending")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 border-b bg-muted/50">
                  <tr className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 text-start">{t("confirmationQueue.col.order")}</th>
                    <th className="px-4 py-3 text-start">{t("confirmationQueue.col.customer")}</th>
                    <th className="px-4 py-3 text-start">{t("confirmationQueue.col.phone")}</th>
                    <th className="px-4 py-3 text-start">{t("confirmationQueue.col.wilaya")}</th>
                    <th className="px-4 py-3 text-end">{t("confirmationQueue.col.total")}</th>
                    <th className="px-4 py-3 text-start">{t("confirmationQueue.col.age")}</th>
                    <th className="px-4 py-3 text-start">{t("confirmationQueue.col.status")}</th>
                    <th className="px-4 py-3 text-end">{t("confirmationQueue.col.action")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {queue.map((o) => (
                    <tr
                      key={o.id}
                      className={`transition-colors hover:bg-muted/50 ${o.isStale ? "bg-amber-500/5" : ""}`}
                    >
                      <td className="px-4 py-3 font-mono text-sm font-medium">
                        <Link href={`/orders/${o.id}`} className="hover:underline text-primary">
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm">{o.customer.name ?? "—"}</td>
                      <td className="px-4 py-3 text-sm font-mono">
                        <a href={`tel:${o.customer.phone ?? o.phone}`} className="hover:underline flex items-center gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {o.customer.phone ?? o.phone}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-sm">{o.wilaya}</td>
                      <td className="px-4 py-3 text-end font-medium tabular-nums">{formatDZD(o.totalPrice)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`font-medium ${o.isStale ? "text-warning" : "text-muted-foreground"}`}>
                          {o.ageLabel}
                        </span>
                        {o.isStale && <AlertTriangle className="inline h-3 w-3 ms-1 text-amber-500" />}
                      </td>
                      <td className="px-4 py-3">
                        <OrderStatusBadge orderId={o.id} status="pending" size="sm" />
                      </td>
                      <td className="px-4 py-3 text-end">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/orders/${o.id}`}>{t("confirmationQueue.confirm")}</Link>
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
