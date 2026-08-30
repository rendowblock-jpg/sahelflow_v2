/**
 * Courier performance server loader (R4-d).
 *
 * Loads shipments (Delivery rows + their order projections) created inside the
 * resolved analytics range and delegates aggregation to the pure
 * courier-metrics computations. Shop scoping comes from the shop-routed db
 * client. Fees are a financial field: callers pass the actor's
 * analytics.financials.read verdict so fee data never reaches an actor that
 * must not see it.
 */
import "server-only";

import { db } from "@/lib/db";
import {
  buildWilayaCourierMatrix,
  computeCourierMetrics,
  type CourierPerformanceMetrics,
  type WilayaCourierMatrix,
} from "@/lib/analytics/courier-metrics";
import type { ResolvedAnalyticsRange } from "@/lib/analytics/range";

export interface CourierPerformanceResult {
  providers: CourierPerformanceMetrics[];
  matrix: WilayaCourierMatrix;
  /** Total shipments in the window across couriers. */
  totalShipments: number;
  /** False when fee columns must be hidden (financial field access denied). */
  feesIncluded: boolean;
}

/**
 * Per-courier COD economics for the range: delivery rate, avg delivery days,
 * return/refusal rate, shipment counts, fees, plus the wilaya × courier
 * success-rate matrix over the top-10 wilayas by volume.
 */
export async function getCourierPerformance(
  range: ResolvedAnalyticsRange,
  options: { includeFees?: boolean } = {},
): Promise<CourierPerformanceResult> {
  const includeFees = options.includeFees ?? true;

  const deliveries = await db.delivery.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: range.from, lt: range.toExclusive },
    },
    select: {
      provider: true,
      status: true,
      createdAt: true,
      cost: true,
      order: {
        select: {
          status: true,
          wilaya: true,
          shippedAt: true,
          deliveredAt: true,
          deliveryCost: true,
        },
      },
    },
  });

  const rows = deliveries.map((delivery) => ({
    provider: delivery.provider,
    status: delivery.status,
    orderStatus: delivery.order?.status ?? "",
    wilaya: delivery.order?.wilaya ?? "",
    shippedAt: delivery.createdAt,
    orderShippedAt: delivery.order?.shippedAt ?? null,
    deliveredAt: delivery.order?.deliveredAt ?? null,
    fee: includeFees
      ? (delivery.cost ?? delivery.order?.deliveryCost ?? null)
      : null,
  }));

  return {
    providers: computeCourierMetrics(rows, { includeFees }),
    matrix: buildWilayaCourierMatrix(rows, { wilayaLimit: 10 }),
    totalShipments: rows.length,
    feesIncluded: includeFees,
  };
}
