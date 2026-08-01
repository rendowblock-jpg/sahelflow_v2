import "server-only";

import type { z } from "zod";

import { updateOrderSchema } from "@/lib/validation";
import { assertTrustedAction } from "./authorization";
import type { TrustedActorContext } from "./trusted-actor";

type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

/**
 * Manual/source order intake always writes customer contact and price-bearing
 * order state. Both field domains must be explicitly granted; `orders.create`
 * alone cannot become a side door around field permissions.
 */
export function assertOrderCreateFieldAuthority(
  actorContext: TrustedActorContext,
): void {
  const resource = { shopId: actorContext.shop.shopId };
  assertTrustedAction(actorContext, "customers.contact.read", resource);
  assertTrustedAction(actorContext, "customers.contact.update", resource);
  assertTrustedAction(actorContext, "orders.financials.read", resource);
  assertTrustedAction(actorContext, "orders.financials.update", resource);
}

const CONTACT_FIELDS = new Set<keyof UpdateOrderInput>([
  "notes",
  "address",
  "wilaya",
  "commune",
  "phone",
]);
const FINANCIAL_FIELDS = new Set<keyof UpdateOrderInput>([
  "deliveryCost",
  "totalPrice",
  "items",
]);

/**
 * Enforce field-write authority before a compatibility order update begins.
 * `orders.update` grants the mutation surface, while protected contact and
 * financial fields require their own explicit write actions.
 */
export function assertOrderUpdateFieldAuthority(
  actorContext: TrustedActorContext,
  input: UpdateOrderInput,
): void {
  const fields = Object.keys(input) as Array<keyof UpdateOrderInput>;
  const resource = { shopId: actorContext.shop.shopId };

  if (fields.some((field) => CONTACT_FIELDS.has(field))) {
    assertTrustedAction(actorContext, "customers.contact.read", resource);
    assertTrustedAction(actorContext, "customers.contact.update", resource);
  }
  if (fields.some((field) => FINANCIAL_FIELDS.has(field))) {
    assertTrustedAction(actorContext, "orders.financials.read", resource);
    assertTrustedAction(actorContext, "orders.financials.update", resource);
  }
}
