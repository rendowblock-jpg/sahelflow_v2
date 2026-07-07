/**
 * COD Reconciliation page (Phase 4/8 — the killer feature for Algerian COD).
 *
 * Shows: collected-but-not-remitted orders (pending remittance), remitted
 * orders (reconciled), and uncollected orders. Sellers bulk-mark orders as
 * remitted with a courier remittance reference.
 */
import { getCodReconciliationSummary } from "@/lib/data/cod-service";
import { getI18n } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/page-header";
import { CodReconciliationClient } from "@/components/accounting/cod-reconciliation-client";
import { formatDZD } from "@/lib/utils";
import { DollarSign, CheckCircle2, Clock } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.codReconciliation") };
}

export default async function CodReconciliationPage() {
  const { t } = await getI18n();
  const summary = await getCodReconciliationSummary();

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("codReconciliation.title")}
        description={t("codReconciliation.description")}
      />

      {/* Summary stat cards */}
      <div className="card-grid-4 stagger-grid">
        <StatCard
          label={t("codReconciliation.delivered")}
          value={summary.counts.delivered}
          icon={<CheckCircle2 />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-success"
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("codReconciliation.collected")}
          value={summary.counts.collected}
          icon={<DollarSign />}
          accentBg="bg-blue-500/10 dark:bg-blue-500/15"
          accentIcon="text-blue-600 dark:text-blue-400"
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("codReconciliation.remitted")}
          value={summary.counts.remitted}
          icon={<CheckCircle2 />}
          accentBg="bg-teal-500/10 dark:bg-teal-500/15"
          accentIcon="text-teal-600 dark:text-teal-400"
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("codReconciliation.pendingRemittance")}
          value={formatDZD(summary.pendingAmount)}
          icon={<Clock />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-warning"
          hint={t("codReconciliation.hint")}
          style={{ animationDelay: "240ms" }}
        />
      </div>

      {/* Pending remittance table (the actionable list) */}
      <CodReconciliationClient
        pendingOrders={summary.pendingRemittance.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          totalPrice: o.totalPrice,
          codCollectedAt: o.codCollectedAt?.toISOString() ?? null,
          customerName: o.customer.name,
        }))}
        totalPending={summary.pendingAmount}
        totalCollected={summary.totalCollectedAmount}
        totalRemitted={summary.totalRemittedAmount}
      />
    </div>
  );
}
