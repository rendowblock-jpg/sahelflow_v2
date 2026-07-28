import type { OrderStatus } from "@/types/domain";
import type {
  CanonicalDeliveryState,
  CodFinancialState,
  ConfirmationState,
  FulfillmentState,
  OrderInventoryState,
  OrderLifecycleState,
  RefundLifecycleState,
  ReturnLifecycleState,
} from "./contracts";

export type ProjectionCertainty = "deterministic" | "ambiguous";

export interface LegacyProjectedState<TState> {
  value: TState | "unknown";
  certainty: ProjectionCertainty;
  reason: string;
}

export interface LegacyOrderAuthority {
  status: OrderStatus;
  codCollected: boolean | null;
  codRemitted: boolean;
  /**
   * Whether the compatibility reader explicitly inspected the Delivery relation.
   * Undefined means the caller has only order-level status and must not infer
   * absence of a provider/shipment row.
   */
  deliveryExists?: boolean;
  refundCount?: number;
  activeRefundAmount?: number;
  totalPrice?: number;
}

export interface LegacyOrderProjection {
  source: "legacy_order_projection";
  order: LegacyProjectedState<OrderLifecycleState>;
  confirmation: LegacyProjectedState<ConfirmationState>;
  fulfillment: LegacyProjectedState<FulfillmentState>;
  delivery: LegacyProjectedState<CanonicalDeliveryState>;
  inventory: LegacyProjectedState<OrderInventoryState>;
  cod: LegacyProjectedState<CodFinancialState>;
  returns: LegacyProjectedState<ReturnLifecycleState>;
  refund: LegacyProjectedState<RefundLifecycleState>;
  requiresReview: boolean;
  warnings: readonly string[];
  provenFactIds: readonly string[];
}

function deterministic<TState>(value: TState, reason: string): LegacyProjectedState<TState> {
  return { value, certainty: "deterministic", reason };
}

function ambiguous<TState>(
  value: TState | "unknown",
  reason: string,
): LegacyProjectedState<TState> {
  return { value, certainty: "ambiguous", reason };
}

function projectOrder(status: OrderStatus): LegacyProjectedState<OrderLifecycleState> {
  switch (status) {
    case "draft":
      return deterministic("draft", "Legacy draft has not been submitted as an intended order");
    case "pending":
      return deterministic("submitted", "Legacy pending represents submitted work awaiting confirmation");
    case "confirmed":
    case "shipped":
      return deterministic("active", `Legacy ${status} remains operationally active`);
    case "delivered":
    case "returned":
    case "refused":
      return deterministic("completed", `Legacy ${status} ended the operational order path`);
    case "cancelled":
      return deterministic("cancelled", "Legacy cancellation is an explicit terminal order decision");
  }
}

function projectConfirmation(status: OrderStatus): LegacyProjectedState<ConfirmationState> {
  if (status === "draft") {
    return deterministic("not_requested", "Draft has not entered confirmation");
  }
  if (status === "pending") {
    return deterministic("pending", "Legacy pending is the confirmation queue state");
  }
  if (status === "cancelled") {
    return ambiguous<ConfirmationState>(
      "unknown",
      "Legacy cancellation does not preserve whether confirmation was rejected or later cancelled",
    );
  }
  if (status === "refused") {
    return deterministic("confirmed", "Legacy refused is reachable only after confirmation in the current transition graph");
  }
  return deterministic("confirmed", `Legacy ${status} is downstream of confirmation`);
}

function projectFulfillment(status: OrderStatus): LegacyProjectedState<FulfillmentState> {
  if (status === "draft" || status === "pending" || status === "confirmed") {
    return deterministic("unfulfilled", `Legacy ${status} has not recorded shipment`);
  }
  if (status === "shipped") {
    return deterministic("shipped", "Legacy shipped explicitly records fulfillment handoff");
  }
  if (status === "delivered" || status === "returned" || status === "refused") {
    return deterministic("closed", `Legacy ${status} is downstream of shipment`);
  }
  return ambiguous<FulfillmentState>(
    "unknown",
    "Legacy cancellation does not preserve whether fulfillment had started",
  );
}

function projectDelivery(
  authority: LegacyOrderAuthority,
): LegacyProjectedState<CanonicalDeliveryState> {
  switch (authority.status) {
    case "draft":
    case "pending":
    case "confirmed":
      if (authority.deliveryExists === false) {
        return deterministic(
          "not_created",
          `The compatibility reader verified that the legacy ${authority.status} order has no Delivery row`,
        );
      }
      if (authority.deliveryExists === true) {
        return ambiguous(
          "pending",
          `A Delivery row exists while the legacy order remains ${authority.status}; inspect provider state instead of inferring from Order.status`,
        );
      }
      return ambiguous<CanonicalDeliveryState>(
        "unknown",
        `Legacy ${authority.status} status alone cannot prove whether a Delivery row already exists`,
      );
    case "shipped":
      return ambiguous("in_transit", "Legacy shipped does not preserve the courier's exact delivery state");
    case "delivered":
      return deterministic("delivered", "Legacy delivered explicitly records customer delivery");
    case "refused":
      return ambiguous("refused", "Legacy refused does not preserve physical return receipt");
    case "returned":
      return ambiguous("returned", "Legacy returned conflates delivery return, customer return and physical receipt");
    case "cancelled":
      return ambiguous<CanonicalDeliveryState>(
        "unknown",
        "Legacy cancellation does not preserve whether a delivery existed",
      );
  }
}

function projectInventory(status: OrderStatus): LegacyProjectedState<OrderInventoryState> {
  if (status === "draft" || status === "pending") {
    return deterministic("unreserved", "The legacy service does not deduct stock before confirmation");
  }
  if (status === "confirmed") {
    return ambiguous("reserved", "Legacy confirmation directly decremented mutable stock without a reservation fact");
  }
  if (status === "shipped" || status === "delivered") {
    return ambiguous("outbound", "Legacy status implies outbound stock but has no append-only movement proof");
  }
  if (status === "returned" || status === "refused") {
    return ambiguous<OrderInventoryState>(
      "unknown",
      "Legacy stock restoration does not prove physical receipt or disposition",
    );
  }
  return ambiguous<OrderInventoryState>(
    "unknown",
    "Legacy cancellation may be pre- or post-confirmation and lacks reservation identity",
  );
}

function projectCod(authority: LegacyOrderAuthority): LegacyProjectedState<CodFinancialState> {
  if (authority.codRemitted) {
    return ambiguous("remitted", "Legacy remitted boolean lacks settlement lines, fees and discrepancy facts");
  }
  if (authority.codCollected) {
    return ambiguous("collected", "Legacy collected boolean lacks an explicit carrier receivable movement");
  }
  if (authority.status === "delivered") {
    return ambiguous("receivable", "Delivery should create a receivable, but legacy rows may not have recorded collection truth");
  }
  if (["draft", "pending", "confirmed", "cancelled", "refused", "returned"].includes(authority.status)) {
    return ambiguous<CodFinancialState>(
      "unknown",
      "Legacy status and COD booleans cannot prove whether money was expected or later corrected",
    );
  }
  return ambiguous<CodFinancialState>(
    "unknown",
    "Legacy shipped state does not prove collection or receivable creation",
  );
}

function projectReturn(status: OrderStatus): LegacyProjectedState<ReturnLifecycleState> {
  if (status === "returned") {
    return ambiguous("completed", "Legacy returned does not distinguish request, receipt, inspection and completion");
  }
  if (status === "refused") {
    return ambiguous("in_transit", "Legacy refused does not prove that the parcel physically returned");
  }
  return ambiguous("none", "Absence of legacy returned status does not prove that no return workflow exists");
}

function projectRefund(authority: LegacyOrderAuthority): LegacyProjectedState<RefundLifecycleState> {
  const count = authority.refundCount ?? 0;
  const amount = authority.activeRefundAmount ?? 0;
  const total = authority.totalPrice;
  if (count === 0) {
    return ambiguous("none", "Legacy order status does not contain refund authority; Refund rows must be inspected separately");
  }
  if (total !== undefined && amount > 0 && amount < total) {
    return ambiguous("partially_refunded", "Legacy Refund rows show a partial amount but no append-only financial movement");
  }
  if (total !== undefined && amount >= total) {
    return ambiguous("refunded", "Legacy Refund rows show the order total refunded but compensation facts remain incomplete");
  }
  return ambiguous<RefundLifecycleState>(
    "unknown",
    "Legacy Refund rows exist but the effective amount is not available",
  );
}

export function projectLegacyOrderAuthority(
  authority: LegacyOrderAuthority,
): LegacyOrderProjection {
  const projection = {
    source: "legacy_order_projection" as const,
    order: projectOrder(authority.status),
    confirmation: projectConfirmation(authority.status),
    fulfillment: projectFulfillment(authority.status),
    delivery: projectDelivery(authority),
    inventory: projectInventory(authority.status),
    cod: projectCod(authority),
    returns: projectReturn(authority.status),
    refund: projectRefund(authority),
  };

  const dimensions = [
    projection.order,
    projection.confirmation,
    projection.fulfillment,
    projection.delivery,
    projection.inventory,
    projection.cod,
    projection.returns,
    projection.refund,
  ];
  const ambiguousDimensions = dimensions.filter((dimension) => dimension.certainty === "ambiguous");

  return {
    ...projection,
    requiresReview: ambiguousDimensions.length > 0,
    warnings: [
      "This is a compatibility projection, not canonical event or movement evidence.",
      "Do not create DomainEvent, InventoryMovement or FinancialMovement rows from this projection without a governed backfill decision.",
      ...ambiguousDimensions.map((dimension) => dimension.reason),
    ],
    provenFactIds: [],
  };
}
