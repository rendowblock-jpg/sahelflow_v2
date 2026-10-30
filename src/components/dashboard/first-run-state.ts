import type { FirstRunCounts } from "@/lib/data/first-run-counts";
import type { LicenseClientProjection } from "@/stores/license-store";

export type { FirstRunCounts };

export type FirstRunStepId = "product" | "order" | "delivery";

/** Real routes: `?create=1` opens the create dialog on those list pages. */
export const FIRST_RUN_HREFS = {
  product: "/products?create=1",
  whatsapp: "/inbox",
  order: "/orders?create=1",
  delivery: "/settings?group=delivery",
} as const;

export interface FirstRunStep {
  id: FirstRunStepId;
  done: boolean;
}

export interface FirstRunResolution {
  /** True only for a shop with no orders, no products and no customers. */
  show: boolean;
  steps: readonly FirstRunStep[];
  doneCount: number;
  total: number;
}

/**
 * Decide whether the dashboard is the first-run panel, and which steps are
 * ticked. Ticks come from the real counts; an unknown count (null: no
 * permission to read it) never shows the panel and never ticks a step.
 */
export function resolveFirstRun(
  counts: FirstRunCounts,
  extras: { deliveryPricesSet?: boolean } = {},
): FirstRunResolution {
  const show =
    counts.orders === 0 && counts.products === 0 && counts.customers === 0;
  const steps: readonly FirstRunStep[] = [
    { id: "product", done: (counts.products ?? 0) > 0 },
    { id: "order", done: (counts.orders ?? 0) > 0 },
    { id: "delivery", done: extras.deliveryPricesSet === true },
  ];
  return {
    show,
    steps,
    doneCount: steps.filter((step) => step.done).length,
    total: steps.length,
  };
}

const DAY_MS = 86_400_000;

/** Whole days left on a running trial (a part day counts), else null. */
export function trialDaysLeft(
  projection: Pick<LicenseClientProjection, "status" | "type" | "expiresAt"> | null,
  now: number,
): number | null {
  if (
    !projection ||
    projection.status !== "valid" ||
    projection.type !== "trial" ||
    !projection.expiresAt
  ) {
    return null;
  }
  const end = Date.parse(projection.expiresAt);
  if (!Number.isFinite(end)) return null;
  const left = end - now;
  return left > 0 ? Math.ceil(left / DAY_MS) : null;
}
