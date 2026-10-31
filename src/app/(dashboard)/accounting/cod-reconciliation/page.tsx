import type { Metadata } from "next";

import { CanonicalCodDashboard } from "@/components/accounting/canonical-cod-dashboard";
import { CanonicalCodReadOnly } from "@/components/accounting/canonical-cod-readonly";
import { CodReconciliationView } from "@/components/accounting/cod-reconciliation-view";
import {
  isCodSummaryEmpty,
  resolveCodState,
} from "@/components/accounting/cod-reconciliation-state";
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
  // A failed read shows the page's own error screen with Retry, not the route boundary.
  const summary = await getCanonicalCodWorkspaceSummary({
    prisma: db,
    shop: shopContext,
  }).then(
    (value) => value,
    () => null,
  );
  const canUpdate = trustedActionAllowed(
    actorContext,
    "accounting.update",
    { shopId: actorContext.shop.shopId },
  );
  const truncated = summary ? summary.truncated.orders || summary.truncated.settlements : false;

  return (
    <CodReconciliationView
      t={t}
      state={resolveCodState({
        failed: summary === null,
        truncated,
        flaggedCount: summary ? summary.flaggedOrders.length : 0,
        empty: summary ? isCodSummaryEmpty(summary) : false,
      })}
      flaggedOrders={summary ? summary.flaggedOrders : []}
      truncated={truncated}
      retryHref="/accounting/cod-reconciliation"
      ordersHref="/orders"
      body={
        summary ? (
          canUpdate ? (
            <CanonicalCodDashboard summary={summary} />
          ) : (
            <CanonicalCodReadOnly summary={summary} />
          )
        ) : null
      }
    />
  );
}
