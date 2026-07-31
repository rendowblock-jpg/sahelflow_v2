import "server-only";

import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import {
  canonicalReceivableAmount,
  canonicalReturnCaseForOrder,
  effectiveRefundAmount,
  loadCanonicalReturnOrder,
} from "@/lib/orders/canonical-return-authority";

export type CustomerReturnAction =
  | "request"
  | "approve"
  | "reject"
  | "cancel"
  | "mark_in_transit"
  | "receive"
  | "inspect"
  | "complete";

export interface CanonicalCustomerReturnPosition {
  orderId: string;
  orderNumber: string;
  orderVersion: number;
  status: string;
  returnState: string | null;
  refundState: string | null;
  codState: string | null;
  inventoryState: string | null;
  receivableAmount: number;
  effectiveRefundAmount: number;
  remainingOrderRefundableAmount: number;
  availableActions: CustomerReturnAction[];
  orderItems: Array<{
    orderItemId: string;
    productId: string | null;
    productVariantId: string | null;
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: number;
  }>;
  returnCase: {
    id: string;
    caseType: "return" | "exchange";
    currentState: string;
    reasonCode: string;
    requestedAt: string;
    updatedAt: string;
    fullOrderReturn: boolean;
    itemValue: number;
    maximumWithDeliveryCost: number;
    effectiveRefundAmount: number;
    remainingItemRefundableAmount: number;
    replacementOrderId: string | null;
    replacementOrderNumber: string | null;
    requestedItems: Array<{
      orderItemId: string;
      productName: string;
      variantName: string | null;
      purchasedQuantity: number;
      requestedQuantity: number;
      unitPrice: number;
    }>;
    exchangeItems: Array<{
      productId: string;
      productVariantId: string | null;
      productName: string;
      productVariantName: string | null;
      quantity: number;
      unitPrice: number;
    }>;
    exchangeDeliveryCost: number;
    inspections: Array<{
      orderItemId: string;
      quantity: number;
      disposition: string;
      unitCost: number | null;
      lossAmount: number | null;
      reasonCode: string;
      occurredAt: string;
    }>;
  } | null;
  refunds: Array<{
    refundId: string;
    returnId: string | null;
    amount: number;
    reversedAmount: number;
    effectiveAmount: number;
    method: string;
    reasonCode: string;
    reference: string | null;
    occurredAt: string;
    canReverse: boolean;
  }>;
}

function availableActions(
  orderStatus: string,
  returnCase: { currentState: string } | null,
): CustomerReturnAction[] {
  if (!returnCase) return orderStatus === "delivered" ? ["request"] : [];
  switch (returnCase.currentState) {
    case "requested":
      return ["approve", "reject", "cancel"];
    case "approved":
      return ["mark_in_transit", "receive", "cancel"];
    case "in_transit":
      return ["receive"];
    case "received":
      return ["inspect"];
    case "inspected":
      return ["complete"];
    default:
      return [];
  }
}

export async function getCanonicalCustomerReturnPosition(
  context: BusinessPrincipalContext,
  orderId: string,
): Promise<CanonicalCustomerReturnPosition> {
  const order = await loadCanonicalReturnOrder(
    context.prisma as Parameters<
      Parameters<BusinessPrincipalContext["prisma"]["$transaction"]>[0]
    >[0],
    orderId,
  );
  const [returnCase, receivable, refundBalance, refunds] = await Promise.all([
    canonicalReturnCaseForOrder(
      context.prisma as Parameters<
        Parameters<BusinessPrincipalContext["prisma"]["$transaction"]>[0]
      >[0],
      orderId,
    ),
    canonicalReceivableAmount(
      context.prisma as Parameters<
        Parameters<BusinessPrincipalContext["prisma"]["$transaction"]>[0]
      >[0],
      orderId,
    ).catch(() => 0),
    effectiveRefundAmount(
      context.prisma as Parameters<
        Parameters<BusinessPrincipalContext["prisma"]["$transaction"]>[0]
      >[0],
      orderId,
    ),
    context.prisma.canonicalRefund.findMany({
      where: { orderId },
      include: { reversals: { select: { amount: true } } },
      orderBy: { occurredAt: "desc" },
    }),
  ]);

  let caseProjection: CanonicalCustomerReturnPosition["returnCase"] = null;
  if (returnCase) {
    const [requestedItems, exchangeAgreement, exchangeItems, inspections, link] =
      await Promise.all([
        context.prisma.canonicalReturnItem.findMany({
          where: { returnId: returnCase.id },
          orderBy: { createdAt: "asc" },
        }),
        context.prisma.canonicalExchangeRequest.findUnique({
          where: { returnId: returnCase.id },
        }),
        context.prisma.canonicalExchangeRequestItem.findMany({
          where: { returnId: returnCase.id },
          orderBy: { createdAt: "asc" },
        }),
        context.prisma.canonicalReturnInspection.findMany({
          where: { returnId: returnCase.id },
          orderBy: { occurredAt: "asc" },
        }),
        context.prisma.canonicalExchangeOrder.findUnique({
          where: { returnId: returnCase.id },
        }),
      ]);
    const byOrderItem = new Map(order.items.map((item) => [item.id, item]));
    const requested = requestedItems.map((item) => {
      const orderItem = byOrderItem.get(item.orderItemId);
      if (!orderItem) {
        throw new Error(
          `Canonical return item '${item.orderItemId}' lost its order-item authority`,
        );
      }
      return {
        orderItemId: item.orderItemId,
        productName: orderItem.productName,
        variantName: orderItem.productVariantName,
        purchasedQuantity: orderItem.quantity,
        requestedQuantity: item.quantity,
        unitPrice: orderItem.unitPrice,
      };
    });
    const fullOrderReturn =
      requested.length === order.items.length &&
      order.items.every(
        (item) =>
          requested.find((entry) => entry.orderItemId === item.id)
            ?.requestedQuantity === item.quantity,
      );
    const itemValue = requested.reduce(
      (sum, item) => sum + item.unitPrice * item.requestedQuantity,
      0,
    );
    const returnRefunds = refunds.filter(
      (refund) => refund.returnId === returnCase.id,
    );
    const effectiveForReturn = returnRefunds.reduce(
      (sum, refund) =>
        sum +
        refund.amount -
        refund.reversals.reduce(
          (reversalSum, reversal) => reversalSum + reversal.amount,
          0,
        ),
      0,
    );
    const maximumWithDeliveryCost =
      itemValue + (fullOrderReturn ? order.deliveryCost : 0);
    const replacement = link
      ? await context.prisma.order.findFirst({
          where: { id: link.replacementOrderId, deletedAt: null },
          select: { orderNumber: true },
        })
      : null;

    caseProjection = {
      id: returnCase.id,
      caseType: returnCase.caseType as "return" | "exchange",
      currentState: returnCase.currentState,
      reasonCode: returnCase.reasonCode,
      requestedAt: returnCase.createdAt.toISOString(),
      updatedAt: returnCase.updatedAt.toISOString(),
      fullOrderReturn,
      itemValue,
      maximumWithDeliveryCost,
      effectiveRefundAmount: effectiveForReturn,
      remainingItemRefundableAmount: Math.max(
        0,
        maximumWithDeliveryCost - effectiveForReturn,
      ),
      replacementOrderId: link?.replacementOrderId ?? null,
      replacementOrderNumber: replacement?.orderNumber ?? null,
      requestedItems: requested,
      exchangeItems: exchangeItems.map((item) => ({
        productId: item.productId,
        productVariantId: item.productVariantId,
        productName: item.productName,
        productVariantName: item.productVariantName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      exchangeDeliveryCost: exchangeAgreement?.deliveryCost ?? 0,
      inspections: inspections.map((inspection) => ({
        orderItemId: inspection.orderItemId,
        quantity: inspection.quantity,
        disposition: inspection.disposition,
        unitCost: inspection.unitCost,
        lossAmount: inspection.lossAmount,
        reasonCode: inspection.reasonCode,
        occurredAt: inspection.occurredAt.toISOString(),
      })),
    };
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderVersion: order.version,
    status: order.status,
    returnState: order.returnState,
    refundState: order.refundState,
    codState: order.codState,
    inventoryState: order.inventoryState,
    receivableAmount: receivable,
    effectiveRefundAmount: refundBalance.effective,
    remainingOrderRefundableAmount: Math.max(
      0,
      receivable - refundBalance.effective,
    ),
    availableActions: availableActions(order.status, returnCase),
    orderItems: order.items.map((item) => ({
      orderItemId: item.id,
      productId: item.productId,
      productVariantId: item.productVariantId,
      productName: item.productName,
      variantName: item.productVariantName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    returnCase: caseProjection,
    refunds: refunds.map((refund) => {
      const reversedAmount = refund.reversals.reduce(
        (sum, reversal) => sum + reversal.amount,
        0,
      );
      return {
        refundId: refund.id,
        returnId: refund.returnId,
        amount: refund.amount,
        reversedAmount,
        effectiveAmount: refund.amount - reversedAmount,
        method: refund.method,
        reasonCode: refund.reasonCode,
        reference: refund.reference,
        occurredAt: refund.occurredAt.toISOString(),
        canReverse: reversedAmount < refund.amount,
      };
    }),
  };
}
