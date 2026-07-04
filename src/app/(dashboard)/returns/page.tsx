import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { ReturnFormDialog } from "@/components/returns/return-form-dialog";
import { ReturnsDataTable } from "@/components/returns/returns-data-table";
import { RotateCcw, CheckCircle2, Clock, ArrowLeftRight } from "lucide-react";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.returns") };
}
export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const { t, locale } = await getI18n();

  const PAGE_SIZE = 25;
  const where = { deletedAt: null };

  // Page-1 fallback + total + stat-card aggregates (across ALL returns).
  const [returns, total, statusCounts, typeCounts] = await Promise.all([
    db.return.findMany({
      where,
      include: { order: { include: { customer: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: 0,
    }),
    db.return.count({ where }),
    db.return.groupBy({ by: ["status"], where, _count: true }),
    db.return.groupBy({ by: ["type"], where, _count: true }),
  ]);

  const countOf = (key: string, groups: { status: string; _count: number }[] | { type: string; _count: number }[]) =>
    groups.find((g) => (g as { status?: string; type?: string }).status === key || (g as { type?: string }).type === key)?._count ?? 0;

  const requestedCount = countOf("requested", statusCounts as { status: string; _count: number }[]);
  const completedCount = countOf("completed", statusCounts as { status: string; _count: number }[]);
  const exchangeCount = countOf("exchange", typeCounts as { type: string; _count: number }[]);

  const completedPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const exchangePct = total > 0 ? Math.round((exchangeCount / total) * 100) : 0;

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.returns")}
        description={t("returns.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <ImportExportButtons exportRoute="/api/export/returns" />
            <ReturnFormDialog />
          </div>
        }
      />

      <div className="card-grid-4 stagger-grid">
        <StatCard
          label={t("returns.totalReturns")}
          value={total}
          icon={<RotateCcw />}
          accentBg="bg-teal-500/10 dark:bg-teal-500/15"
          accentIcon="text-teal-600 dark:text-teal-400"
          subtitle={t("returns.completedPct", { pct: completedPct })}
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("returns.waiting")}
          value={requestedCount}
          icon={<Clock />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-amber-600 dark:text-amber-400"
          trendLabel={t("returns.waitingTrend")}
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("returns.completed")}
          value={completedCount}
          icon={<CheckCircle2 />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-emerald-600 dark:text-emerald-400"
          subtitle={t("returns.completedPct", { pct: completedPct })}
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
        <CardContent>
          <ReturnsDataTable
            fallback={{
              returns: returns.map((r) => ({
                id: r.id,
                orderId: r.orderId,
                reason: r.reason,
                status: r.status,
                type: r.type,
                notes: r.notes,
                createdAt: r.createdAt.toISOString(),
                order: r.order
                  ? {
                      id: r.order.id,
                      orderNumber: r.order.orderNumber,
                      customer: r.order.customer ? { name: r.order.customer.name } : null,
                    }
                  : { id: "", orderNumber: "", customer: null },
              })),
              total,
              hasNextPage: total > PAGE_SIZE,
              page: 1,
              pageSize: PAGE_SIZE,
            }}
            locale={locale}
          />
        </CardContent>
      </Card>
    </div>
  );
}
