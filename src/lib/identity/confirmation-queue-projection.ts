import "server-only";

import {
  assertTrustedAction,
  trustedActionAllowed,
} from "./authorization";
import type { TrustedActorContext } from "./trusted-actor";
import {
  isImportPendingOrderAuthority,
  isTrustedManualOrderAuthority,
} from "@/lib/orders/manual-order-authority";

export type ConfirmationQueueFieldAccess = Readonly<{
  contact: boolean;
  financials: boolean;
  update: boolean;
}>;

type ConfirmationQueueSource = readonly Readonly<{
  id: string;
  orderNumber: string;
  totalPrice: number;
  wilaya: string;
  phone: string;
  source: unknown;
  sourceMetadata: unknown;
  version: number;
  ageMinutes: number;
  isStale: boolean;
  ageLabel: string;
  customer: Readonly<{ name: string | null; phone: string | null }> | null;
}>[];

function allowed(
  actorContext: TrustedActorContext,
  action: Parameters<typeof trustedActionAllowed>[1],
): boolean {
  return trustedActionAllowed(actorContext, action, {
    shopId: actorContext.shop.shopId,
  });
}

/** Resolve queue field and mutation decisions before reading private rows. */
export function resolveConfirmationQueueFieldAccess(
  actorContext: TrustedActorContext,
): ConfirmationQueueFieldAccess {
  assertTrustedAction(actorContext, "orders.read", {
    shopId: actorContext.shop.shopId,
  });
  return Object.freeze({
    contact: allowed(actorContext, "customers.contact.read"),
    financials: allowed(actorContext, "orders.financials.read"),
    update: allowed(actorContext, "orders.update"),
  });
}

/** Strip denied contact, location and money fields before rendering the queue. */
export function projectConfirmationQueueForTrustedActor(
  source: ConfirmationQueueSource,
  fieldAccess: ConfirmationQueueFieldAccess,
) {
  return Object.freeze(
    source.map((order) => {
      const mutationAuthority = isTrustedManualOrderAuthority(
        order.source,
        order.sourceMetadata,
      )
        ? ("canonical_v1" as const)
        : isImportPendingOrderAuthority(order.source, order.sourceMetadata)
          ? ("confirmation_blocked" as const)
          : ("legacy_compatibility" as const);
      return Object.freeze({
        id: order.id,
        orderNumber: order.orderNumber,
        version: order.version,
        ageMinutes: order.ageMinutes,
        isStale: order.isStale,
        ageLabel: order.ageLabel,
        mutationAuthority,
        canUpdate: fieldAccess.update,
        customerName: fieldAccess.contact ? order.customer?.name ?? null : null,
        phone: fieldAccess.contact
          ? order.customer?.phone ?? order.phone
          : null,
        wilaya: fieldAccess.contact ? order.wilaya : null,
        totalPrice: fieldAccess.financials ? order.totalPrice : null,
      });
    }),
  );
}
