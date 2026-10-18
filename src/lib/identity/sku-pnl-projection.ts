import "server-only";

import { trustedActionAllowed } from "./authorization";
import type { TrustedActorContext } from "./trusted-actor";

interface SkuPnlCostFields {
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
}

export type ProjectedSkuPnlRow<T extends SkuPnlCostFields> = Omit<
  T,
  "cost" | "margin" | "marginPct"
> & {
  cost: number | null;
  margin: number | null;
  marginPct: number | null;
};

export interface ProjectedSkuPnl<T extends SkuPnlCostFields> {
  rows: ProjectedSkuPnlRow<T>[];
  fieldAccess: Readonly<{ cost: boolean }>;
}

/**
 * Project SKU P&L rows for the Analytics page (MNY-20).
 *
 * Margin is revenue minus cost, so showing margin to a member without
 * products.cost.read would hand them the product cost. Without that grant the
 * cost, margin and margin % are null, and rows are ordered by revenue so the
 * row order cannot rank products by margin either.
 */
export function projectSkuPnlForTrustedActor<T extends SkuPnlCostFields>(
  actorContext: TrustedActorContext,
  rows: readonly T[],
): ProjectedSkuPnl<T> {
  const cost = trustedActionAllowed(actorContext, "products.cost.read", {
    shopId: actorContext.shop.shopId,
  });
  if (cost) {
    return {
      rows: rows.map((row) => ({ ...row }) as unknown as ProjectedSkuPnlRow<T>),
      fieldAccess: Object.freeze({ cost: true }),
    };
  }
  const withheld = rows
    .map(
      (row) =>
        ({
          ...row,
          cost: null,
          margin: null,
          marginPct: null,
        }) as unknown as ProjectedSkuPnlRow<T> & { revenue: number },
    )
    .sort((a, b) => b.revenue - a.revenue);
  return {
    rows: withheld,
    fieldAccess: Object.freeze({ cost: false }),
  };
}
