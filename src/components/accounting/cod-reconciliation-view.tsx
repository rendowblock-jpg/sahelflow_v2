import type { ReactNode } from "react";
import { AlertTriangle, Scale } from "lucide-react";

import { CodReconciliationSkeleton } from "@/components/accounting/cod-reconciliation-skeleton";
import type { CodViewState } from "@/components/accounting/cod-reconciliation-state";
import { PageHeader } from "@/components/shared/page-header";
import { StateSurface } from "@/components/shared/state-surface";
import { Button } from "@/components/ui/button";
import type { getI18n } from "@/lib/i18n-server";

export interface CodReconciliationViewProps {
  t: Awaited<ReturnType<typeof getI18n>>["t"];
  state: CodViewState;
  flaggedOrders: ReadonlyArray<{ orderId: string; orderNumber: string }>;
  truncated: boolean;
  retryHref: string;
  /** Where the empty screen sends the seller. */
  ordersHref: string;
  /** The reconciliation workspace (dashboard or read-only), built by the page. */
  body: ReactNode;
}

/** Pure view: renders already-loaded data, loads nothing. */
export function CodReconciliationView({
  t,
  state,
  flaggedOrders,
  truncated,
  retryHref,
  ordersHref,
  body,
}: CodReconciliationViewProps) {
  if (state === "loading") return <CodReconciliationSkeleton label={t("common.loading")} />;

  return (
    <div className="app-content page-sections" data-cod-state={state}>
      <PageHeader
        title={t("codReconciliation.title")}
        description={t("codReconciliation.description")}
      />
      {state === "error" ? (
        <StateSurface
          kind="error"
          icon={AlertTriangle}
          title={t("codReconciliation.state.loadFailed")}
          description={t("error.requestFailed")}
          size="inline"
          testId="cod-error"
          actions={
            <Button asChild variant="outline" size="sm" className="min-h-11 min-w-11">
              <a href={retryHref}>{t("common.retry")}</a>
            </Button>
          }
        />
      ) : null}
      {/* MNY-03: an order with an inconsistent receivable record is reported
          here instead of failing the whole workspace. Order numbers only. */}
      {state !== "error" && flaggedOrders.length > 0 ? (
        <p
          role="alert"
          className="rounded-control border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive"
        >
          {t("codReconciliation.flaggedNotice")}:
          {flaggedOrders.slice(0, 5).map((entry, index) => (
            <span key={entry.orderId}>
              {index > 0 ? ", " : " "}
              <bdi>{entry.orderNumber}</bdi>
            </span>
          ))}
          {flaggedOrders.length > 5 ? " …" : null}
        </p>
      ) : null}
      {/* MNY-01: the read is capped; say so instead of looking complete. */}
      {state !== "error" && truncated ? (
        <p role="status" className="rounded-control border p-3 text-sm text-muted-foreground">
          {t("codReconciliation.truncatedNotice")}
        </p>
      ) : null}
      {state === "empty" ? (
        <StateSurface
          kind="empty"
          icon={Scale}
          title={t("codReconciliation.state.empty")}
          size="panel"
          testId="cod-empty"
          actions={
            <Button asChild variant="outline" size="sm" className="min-h-11 min-w-11">
              <a href={ordersHref}>{t("nav.orders")}</a>
            </Button>
          }
        />
      ) : null}
      {state === "partial" || state === "populated" ? body : null}
    </div>
  );
}
