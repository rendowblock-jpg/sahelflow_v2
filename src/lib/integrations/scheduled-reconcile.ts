import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { classifyWorkerFailure } from "@/lib/integrations/worker-health";
import type { EcommercePlatform } from "@/lib/integrations/ecommerce/types";
import { isCanonicalOrderAuthority } from "@/lib/orders/manual-order-authority";

/**
 * INT-03: a desktop cannot receive webhooks, so the app asks. Before this,
 * courier statuses and commerce orders moved only when the seller pressed a
 * button; a parcel delivered or refused never updated the order, the cash
 * position or the stock until someone pressed "sync" on that very parcel.
 *
 * One cycle, run by the background worker while the app is open:
 *  - courier: a bounded share of the open canonical deliveries is synced
 *    through the same function the button uses (synchronizeCanonicalCourierTracking),
 *    so events, idempotency and the order version are the existing ones;
 *  - commerce: a sync run is queued for each platform that has saved
 *    credentials, through the same queue the button uses (it replays an active
 *    run instead of duplicating it).
 *
 * Nothing here talks to a provider directly and nothing here stores anything:
 * the cursor and the clocks live in memory, so a restart simply starts a fresh
 * sweep. Only failure CODES are ever reported (INT-10), never a message.
 */

export const RECONCILE_INTERVAL_MS = 10 * 60_000;
/** Deliveries synced per cycle. A sweep of N open parcels takes ceil(N / this) cycles. */
export const COURIER_PER_CYCLE = 40;
/** After this many failures in a row for one provider the cycle stops calling it. */
export const COURIER_PROVIDER_FAILURE_LIMIT = 3;
/**
 * The delivery statuses for which the courier position offers a "sync" action
 * (canonical-courier-effect-runtime.ts, getCanonicalCourierPosition). A test
 * pins this list against that function so the two cannot drift apart.
 */
export const OPEN_COURIER_STATUSES = [
  "created",
  "picked_up",
  "in_transit",
  "at_hub",
  "out_for_delivery",
] as const;
export const COMMERCE_PLATFORMS = ["shopify", "woocommerce", "youcan"] as const;

export interface ReconcileState {
  /** Last delivery id handled; the next cycle continues after it. null = start over. */
  courierCursor: string | null;
  lastCourierAt: number;
  lastCommerceAt: Partial<Record<EcommercePlatform, number>>;
}

export function newReconcileState(): ReconcileState {
  return { courierCursor: null, lastCourierAt: 0, lastCommerceAt: {} };
}

export interface ReconcileDeps {
  syncCourier(context: ServiceContext, orderId: string): Promise<unknown>;
  queueCommerce(
    context: ServiceContext,
    platform: EcommercePlatform,
  ): Promise<unknown>;
  hasCommerceCredentials(
    context: ServiceContext,
    platform: EcommercePlatform,
  ): Promise<boolean>;
}

export interface ReconcileOptions {
  /** Epoch milliseconds; tests pass it, the worker leaves it out. */
  now?: number;
  intervalMs?: number;
  courierPerCycle?: number;
}

export interface ReconcileReport {
  courier: {
    ran: boolean;
    attempted: number;
    synced: number;
    failed: number;
    stoppedProviders: string[];
    failureCodes: Record<string, number>;
  };
  commerce: {
    queued: EcommercePlatform[];
    failed: number;
    failureCodes: Record<string, number>;
  };
}

function count(codes: Record<string, number>, error: unknown): void {
  const code = classifyWorkerFailure(error);
  codes[code] = (codes[code] ?? 0) + 1;
}

async function reconcileCourier(
  context: ServiceContext,
  state: ReconcileState,
  deps: ReconcileDeps,
  now: number,
  intervalMs: number,
  perCycle: number,
): Promise<ReconcileReport["courier"]> {
  const report: ReconcileReport["courier"] = {
    ran: false,
    attempted: 0,
    synced: 0,
    failed: 0,
    stoppedProviders: [],
    failureCodes: {},
  };
  if (now - state.lastCourierAt < intervalMs) return report;
  state.lastCourierAt = now;
  report.ran = true;

  const rows = await context.prisma.delivery.findMany({
    where: {
      deletedAt: null,
      status: { in: [...OPEN_COURIER_STATUSES] },
      trackingNumber: { not: null },
      // Demo records never reach a real courier (FD-052).
      NOT: { orderId: { startsWith: "demo-" } },
      order: {
        deletedAt: null,
        // A cheap narrowing only; isCanonicalOrderAuthority below decides.
        OR: [
          { sourceMetadata: { contains: "trusted-manual-v1" } },
          { sourceMetadata: { contains: "canonical-source-v1" } },
        ],
      },
      ...(state.courierCursor ? { id: { gt: state.courierCursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: perCycle,
    select: {
      id: true,
      orderId: true,
      provider: true,
      order: { select: { source: true, sourceMetadata: true } },
    },
  });
  // A short page means the end of the sweep: the next cycle starts over.
  state.courierCursor =
    rows.length < perCycle ? null : (rows[rows.length - 1]?.id ?? null);

  const failuresInARow = new Map<string, number>();
  const stopped = new Set<string>();
  for (const row of rows) {
    if (!isCanonicalOrderAuthority(row.order.source, row.order.sourceMetadata)) {
      continue;
    }
    if (stopped.has(row.provider)) continue;
    report.attempted += 1;
    try {
      await deps.syncCourier(context, row.orderId);
      report.synced += 1;
      failuresInARow.set(row.provider, 0);
    } catch (error) {
      report.failed += 1;
      count(report.failureCodes, error);
      const streak = (failuresInARow.get(row.provider) ?? 0) + 1;
      failuresInARow.set(row.provider, streak);
      if (streak >= COURIER_PROVIDER_FAILURE_LIMIT) {
        stopped.add(row.provider);
        report.stoppedProviders.push(row.provider);
      }
    }
  }
  return report;
}

async function reconcileCommerce(
  context: ServiceContext,
  state: ReconcileState,
  deps: ReconcileDeps,
  now: number,
  intervalMs: number,
): Promise<ReconcileReport["commerce"]> {
  const report: ReconcileReport["commerce"] = {
    queued: [],
    failed: 0,
    failureCodes: {},
  };
  for (const platform of COMMERCE_PLATFORMS) {
    if (now - (state.lastCommerceAt[platform] ?? 0) < intervalMs) continue;
    // Stamped before any work, so a failing platform waits a full interval
    // instead of being tried again on the next tick.
    state.lastCommerceAt[platform] = now;
    try {
      if (!(await deps.hasCommerceCredentials(context, platform))) continue;
      const integration = await context.prisma.integration.findUnique({
        where: { platform },
        select: { lastSyncAt: true },
      });
      if (
        integration?.lastSyncAt &&
        now - integration.lastSyncAt.getTime() < intervalMs
      ) {
        continue;
      }
      await deps.queueCommerce(context, platform);
      report.queued.push(platform);
    } catch (error) {
      report.failed += 1;
      count(report.failureCodes, error);
    }
  }
  return report;
}

export async function runScheduledReconcile(
  context: ServiceContext,
  state: ReconcileState,
  deps: ReconcileDeps,
  options: ReconcileOptions = {},
): Promise<ReconcileReport> {
  const now = options.now ?? Date.now();
  const intervalMs = options.intervalMs ?? RECONCILE_INTERVAL_MS;
  const courier = await reconcileCourier(
    context,
    state,
    deps,
    now,
    intervalMs,
    options.courierPerCycle ?? COURIER_PER_CYCLE,
  );
  const commerce = await reconcileCommerce(context, state, deps, now, intervalMs);
  return { courier, commerce };
}
