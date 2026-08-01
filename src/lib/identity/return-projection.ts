import "server-only";

import type { CanonicalCustomerReturnResult } from "@/lib/orders/canonical-customer-return";
import type { CanonicalCustomerReturnPosition } from "@/lib/orders/canonical-customer-return-projections";
import { trustedActionAllowed } from "./authorization";
import type { TrustedActorContext } from "./trusted-actor";

function canReadFinancials(actorContext: TrustedActorContext): boolean {
  return trustedActionAllowed(actorContext, "orders.financials.read", {
    shopId: actorContext.shop.shopId,
  });
}

export function projectCustomerReturnResult(
  actorContext: TrustedActorContext,
  result: CanonicalCustomerReturnResult,
) {
  const financials = canReadFinancials(actorContext);
  return {
    ...result,
    recordedLossAmount: financials ? result.recordedLossAmount : null,
    fieldAccess: { financials },
  };
}

export function projectCustomerReturnPosition(
  actorContext: TrustedActorContext,
  position: CanonicalCustomerReturnPosition,
) {
  const financials = canReadFinancials(actorContext);
  if (financials) return { ...position, fieldAccess: { financials } };

  return {
    ...position,
    receivableAmount: null,
    effectiveRefundAmount: null,
    remainingOrderRefundableAmount: null,
    orderItems: position.orderItems.map((item) => ({ ...item, unitPrice: null })),
    returnCase: position.returnCase
      ? {
          ...position.returnCase,
          itemValue: null,
          maximumWithDeliveryCost: null,
          effectiveRefundAmount: null,
          remainingItemRefundableAmount: null,
          exchangeDeliveryCost: null,
          requestedItems: position.returnCase.requestedItems.map((item) => ({
            ...item,
            unitPrice: null,
          })),
          exchangeItems: position.returnCase.exchangeItems.map((item) => ({
            ...item,
            unitPrice: null,
          })),
          inspections: position.returnCase.inspections.map((inspection) => ({
            ...inspection,
            unitCost: null,
            lossAmount: null,
          })),
        }
      : null,
    refunds: position.refunds.map((refund) => ({
      ...refund,
      amount: null,
      reversedAmount: null,
      effectiveAmount: null,
      reference: null,
    })),
    fieldAccess: { financials: false },
  };
}
