import "server-only";

import type { z } from "zod";

import {
  createCustomerSchema,
  updateCustomerSchema,
} from "@/lib/validation";
import { assertTrustedAction } from "./authorization";
import type { TrustedActorContext } from "./trusted-actor";

type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

const CONTACT_FIELDS = new Set<keyof CreateCustomerInput>([
  "name",
  "phone",
  "phone2",
  "wilaya",
  "commune",
  "address",
  "notes",
]);

/** Customer creation always persists protected contact data. */
export function assertCustomerCreateFieldAuthority(
  actorContext: TrustedActorContext,
): void {
  assertTrustedAction(actorContext, "customers.contact.update", {
    shopId: actorContext.shop.shopId,
  });
}

/** Enforce contact-write authority before any protected customer update. */
export function assertCustomerUpdateFieldAuthority(
  actorContext: TrustedActorContext,
  input: UpdateCustomerInput,
): void {
  const fields = Object.keys(input) as Array<keyof UpdateCustomerInput>;
  if (fields.some((field) => CONTACT_FIELDS.has(field))) {
    assertTrustedAction(actorContext, "customers.contact.update", {
      shopId: actorContext.shop.shopId,
    });
  }
}
