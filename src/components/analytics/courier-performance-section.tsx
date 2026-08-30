import Link from "next/link";
import { Truck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartCard,
  ChartEmpty,
} from "@/components/charts/chart-primitives";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getI18n } from "@/lib/i18n-server";
import {
  buildOrdersDrillDownUrl,
  toIsoDate,
} from "@/lib/analytics/range";
import {
  courierCellTone,
  type CourierPerformanceMetrics,
  type WilayaCourierMatrix,
} from "@/lib/analytics/courier-metrics";
import { cn, formatDZD } from "@/lib/utils";
import wilayasData from "../../../data/wilayas.json";

/**
 * Courier performance workspace section (R4-d) — the #1 COD cost lever.
 *
 * Server component: metrics are computed in the page RSC via
 * src/lib/analytics/courier-performance.ts (shop-scoped, range-aware); this
 * section only localizes, formats (Intl) and links each number to the
 * filtered orders list (drill-down into the records behind the metric).
 */

interface WilayaReference {
  code: number;
  name: string;
  nameAr: string;
}

const WILAYAS = wilayasData as WilayaReference[];

const WILAYA_CODE_BY_NAME = new Map<string, number>(
  WILAYAS.flatMap((wilaya) => [
    [wilaya.name.toLowerCase(), wilaya.code] as const,
    [wilaya.nameAr, wilaya.code] as const,
  ]),
);

const CELL_TONE_CLASSES = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/10 text-destructive",
} as const;

const RATE_TONE_CLASSES = {
  success: "border-success/20 text-success",
  warning: "border-warning/25 text-warning",
  danger: "border-destructive/20 text-destructive",
} as const;

function rateTone(rate: number) {
  const tone = courierCellTone(rate);
  return tone === "empty" ? RATE_TONE_CLASSES.danger : RATE_TONE_CLASSES[tone];
}

function cellTone(rate: number) {
  const tone = courierCellTone(rate);
  return tone === "empty" ? CELL_TONE_CLASSES.danger : CELL_TONE_CLASSES[tone];
}

export async function CourierPerformanceSection({
  providers,
  matrix,
  totalShipments,
  feesIncluded,
  range,
}: {
  providers: readonly CourierPerformanceMetrics[];
  matrix: WilayaCourierMatrix;
  totalShipments: number;
  feesIncluded: boolean;
  range: { from: Date; to: Date };
}) {
  const { t, locale } = await getI18n();
  const dateLocale =
    locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ";
  const integerFormatter = new Intl.NumberFormat(dateLocale, {
    maximumFractionDigits: 0,
  });
  const percentFormatter = new Intl.NumberFormat(dateLocale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const daysFormatter = new Intl.NumberFormat(dateLocale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const fromIso = toIsoDate(range.from);
  const toIso = toIsoDate(range.to);
  const cellByWilayaProvider = new Map(
    matrix.cells.map((cell) => [`${cell.wilaya}::${cell.provider}`, cell]),
  );

  return (
    <section data-analytics-section="courier" className="min-w-0 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="size-4" aria-hidden="true" />
            {t("analytics.courier.title")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("analytics.courier.description")}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {totalShipments === 0 || providers.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {t("analytics.courier.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("analytics.courier.provider")}</TableHead>
                    <TableHead className="text-end">
                      {t("analytics.courier.shipments")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("analytics.delivered")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("analytics.deliveryRate")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("analytics.courier.avgDeliveryDays")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("analytics.courier.returnRefusalRate")}
                    </TableHead>
                    {feesIncluded ? (
                      <TableHead className="text-end">
                        {t("analytics.courier.fees")}
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((provider) => (
                    <TableRow key={provider.provider}>
                      <TableCell className="font-medium">
                        {provider.provider}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {integerFormatter.format(provider.shipments)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {integerFormatter.format(provider.delivered)}
                      </TableCell>
                      <TableCell className="text-end">
                        <Badge
                          variant="outline"
                          className={rateTone(provider.deliveryRate)}
                        >
                          {percentFormatter.format(
                            provider.deliveryRate / 100,
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {provider.avgDeliveryDays === null
                          ? "—"
                          : daysFormatter.format(provider.avgDeliveryDays)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {percentFormatter.format(provider.returnRate / 100)}
                      </TableCell>
                      {feesIncluded ? (
                        <TableCell className="text-end tabular-nums">
                          {provider.totalFees === null
                            ? "—"
                            : formatDZD(provider.totalFees, locale)}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {matrix.wilayas.length > 0 ? (
        <ChartCard
          title={t("analytics.courier.matrix.title")}
          description={t("analytics.courier.matrix.description")}
          summary={`${integerFormatter.format(totalShipments)} ${t("analytics.courier.shipments")}`}
          icon={<Truck />}
          accent="bg-amber-500/10 dark:bg-amber-500/15"
          config={{}}
        >
          <div className="overflow-x-auto">
            <table
              className="w-full border-separate border-spacing-0 text-sm"
              data-courier-matrix="true"
            >
              <thead>
                <tr className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="sticky start-0 z-10 border-b bg-muted/95 px-3 py-2 text-start backdrop-blur">
                    {t("orders.wilaya")}
                  </th>
                  {matrix.providers.map((provider) => (
                    <th
                      key={provider}
                      className="border-b bg-muted/95 px-3 py-2 text-center font-medium"
                    >
                      {provider}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.wilayas.map((wilaya) => {
                  const wilayaCode = WILAYA_CODE_BY_NAME.get(
                    wilaya.toLowerCase(),
                  );
                  return (
                    <tr key={wilaya}>
                      <th
                        scope="row"
                        className="sticky start-0 z-10 border-b bg-card px-3 py-2 text-start text-xs font-medium text-foreground backdrop-blur"
                      >
                        {wilaya}
                      </th>
                      {matrix.providers.map((provider) => {
                        const cell = cellByWilayaProvider.get(
                          `${wilaya}::${provider}`,
                        );
                        if (!cell) {
                          return (
                            <td
                              key={provider}
                              className="border-b px-3 py-2 text-center text-muted-foreground/50"
                            >
                              —
                            </td>
                          );
                        }
                        const drillDown = buildOrdersDrillDownUrl({
                          fromIso,
                          toIso,
                          status: "delivered",
                          ...(wilayaCode !== undefined
                            ? { wilayaCode }
                            : {}),
                        });
                        return (
                          <td
                            key={provider}
                            className="border-b p-1 text-center"
                          >
                            <Link
                              href={drillDown}
                              title={t("analytics.courier.viewDelivered")}
                              className={cn(
                                "block rounded-md px-2 py-1.5 text-xs font-medium tabular-nums transition-transform outline-none hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring",
                                cellTone(cell.successRate),
                              )}
                            >
                              {percentFormatter.format(cell.successRate / 100)}
                              <span className="ms-1 text-2xs opacity-75">
                                {integerFormatter.format(cell.delivered)}/
                                {integerFormatter.format(cell.shipments)}
                              </span>
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>
      ) : totalShipments > 0 ? (
        <ChartCard
          title={t("analytics.courier.matrix.title")}
          description={t("analytics.courier.matrix.description")}
          icon={<Truck />}
          accent="bg-amber-500/10 dark:bg-amber-500/15"
          config={{}}
        >
          <ChartEmpty message={t("analytics.courier.empty")} />
        </ChartCard>
      ) : null}
    </section>
  );
}
