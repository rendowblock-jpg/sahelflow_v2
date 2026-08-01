import "server-only";

import type { Product } from "@/types/domain";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "./authorization";
import type { TrustedActorContext } from "./trusted-actor";

export type ProjectedProduct = Omit<Product, "cost"> & {
  cost: number | null;
  fieldAccess: Readonly<{ cost: boolean }>;
};

/** Project catalog data without exposing unit cost or storage-only fields. */
export function projectProductForTrustedActor(
  actorContext: TrustedActorContext,
  product: Product,
): ProjectedProduct {
  assertTrustedAction(actorContext, "products.read", {
    shopId: actorContext.shop.shopId,
  });
  const cost = trustedActionAllowed(actorContext, "products.cost.read", {
    shopId: actorContext.shop.shopId,
  });
  const source = product as Product & { deletedAt?: unknown };
  const { deletedAt: _deletedAt, ...safe } = source;

  return Object.freeze({
    ...safe,
    cost: cost ? product.cost : null,
    fieldAccess: Object.freeze({ cost }),
  });
}

export function projectProductsForTrustedActor(
  actorContext: TrustedActorContext,
  products: readonly Product[],
): ProjectedProduct[] {
  return products.map((product) =>
    projectProductForTrustedActor(actorContext, product),
  );
}
