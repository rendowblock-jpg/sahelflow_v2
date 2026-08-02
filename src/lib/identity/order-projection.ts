import "server-only";

import type { Order, OrderItem } from "@/types/domain";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "./authorization";
import type { TrustedActorContext } from "./trusted-actor";

export type ProjectedOrderItem = Omit<OrderItem, "unitPrice" | "total"> & {
  unitPrice: number | null;
  total: number | null;
};

export type ProjectedOrder = Omit<
  Order,
  | "phone"
  | "address"
  | "notes"
  | "totalPrice"
  | "deliveryCost"
  | "items"
> & {
  phone: string | null;
  address: string | null;
  notes: string | null;
  totalPrice: number | null;
  deliveryCost: number | null;
  items: ProjectedOrderItem[];
  fieldAccess: Readonly<{
    contact: boolean;
    financials: boolean;
  }>;
};

/**
 * Produce one permission-filtered operational order projection.
 *
 * `orders.read` is mandatory. Contact and financial values are independently
 * denied unless their exact action is present. Null is an explicit redaction,
 * not a claim that the source value is absent.
 */
export function projectOrderForTrustedActor(
  actorContext: TrustedActorContext,
  order: Order,
): ProjectedOrder {
  assertTrustedAction(actorContext, "orders.read", {
    shopId: actorContext.shop.shopId,
  });
  const contact = trustedActionAllowed(
    actorContext,
    "customers.contact.read",
    { shopId: actorContext.shop.shopId },
  );
  const financials = trustedActionAllowed(
    actorContext,
    "orders.financials.read",
    { shopId: actorContext.shop.shopId },
  );

  return Object.freeze({
    ...order,
    phone: contact ? order.phone : null,
    address: contact ? order.address : null,
    notes: contact ? order.notes : null,
    totalPrice: financials ? order.totalPrice : null,
    deliveryCost: financials ? order.deliveryCost : null,
    items: order.items.map((item) =>
      Object.freeze({
        ...item,
        unitPrice: financials ? item.unitPrice : null,
        total: financials ? item.total : null,
      }),
    ),
    fieldAccess: Object.freeze({ contact, financials }),
  });
}

export function projectOrdersForTrustedActor(
  actorContext: TrustedActorContext,
  orders: readonly Order[],
): readonly ProjectedOrder[] {
  return Object.freeze(
    orders.map((order) => projectOrderForTrustedActor(actorContext, order)),
  );
}
