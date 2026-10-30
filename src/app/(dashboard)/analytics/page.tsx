import type { Metadata } from "next";
import { resolveAnalyticsRange, resolvePreviousRange } from "@/lib/analytics/range";
import { getAnalyticsReportForRange } from "@/lib/analytics/report";
import { getCourierPerformance } from "@/lib/analytics/courier-performance";
import { getReturnRateByWilaya, getSkuPnl, getPeriodComparison } from "@/lib/data/analytics-v2";
import { projectSkuPnlForTrustedActor } from "@/lib/identity/sku-pnl-projection";
import { getI18n } from "@/lib/i18n-server";
import { assertTrustedAction, requireTrustedAction, trustedActionAllowed } from "@/lib/identity/authorization";
import { AnalyticsView } from "@/components/analytics/analytics-view";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.analytics") };
}
export const dynamic = "force-dynamic";


export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    days?: string;
  }>;
}) {
  const actorContext = await requireTrustedAction("analytics.read");
  assertTrustedAction(actorContext, "analytics.financials.read");
  const { t, locale } = await getI18n();
  const { range: rangeParam, from: fromParam, to: toParam, days: daysParam } =
    await searchParams;

  // One shared range authority for every query on this page (R4-d):
  // presets 7d/30d/90d + custom from/to, URL-persisted like the orders filters.
  const range = resolveAnalyticsRange({
    range: rangeParam,
    from: fromParam,
    to: toParam,
    days: daysParam,
  });
  const prevRange = resolvePreviousRange(range);

  // Fees are a financial field: they only leave the database when the actor
  // holds analytics.financials.read (asserted above — kept as an explicit
  // gate so the courier loader stays permission-shaped).
  const includeFees = trustedActionAllowed(
    actorContext,
    "analytics.financials.read",
  );

  const currentWindow = { from: range.from, to: range.toExclusive };
  const [report, returnRateByWilaya, skuPnl, comparison, courier] =
    await Promise.all([
      getAnalyticsReportForRange(range),
      getReturnRateByWilaya(currentWindow),
      getSkuPnl(currentWindow),
      getPeriodComparison(currentWindow, {
        from: prevRange.from,
        to: range.from,
      }),
      getCourierPerformance(range, { includeFees }),
    ]);

  // MNY-20: SKU margin is revenue minus cost, so cost-derived columns need the
  // same products.cost.read grant that guards the product cost itself.
  const skuProjection = projectSkuPnlForTrustedActor(actorContext, skuPnl);
  const showSkuCost = skuProjection.fieldAccess.cost;

  return (
    <AnalyticsView
      t={t}
      locale={locale}
      range={range}
      report={report}
      returnRateByWilaya={returnRateByWilaya}
      skuPnl={skuPnl}
      skuProjection={skuProjection}
      showSkuCost={showSkuCost}
      comparison={comparison}
      courier={courier}
    />
  );
}
