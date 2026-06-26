import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { PremiumTable } from "@/components/shared/premium-table";
import { ReturnFormDialog } from "@/components/returns/return-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RotateCcw, CheckCircle2, Clock, ArrowLeftRight } from "lucide-react";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.returns") };
}
export const dynamic = "force-dynamic";

/** i18n-driven return status styles */
const RETURN_STATUS_STYLES: Record<string, { i18nKey: string; dot: string; bg: string; text: string; border: string }> = {
  requested: { i18nKey: "returns.status.requested", dot: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800/50" },
  approved: { i18nKey: "returns.status.approved", dot: "bg-sky-500", bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-400", border: "border-sky-200 dark:border-sky-800/50" },
  rejected: { i18nKey: "returns.status.rejected", dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800/50" },
  completed: { i18nKey: "returns.status.completed", dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800/50" },
};

const TYPE_I18N: Record<string, string> = {
  return: "returns.type.return",
  exchange: "returns.type.exchange",
};

export default async function ReturnsPage() {
  const { t, locale } = await getI18n();

  const returns = await db.return.findMany({
    include: { order: { include: { customer: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const requestedCount = returns.filter((r) => r.status === "requested").length;
  const completedCount = returns.filter((r) => r.status === "completed").length;
  const exchangeCount = returns.filter((r) => r.type === "exchange").length;

  const completedPct = returns.length > 0 ? Math.round((completedCount / returns.length) * 100) : 0;
  const exchangePct = returns.length > 0 ? Math.round((exchangeCount / returns.length) * 100) : 0;

  return (
    <div className="app-content page-sections">
      <div className="flex items-start justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav.returns")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("returns.subtitle")}
          </p>
        </div>
        <ReturnFormDialog />
      </div>

      <div className="stagger-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("returns.totalReturns")}
          value={returns.length}
          icon={<RotateCcw />}
          accentBg="bg-sky-500/10 dark:bg-sky-500/15"
          accentIcon="text-sky-600 dark:text-sky-400"
          subtitle={t("returns.completedPct", { pct: completedPct })}
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("returns.waiting")}
          value={requestedCount}
          icon={<Clock />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-amber-600 dark:text-amber-400"
          trend={requestedCount > 0 ? -1 : 0}
          trendLabel={t("returns.waitingTrend")}
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("returns.completed")}
          value={completedCount}
          icon={<CheckCircle2 />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-emerald-600 dark:text-emerald-400"
          trend={completedPct > 50 ? 1 : 0}
          trendLabel={t("returns.completedPct", { pct: completedPct })}
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("returns.exchanges")}
          value={exchangeCount}
          icon={<ArrowLeftRight />}
          accentBg="bg-violet-500/10 dark:bg-violet-500/15"
          accentIcon="text-violet-600 dark:text-violet-400"
          subtitle={t("returns.exchangePct", { pct: exchangePct })}
          style={{ animationDelay: "240ms" }}
        />
      </div>

      <Card className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardHeader>
          <CardTitle className="text-base">{t("returns.history")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {returns.length === 0 ? (
            <EmptyState
              icon={RotateCcw}
              title={t("returns.empty.title")}
              description={t("returns.empty.description")}
              actionLabel={t("returns.empty.action")}
              actionHref="/orders"
            />
          ) : (
            <PremiumTable>
              <PremiumTable.Header>
                <PremiumTable.Row>
                  <PremiumTable.Head>{t("returns.table.order")}</PremiumTable.Head>
                  <PremiumTable.Head>{t("returns.table.customer")}</PremiumTable.Head>
                  <PremiumTable.Head>{t("returns.table.type")}</PremiumTable.Head>
                  <PremiumTable.Head hideOn="md">{t("returns.table.reason")}</PremiumTable.Head>
                  <PremiumTable.Head align="center">{t("returns.table.status")}</PremiumTable.Head>
                  <PremiumTable.Head hideOn="lg">{t("returns.table.date")}</PremiumTable.Head>
                  <PremiumTable.Head align="end" width="w-20">{t("returns.table.action")}</PremiumTable.Head>
                </PremiumTable.Row>
              </PremiumTable.Header>
              <PremiumTable.Body>
                {returns.map((ret) => {
                  const statusStyle = RETURN_STATUS_STYLES[ret.status];
                  return (
                    <PremiumTable.Row key={ret.id}>
                      <PremiumTable.Cell>
                        <Link
                          href={`/orders/${ret.orderId}`}
                          className="font-mono text-sm font-medium text-primary hover:underline"
                        >
                          {ret.order.orderNumber}
                        </Link>
                      </PremiumTable.Cell>
                      <PremiumTable.Cell>
                        {ret.order.customer?.name ?? "—"}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell>
                        <Badge variant="outline">{t(TYPE_I18N[ret.type] ?? ret.type)}</Badge>
                      </PremiumTable.Cell>
                      <PremiumTable.Cell hideOn="md" className="text-muted-foreground max-w-xs truncate">
                        {ret.reason}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell align="center">
                        {statusStyle ? (
                          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                            <span className={`size-1.5 rounded-full ${statusStyle.dot}`} />
                            {t(statusStyle.i18nKey)}
                          </span>
                        ) : (
                          <Badge variant="outline">{ret.status}</Badge>
                        )}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell hideOn="lg" className="text-muted-foreground">
                        {formatDate(ret.createdAt, locale)}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell align="end">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/orders/${ret.orderId}`}>
                            {t("returns.view")}
                          </Link>
                        </Button>
                      </PremiumTable.Cell>
                    </PremiumTable.Row>
                  );
                })}
              </PremiumTable.Body>
            </PremiumTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
