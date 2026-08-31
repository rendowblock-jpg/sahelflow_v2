"use client";

/**
 * Analytics CSV export (R4-d).
 *
 * The analytics summary is small (KPIs + one row per courier for the selected
 * range), so the export is a client-side blob download from the loaded server
 * data — no API round trip. Quoting/format conventions come from the shared
 * pure builder (src/lib/analytics/analytics-csv.ts), which mirrors the export
 * routes' CSV rules (formula-injection guard, quote escaping, BOM, CRLF).
 * Values stay raw numbers so spreadsheets stay computable.
 */

import { Download } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import { buildAnalyticsCsv } from "@/lib/analytics/analytics-csv";
import type { CourierPerformanceMetrics } from "@/lib/analytics/courier-metrics";
import { Button } from "@/components/ui/button";

export interface AnalyticsExportSummary {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  deliveryRate: number;
  returnRate: number | null;
}

export function AnalyticsExportButton({
  summary,
  couriers,
  feesIncluded,
  range,
}: {
  summary: AnalyticsExportSummary;
  couriers: readonly CourierPerformanceMetrics[];
  feesIncluded: boolean;
  range: { fromIso: string; toIso: string };
}) {
  const { t, locale } = useI18n();

  function handleExport() {
    const kpiRows: Array<Array<string | number>> = [
      [
        t("analytics.export.range"),
        t("analytics.export.rangeValue", {
          from: range.fromIso,
          to: range.toIso,
        }),
      ],
      [t("analytics.totalRevenue"), summary.totalRevenue],
      [t("nav.orders"), summary.totalOrders],
      [t("analytics.avgOrderValue"), summary.avgOrderValue],
      [t("analytics.deliveryRate"), summary.deliveryRate],
    ];
    if (summary.returnRate !== null) {
      kpiRows.push([t("analytics.returnRate"), summary.returnRate]);
    }

    const courierColumns = [
      t("analytics.courier.provider"),
      t("analytics.courier.shipments"),
      t("analytics.delivered"),
      t("analytics.deliveryRate"),
      t("analytics.courier.avgDeliveryDays"),
      t("analytics.returned"),
      t("analytics.courier.returnRefusalRate"),
      ...(feesIncluded ? [t("analytics.courier.fees")] : []),
    ];
    const courierRows = couriers.map((courier) => [
      courier.provider,
      courier.shipments,
      courier.delivered,
      courier.deliveryRate,
      courier.avgDeliveryDays ?? "",
      courier.returned,
      courier.returnRate,
      ...(feesIncluded ? [courier.totalFees ?? ""] : []),
    ]);

    const csv = buildAnalyticsCsv([
      {
        title: t("analytics.export.kpiTitle"),
        columns: [t("analytics.export.kpiTitle"), ""],
        rows: kpiRows,
      },
      {
        title: t("analytics.courier.title"),
        columns: courierColumns,
        rows: courierRows,
      },
    ]);

    const prefix =
      locale === "ar" ? "تحليلات" : locale === "fr" ? "analyses" : "analytics";
    const fileName = `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleExport}
      className="h-8 gap-1.5 px-3 text-xs"
    >
      <Download className="size-3.5" aria-hidden="true" />
      {t("analytics.export.csv")}
    </Button>
  );
}
