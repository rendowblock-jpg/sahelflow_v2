import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeftRight, CheckCircle2, Clock, RotateCcw } from "lucide-react";

import { ReturnFormDialog } from "@/components/returns/return-form-dialog";
import { ReturnsDataTable } from "@/components/returns/returns-data-table";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import {
  getReturnWorkbenchPage,
  resolveReturnWorkbenchAccess,
} from "@/lib/returns/return-workbench";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.returns") };
}
export const dynamic = "force-dynamic";

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actorContext = await requireTrustedAction("orders.read");
  const { t, locale } = await getI18n();
  const requestedPage = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const access = resolveReturnWorkbenchAccess(actorContext);
  const [fallback, statusCounts, typeCounts] = await Promise.all([
    getReturnWorkbenchPage(actorContext, { page, pageSize: 25 }),
    db.return.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    db.return.groupBy({
      by: ["type"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);
  const lastPage = Math.max(1, Math.ceil(fallback.total / fallback.pageSize));
  if (page > lastPage) redirect(`/returns?page=${lastPage}`);

  const statusMap = new Map(statusCounts.map((group) => [group.status, group._count._all]));
  const typeMap = new Map(typeCounts.map((group) => [group.type, group._count._all]));
  const total = fallback.total;
  const requestedCount = statusMap.get("requested") ?? 0;
  const completedCount = statusMap.get("completed") ?? 0;
  const exchangeCount = typeMap.get("exchange") ?? 0;
  const completedPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const exchangePct = total > 0 ? Math.round((exchangeCount / total) * 100) : 0;

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.returns")}
        description={t("returns.subtitle")}
        actions={access.export || access.create ? (
          <div className="flex flex-wrap items-center gap-2">
            {access.export ? <ImportExportButtons exportRoute="/api/export/returns" /> : null}
            {access.create ? <ReturnFormDialog /> : null}
          </div>
        ) : undefined}
      />

      <div className="card-grid-4">
        <StatCard
          label={t("returns.totalReturns")}
          value={total}
          icon={<RotateCcw />}
          subtitle={t("returns.completedPct", { pct: completedPct })}
        />
        <StatCard
          label={t("returns.waiting")}
          value={requestedCount}
          icon={<Clock />}
          trendLabel={t("returns.waitingTrend")}
        />
        <StatCard
          label={t("returns.completed")}
          value={completedCount}
          icon={<CheckCircle2 />}
          subtitle={t("returns.completedPct", { pct: completedPct })}
        />
        <StatCard
          label={t("returns.exchanges")}
          value={exchangeCount}
          icon={<ArrowLeftRight />}
          subtitle={t("returns.exchangePct", { pct: exchangePct })}
        />
      </div>

      <section aria-labelledby="returns-history-title" className="space-y-3">
        <h2 id="returns-history-title" className="text-base font-semibold">
          {t("returns.history")}
        </h2>
        <ReturnsDataTable
          fallback={{
            ...fallback,
            returns: fallback.returns.map((entry) => ({
              ...entry,
              createdAt:
                entry.createdAt instanceof Date
                  ? entry.createdAt.toISOString()
                  : entry.createdAt,
            })),
          }}
          locale={locale}
        />
      </section>
    </div>
  );
}
