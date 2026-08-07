import type { Metadata } from "next";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
} from "lucide-react";

import { ConfirmationQueueTable } from "@/components/orders/confirmation-queue-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { getConfirmationWorkbenchPage } from "@/lib/orders/confirmation-workbench";
import { formatDZD } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: `${t("confirmationQueue.title")} — SahelFlow` };
}

/**
 * Confirmation is a first-class operational queue, not a sampled dashboard
 * table. All summary values are exact across the complete pending population;
 * the visible workbench is one URL-addressable FIFO page using the shared table
 * and state contract.
 */
export default async function ConfirmationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { t, locale } = await getI18n();
  const actorContext = await requireTrustedAction("orders.read");
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
  const fallback = await getConfirmationWorkbenchPage(actorContext, {
    page,
    pageSize: 25,
  });
  const freshCount = Math.max(0, fallback.total - fallback.staleCount);

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("confirmationQueue.title")}
        description={t("confirmationQueue.description")}
      />

      <div className="card-grid-4">
        <StatCard
          label={t("confirmationQueue.pending")}
          value={fallback.total}
          icon={<Clock />}
        />
        <StatCard
          label={t("confirmationQueue.fresh")}
          value={freshCount}
          icon={<CheckCircle2 />}
        />
        <StatCard
          label={t("confirmationQueue.stale")}
          value={fallback.staleCount}
          icon={<AlertTriangle />}
          hint={t("confirmationQueue.staleHint")}
        />
        <StatCard
          label={t("confirmationQueue.totalValue")}
          value={
            fallback.totalValue === null
              ? "—"
              : formatDZD(fallback.totalValue, locale)
          }
          icon={<Banknote />}
        />
      </div>

      <ConfirmationQueueTable fallback={fallback} locale={locale} />
    </div>
  );
}
