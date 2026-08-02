import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ allowed: vi.fn() }));
vi.mock("@/lib/identity/authorization", () => ({
  trustedActionAllowed: harness.allowed,
}));

import {
  projectCustomerReturnPosition,
  projectCustomerReturnResult,
} from "../return-projection";
import type { TrustedActorContext } from "../trusted-actor";
import type { CanonicalCustomerReturnPosition } from "@/lib/orders/canonical-customer-return-projections";

const actorContext = {
  actor: { kind: "person" },
  shop: { shopId: "default" },
} as unknown as TrustedActorContext;

const position = {
  orderId: "order-1",
  orderItems: [{ orderItemId: "item-1", unitPrice: 2_000 }],
  receivableAmount: 4_000,
  effectiveRefundAmount: 500,
  remainingOrderRefundableAmount: 3_500,
  returnCase: {
    itemValue: 2_000,
    maximumWithDeliveryCost: 2_600,
    effectiveRefundAmount: 500,
    remainingItemRefundableAmount: 1_500,
    exchangeDeliveryCost: 600,
    requestedItems: [{ unitPrice: 2_000 }],
    exchangeItems: [{ unitPrice: 2_500 }],
    inspections: [{ unitCost: 1_200, lossAmount: 1_200 }],
  },
  refunds: [
    {
      amount: 500,
      reversedAmount: 0,
      effectiveAmount: 500,
      reference: "cash-desk-1",
    },
  ],
} as unknown as CanonicalCustomerReturnPosition;

describe("customer-return financial projection", () => {
  beforeEach(() => harness.allowed.mockReset());

  it("redacts every monetary return field without financial read authority", () => {
    harness.allowed.mockReturnValue(false);
    const projected = projectCustomerReturnPosition(actorContext, position);

    expect(projected).toMatchObject({
      receivableAmount: null,
      effectiveRefundAmount: null,
      remainingOrderRefundableAmount: null,
      orderItems: [{ unitPrice: null }],
      returnCase: {
        itemValue: null,
        exchangeDeliveryCost: null,
        requestedItems: [{ unitPrice: null }],
        exchangeItems: [{ unitPrice: null }],
        inspections: [{ unitCost: null, lossAmount: null }],
      },
      refunds: [
        {
          amount: null,
          reversedAmount: null,
          effectiveAmount: null,
          reference: null,
        },
      ],
      fieldAccess: { financials: false },
    });
  });

  it("redacts recorded loss from mutation results without financial read", () => {
    harness.allowed.mockReturnValue(false);
    expect(
      projectCustomerReturnResult(actorContext, {
        recordedLossAmount: 1_200,
      } as never),
    ).toMatchObject({
      recordedLossAmount: null,
      fieldAccess: { financials: false },
    });
  });
});
