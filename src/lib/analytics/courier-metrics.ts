/**
 * Courier-dimension metrics (R4-d) — the #1 COD cost lever.
 *
 * Pure computations over shipment rows loaded by the server loader
 * (src/lib/analytics/courier-performance.ts). Keeping the math here makes the
 * delivery-rate / avg-delivery-days / fee aggregation contract-testable without
 * a database, mirroring how analyticsService exposes pure builders.
 *
 * Status vocabulary mirrors the Delivery sync adapters + order lifecycle:
 *   delivery: pending | created | picked_up | in_transit | at_hub |
 *             out_for_delivery | delivered | returned | refused | failed | cancelled
 *   order:    pending | confirmed | shipped | delivered | returned | refused | cancelled
 */

const DELIVERED = "delivered";
const RETURN_STATUSES = new Set(["returned", "refused"]);
const FAILED_STATUSES = new Set(["failed", "cancelled"]);
const ACTIVE_DELIVERY_STATUSES = new Set([
  "pending",
  "created",
  "picked_up",
  "in_transit",
  "at_hub",
  "out_for_delivery",
]);
const ACTIVE_ORDER_STATUSES = new Set(["confirmed", "shipped"]);

const MS_PER_DAY = 86_400_000;

/** One shipment (Delivery row + its order projection) inside the range. */
export interface CourierShipmentRow {
  provider: string;
  /** Delivery.status (courier sync authority). */
  status: string;
  /** Order.status (order lifecycle authority). */
  orderStatus: string;
  wilaya: string;
  /** Delivery.createdAt — when the parcel was handed to the courier. */
  shippedAt: Date;
  /** Order.shippedAt (preferred) — null when the order was never marked shipped. */
  orderShippedAt: Date | null;
  /** Order.deliveredAt — null until the COD parcel is delivered. */
  deliveredAt: Date | null;
  /** Resolved fee in integer DZD: Delivery.cost ?? Order.deliveryCost ?? null. */
  fee: number | null;
}

export interface CourierPerformanceMetrics {
  provider: string;
  /** Shipments created in the window. */
  shipments: number;
  delivered: number;
  /** Returned + refused (the COD cash-loss outcome). */
  returned: number;
  /** Still moving (not delivered, not returned, not failed). */
  inTransit: number;
  /** Courier-reported failures + cancellations. */
  failed: number;
  /** delivered / shipments, 0-100 (integer percent). */
  deliveryRate: number;
  /** returned / shipments, 0-100 (integer percent). */
  returnRate: number;
  /**
   * Mean deliveredAt − shippedAt in days over the delivered shipments that
   * carry both timestamps. One decimal. Null when no timestamped delivery.
   */
  avgDeliveryDays: number | null;
  /** Delivered shipments that contributed to avgDeliveryDays. */
  deliveryDaySamples: number;
  /** Sum of resolved fees in integer DZD; null when fees are not computed. */
  totalFees: number | null;
}

export interface WilayaCourierCell {
  wilaya: string;
  provider: string;
  shipments: number;
  delivered: number;
  /** delivered / shipments, 0-100 (integer percent). */
  successRate: number;
}

export interface WilayaCourierMatrix {
  /** Top wilayas by shipment volume, volume-descending. */
  wilayas: string[];
  /** Providers by total shipment volume, volume-descending. */
  providers: string[];
  cells: WilayaCourierCell[];
}

function isDelivered(row: CourierShipmentRow): boolean {
  return row.status === DELIVERED || row.orderStatus === DELIVERED;
}

function isReturned(row: CourierShipmentRow): boolean {
  return (
    RETURN_STATUSES.has(row.status) || RETURN_STATUSES.has(row.orderStatus)
  );
}

function isInTransit(row: CourierShipmentRow): boolean {
  if (isDelivered(row) || isReturned(row)) return false;
  return (
    ACTIVE_DELIVERY_STATUSES.has(row.status) ||
    ACTIVE_ORDER_STATUSES.has(row.orderStatus)
  );
}

function isFailed(row: CourierShipmentRow): boolean {
  return (
    FAILED_STATUSES.has(row.status) || FAILED_STATUSES.has(row.orderStatus)
  );
}

/** Delivery-day sample: shipped → delivered, only when both ends are known. */
function deliveryDays(row: CourierShipmentRow): number | null {
  if (!row.deliveredAt) return null;
  const start = row.orderShippedAt ?? row.shippedAt;
  const elapsed = row.deliveredAt.getTime() - start.getTime();
  if (elapsed < 0) return null;
  return elapsed / MS_PER_DAY;
}

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/** Aggregate per-courier COD economics for the window. */
export function computeCourierMetrics(
  rows: readonly CourierShipmentRow[],
  options: { includeFees?: boolean } = {},
): CourierPerformanceMetrics[] {
  const includeFees = options.includeFees ?? true;
  const groups = new Map<
    string,
    {
      shipments: number;
      delivered: number;
      returned: number;
      inTransit: number;
      failed: number;
      dayTotal: number;
      daySamples: number;
      fees: number;
      feeSamples: number;
    }
  >();

  for (const row of rows) {
    if (!row.provider) continue;
    let group = groups.get(row.provider);
    if (!group) {
      group = {
        shipments: 0,
        delivered: 0,
        returned: 0,
        inTransit: 0,
        failed: 0,
        dayTotal: 0,
        daySamples: 0,
        fees: 0,
        feeSamples: 0,
      };
      groups.set(row.provider, group);
    }
    group.shipments += 1;
    if (isDelivered(row)) {
      group.delivered += 1;
      const days = deliveryDays(row);
      if (days !== null) {
        group.dayTotal += days;
        group.daySamples += 1;
      }
    } else if (isReturned(row)) {
      group.returned += 1;
    } else if (isFailed(row)) {
      group.failed += 1;
    } else if (isInTransit(row)) {
      group.inTransit += 1;
    }
    if (includeFees && row.fee !== null) {
      group.fees += row.fee;
      group.feeSamples += 1;
    }
  }

  return Array.from(groups.entries())
    .map(([provider, group]) => ({
      provider,
      shipments: group.shipments,
      delivered: group.delivered,
      returned: group.returned,
      inTransit: group.inTransit,
      failed: group.failed,
      deliveryRate: percent(group.delivered, group.shipments),
      returnRate: percent(group.returned, group.shipments),
      avgDeliveryDays:
        group.daySamples > 0
          ? Math.round((group.dayTotal / group.daySamples) * 10) / 10
          : null,
      deliveryDaySamples: group.daySamples,
      totalFees: includeFees
        ? group.feeSamples > 0
          ? group.fees
          : null
        : null,
    }))
    .sort(
      (a, b) =>
        b.shipments - a.shipments || a.provider.localeCompare(b.provider),
    );
}

/**
 * Wilaya × courier success-rate matrix over the top wilayas by volume.
 *
 * Cells carry raw counts plus the integer success rate so the caller can tint
 * (tone) and localize without re-computing.
 */
export function buildWilayaCourierMatrix(
  rows: readonly CourierShipmentRow[],
  options: { wilayaLimit?: number } = {},
): WilayaCourierMatrix {
  const wilayaLimit = options.wilayaLimit ?? 10;
  const byWilaya = new Map<string, Map<string, { total: number; delivered: number }>>();

  for (const row of rows) {
    if (!row.provider || !row.wilaya) continue;
    let providers = byWilaya.get(row.wilaya);
    if (!providers) {
      providers = new Map();
      byWilaya.set(row.wilaya, providers);
    }
    let cell = providers.get(row.provider);
    if (!cell) {
      cell = { total: 0, delivered: 0 };
      providers.set(row.provider, cell);
    }
    cell.total += 1;
    if (isDelivered(row)) cell.delivered += 1;
  }

  const wilayas = Array.from(byWilaya.entries())
    .sort(
      (a, b) =>
        sumShipments(b[1]) - sumShipments(a[1]) || a[0].localeCompare(b[0]),
    )
    .slice(0, wilayaLimit);

  const providerTotals = new Map<string, number>();
  for (const [, providers] of wilayas) {
    for (const [provider, cell] of providers) {
      providerTotals.set(
        provider,
        (providerTotals.get(provider) ?? 0) + cell.total,
      );
    }
  }
  const providers = Array.from(providerTotals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([provider]) => provider);

  const cells: WilayaCourierCell[] = [];
  for (const [wilaya, providers_] of wilayas) {
    for (const [provider, cell] of providers_) {
      cells.push({
        wilaya,
        provider,
        shipments: cell.total,
        delivered: cell.delivered,
        successRate: percent(cell.delivered, cell.total),
      });
    }
  }

  return { wilayas: wilayas.map(([wilaya]) => wilaya), providers, cells };
}

function sumShipments(
  providers: Map<string, { total: number; delivered: number }>,
): number {
  let total = 0;
  for (const cell of providers.values()) total += cell.total;
  return total;
}

export type CourierCellTone = "success" | "warning" | "danger" | "empty";

/**
 * Presentation tone for a success-rate cell. Algerian COD norms: ≥80% is a
 * healthy courier/wilaya pair, 60-80% costs money, below 60% burns cash.
 */
export function courierCellTone(successRate: number): CourierCellTone {
  if (successRate >= 80) return "success";
  if (successRate >= 60) return "warning";
  return "danger";
}
