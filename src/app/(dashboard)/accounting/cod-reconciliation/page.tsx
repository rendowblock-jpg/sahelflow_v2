import type { Metadata } from "next";

import { CanonicalCodDashboard } from "@/components/accounting/canonical-cod-dashboard";
import { CanonicalCodReadOnly } from "@/components/accounting/canonical-cod-readonly";
import { PageHeader } from "@/components/shared/page-header";
import { getCanonicalCodWorkspaceSummary } from "@/lib/accounting/canonical-cod-projections";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  assertTrustedAction,
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.codReconciliation") };
}

export default async function CodReconciliationPage() {
  const actorContext = await requireTrustedAction("accounting.read");
  assertTrustedAction(actorContext, "orders.financials.read");
  assertTrustedAction(actorContext, "customers.contact.read");
  const { t } = await getI18n();
  const summary = await getCanonicalCodWorkspaceSummary({
    prisma: db,
    shop: shopContext,
  });
  const canUpdate = trustedActionAllowed(
    actorContext,
    "accounting.update",
    { shopId: actorContext.shop.shopId },
  );

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("codReconciliation.title")}
        description={t("codReconciliation.description")}
      />
      {/* MNY-03: an order with an inconsistent receivable record is reported
          here instead of failing the whole workspace. Order numbers only. */}
      {summary.flaggedOrders.length > 0 ? (
        <p
          role="alert"
          className="rounded-control border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive"
        >
          {t("codReconciliation.flaggedNotice")}:
          {summary.flaggedOrders.slice(0, 5).map((entry, index) => (
            <span key={entry.orderId}>
              {index > 0 ? ", " : " "}
              <bdi>{entry.orderNumber}</bdi>
            </span>
          ))}
          {summary.flaggedOrders.length > 5 ? " …" : null}
        </p>
      ) : null}
      {/* MNY-01: the read is capped; say so instead of looking complete. */}
      {summary.truncated.orders || summary.truncated.settlements ? (
        <p role="status" className="rounded-control border p-3 text-sm text-muted-foreground">
          {t("codReconciliation.truncatedNotice")}
        </p>
      ) : null}
      {canUpdate ? (
        <CanonicalCodDashboard summary={summary} />
      ) : (
        <CanonicalCodReadOnly summary={summary} />
      )}
    </div>
  );
}
