import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import type {
  BusinessCommandResult,
  CodFinancialState,
  CompensationFact,
  FinancialMovementFact,
  RefundLifecycleState,
  ReturnLifecycleState,
} from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { recordOrderChangeInTx } from "@/lib/data/order-change-service";
import {
  canonicalReceivableAmount,
  canonicalReturnCaseForOrder,
  effectiveRefundAmount,
  loadCanonicalReturnOrder,
  refundProjectionState,
  returnProjectionKeys,
  updateCanonicalReturnProjection,
} from "@/lib/orders/canonical-return-authority";
import { ConflictError, NotFoundError, ValidationError } from "@/types/errors";

const idempotencyKeySchema = z.string().trim().min(8).max(200);
const correlationIdSchema = z.string().trim().min(1).max(200).optional();
const expectedVersionSchema = z.number().int().positive().safe();
const positiveMoneySchema = z.number().int().positive().safe();
const reasonCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i)
  .transform((value) => value.toLowerCase());
const referenceSchema = z.string().trim().min(1).max(240);
const occurredAtSchema = z.coerce.date();

export const canonicalRefundIssueSchema = z
  .object({
    orderId: z.string().trim().min(1),
    returnId: z.string().trim().min(1),
    expectedVersion: expectedVersionSchema,
    amount: positiveMoneySchema,
    method: z.enum(["cash", "bank", "credit", "courier_deduction"]),
    reasonCode: reasonCodeSchema,
    reference: referenceSchema.optional(),
    includeDeliveryCost: z.boolean().default(false),
    occurredAt: occurredAtSchema,
    idempotencyKey: idempotencyKeySchema,
    correlationId: correlationIdSchema,
  })
  .superRefine((input, context) => {
    if (
      ["bank", "courier_deduction"].includes(input.method) &&
      !input.reference
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reference"],
        message: "Bank and courier-deduction refunds require a reference",
      });
    }
  });

export const canonicalRefundReversalSchema = z.object({
  orderId: z.string().trim().min(1),
  refundId: z.string().trim().min(1),
  expectedVersion: expectedVersionSchema,
  amount: positiveMoneySchema,
  reasonCode: reasonCodeSchema,
  occurredAt: occurredAtSchema,
  idempotencyKey: idempotencyKeySchema,
  correlationId: correlationIdSchema,
});

export type CanonicalRefundIssueInput = z.infer<
  typeof canonicalRefundIssueSchema
>;
export type CanonicalRefundReversalInput = z.infer<
  typeof canonicalRefundReversalSchema
>;

export interface CanonicalRefundResult {
  readonly [key: string]: unknown;
  orderId: string;
  orderNumber: string;
  orderVersion: number;
  refundId: string;
  returnId: string;
  action: "issued" | "reversed";
  amount: number;
  method: string;
  receivableAmount: number;
  effectiveRefundAmount: number;
  remainingRefundableAmount: number;
  refundState: RefundLifecycleState;
  occurredAt: string;
}

function currentCodState(value: string | null): CodFinancialState {
  if (!value || value === "not_expected") {
    throw new ConflictError("Order has no canonical COD authority to refund");
  }
  return value as CodFinancialState;
}

function currentReturnState(value: string | null): ReturnLifecycleState {
  return (value ?? "none") as ReturnLifecycleState;
}

async function returnRefundLimit(
  context: Parameters<Parameters<BusinessPrincipalContext["prisma"]["$transaction"]>[0]>[0],
  input: {
    orderId: string;
    returnId: string;
    orderItems: Array<{
      id: string;
      quantity: number;
      unitPrice: number;
    }>;
    deliveryCost: number;
    includeDeliveryCost: boolean;
  },
): Promise<{
  itemValue: number;
  fullOrderReturn: boolean;
  maximum: number;
  effectiveForReturn: number;
}> {
  const requested = await context.canonicalReturnItem.findMany({
    where: { returnId: input.returnId, orderId: input.orderId },
    select: { orderItemId: true, quantity: true },
  });
  if (requested.length === 0) {
    throw new ConflictError("Return case has no canonical requested-item facts");
  }
  const byOrderItem = new Map(input.orderItems.map((item) => [item.id, item]));
  let itemValue = 0;
  for (const item of requested) {
    const orderItem = byOrderItem.get(item.orderItemId);
    if (!orderItem || item.quantity > orderItem.quantity) {
      throw new ConflictError(
        `Return item authority is invalid for '${item.orderItemId}'`,
      );
    }
    itemValue += orderItem.unitPrice * item.quantity;
  }
  const fullOrderReturn =
    requested.length === input.orderItems.length &&
    input.orderItems.every(
      (item) =>
        requested.find((entry) => entry.orderItemId === item.id)?.quantity ===
        item.quantity,
    );
  if (input.includeDeliveryCost && !fullOrderReturn) {
    throw new ValidationError(
      "Delivery cost can be refunded only for a full-order return",
      "includeDeliveryCost",
    );
  }
  const maximum =
    itemValue + (input.includeDeliveryCost ? input.deliveryCost : 0);
  const rows = await context.$queryRaw<
    Array<{
      issued: number | bigint | null;
      reversed: number | bigint | null;
    }>
  >`
    SELECT
      COALESCE((
        SELECT SUM(refund."amount")
        FROM "CanonicalRefund" refund
        WHERE refund."returnId" = ${input.returnId}
      ), 0) AS "issued",
      COALESCE((
        SELECT SUM(reversal."amount")
        FROM "CanonicalRefundReversal" reversal
        INNER JOIN "CanonicalRefund" refund ON refund."id" = reversal."refundId"
        WHERE refund."returnId" = ${input.returnId}
      ), 0) AS "reversed"
  `;
  const issued = Number(rows[0]?.issued ?? 0);
  const reversed = Number(rows[0]?.reversed ?? 0);
  if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(reversed)) {
    throw new ConflictError("Return refund total exceeds integer DZD range");
  }
  const effectiveForReturn = issued - reversed;
  if (effectiveForReturn < 0 || effectiveForReturn > maximum) {
    throw new ConflictError("Return refund authority has an invalid balance");
  }
  return { itemValue, fullOrderReturn, maximum, effectiveForReturn };
}

export async function issueCanonicalRefund(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalRefundResult>> {
  const data = canonicalRefundIssueSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "order.refund.issue.v1",
      aggregate: {
        type: "canonical-refund-issue",
        id: `${data.orderId}:${data.idempotencyKey}`,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: data,
    },
    async ({ tx, commandId, principal }) => {
      const order = await loadCanonicalReturnOrder(tx, data.orderId);
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }
      if (
        !["delivered", "returned"].includes(order.status) ||
        order.fulfillmentState !== "closed" ||
        order.inventoryState !== "settled"
      ) {
        throw new ConflictError(
          "Refunds require completed delivery and settled return inventory",
        );
      }
      const returnCase = await canonicalReturnCaseForOrder(tx, order.id);
      if (
        !returnCase ||
        returnCase.id !== data.returnId ||
        !["inspected", "completed"].includes(returnCase.currentState)
      ) {
        throw new ConflictError(
          "Refunds require the inspected or completed canonical return case",
        );
      }

      const receivable = await canonicalReceivableAmount(tx, order.id);
      const returnLimit = await returnRefundLimit(tx, {
        orderId: order.id,
        returnId: returnCase.id,
        orderItems: order.items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        deliveryCost: order.deliveryCost,
        includeDeliveryCost: data.includeDeliveryCost,
      });
      const before = await effectiveRefundAmount(tx, order.id);
      if (before.effective + data.amount > receivable) {
        throw new ValidationError(
          "Refund would exceed the canonical delivered receivable",
          "amount",
        );
      }
      if (returnLimit.effectiveForReturn + data.amount > returnLimit.maximum) {
        throw new ValidationError(
          "Refund would exceed the exact returned item value",
          "amount",
        );
      }

      const refundId = randomUUID();
      await tx.canonicalRefund.create({
        data: {
          id: refundId,
          refundKey: `${commandId}:refund`,
          orderId: order.id,
          returnId: returnCase.id,
          amount: data.amount,
          currency: "DZD",
          method: data.method,
          reasonCode: data.reasonCode,
          reference: data.reference,
          occurredAt: data.occurredAt,
          createdByCommandId: commandId,
        },
      });
      const customer = await tx.customer.updateMany({
        where: {
          id: order.customerId,
          deletedAt: null,
          totalSpent: { gte: data.amount },
        },
        data: { totalSpent: { decrement: data.amount } },
      });
      if (customer.count !== 1) {
        throw new ConflictError(
          "Customer realized-value projection cannot be reduced safely",
        );
      }

      const effectiveAfter = before.effective + data.amount;
      const refundState = refundProjectionState(
        effectiveAfter,
        receivable,
        before.reversed,
      );
      const nextVersion = await updateCanonicalReturnProjection(
        tx,
        order,
        data.expectedVersion,
        {
          status: order.status,
          fulfillmentState: "closed",
          deliveryState: order.deliveryState ?? "delivered",
          inventoryState: "settled",
          codState: currentCodState(order.codState),
          returnState: currentReturnState(order.returnState),
          refundState,
        },
      );
      await recordOrderChangeInTx(tx, {
        orderId: order.id,
        actionType: "refund",
        actor: principal.auditActor,
        payload: {
          refundId,
          returnId: returnCase.id,
          amount: data.amount,
          method: data.method,
          reasonCode: data.reasonCode,
          referenceRecorded: Boolean(data.reference),
          includeDeliveryCost: data.includeDeliveryCost,
          effectiveRefundAmount: effectiveAfter,
          refundState,
          orderVersion: nextVersion,
          commandId,
          authority: "canonical-refund-v1",
        },
      });

      const output: CanonicalRefundResult = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderVersion: nextVersion,
        refundId,
        returnId: returnCase.id,
        action: "issued",
        amount: data.amount,
        method: data.method,
        receivableAmount: receivable,
        effectiveRefundAmount: effectiveAfter,
        remainingRefundableAmount: receivable - effectiveAfter,
        refundState,
        occurredAt: data.occurredAt.toISOString(),
      };
      const eventPayload = {
        ...output,
        reasonCode: data.reasonCode,
        referenceRecorded: Boolean(data.reference),
      };
      const financialMovements: FinancialMovementFact[] = [
        {
          movementKey: `${commandId}:refund`,
          movementType:
            data.method === "courier_deduction"
              ? "customer_refund_via_courier_deduction"
              : "customer_refund_issued",
          orderId: order.id,
          amount: -data.amount,
          currency: "DZD",
          counterparty: "customer",
          reference: data.reference,
          reason: `Canonical customer refund issued for order ${order.id}`,
          occurredAt: data.occurredAt,
        },
      ];
      const compensationFacts: CompensationFact[] = [
        {
          key: `${commandId}:customer-value`,
          type: "customer.refund.realized-value-adjustment.v1",
          payload: {
            orderId: order.id,
            refundId,
            customerId: order.customerId,
            amountDelta: -data.amount,
          },
        },
      ];

      return {
        result: output,
        audit: {
          action: "customer.refund.issued.v1",
          entity: "order",
          entityId: order.id,
          before: {
            version: order.version,
            refundState: order.refundState,
            effectiveRefundAmount: before.effective,
          },
          after: output,
          metadata: {
            method: data.method,
            authority: "canonical-refund-v1",
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "customer.refund.issued.v1",
            payload: eventPayload,
            occurredAt: data.occurredAt,
          },
        ],
        outbox: [
          {
            effectKey: `${commandId}:projection`,
            effectType: "customer.refund.issued.v1",
            payload: eventPayload,
          },
        ],
        financialMovements,
        compensationFacts,
        projectionInvalidations: returnProjectionKeys(order.id),
      };
    },
  );
}

export async function reverseCanonicalRefund(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalRefundResult>> {
  const data = canonicalRefundReversalSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "order.refund.reverse.v1",
      aggregate: {
        type: "canonical-refund-reversal",
        id: `${data.refundId}:${data.idempotencyKey}`,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: data,
    },
    async ({ tx, commandId, principal }) => {
      const order = await loadCanonicalReturnOrder(tx, data.orderId);
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }
      const refund = await tx.canonicalRefund.findUnique({
        where: { id: data.refundId },
        include: { reversals: { select: { amount: true } } },
      });
      if (!refund || refund.orderId !== order.id || !refund.returnId) {
        throw new NotFoundError("Canonical refund", data.refundId);
      }
      const alreadyReversed = refund.reversals.reduce(
        (sum, reversal) => sum + reversal.amount,
        0,
      );
      if (alreadyReversed + data.amount > refund.amount) {
        throw new ValidationError(
          "Refund reversal would exceed the issued refund amount",
          "amount",
        );
      }

      const receivable = await canonicalReceivableAmount(tx, order.id);
      const before = await effectiveRefundAmount(tx, order.id);
      if (data.amount > before.effective) {
        throw new ValidationError(
          "Refund reversal would exceed the effective order refund balance",
          "amount",
        );
      }
      const reversalId = randomUUID();
      await tx.canonicalRefundReversal.create({
        data: {
          id: reversalId,
          reversalKey: `${commandId}:refund-reversal`,
          refundId: refund.id,
          amount: data.amount,
          reasonCode: data.reasonCode,
          occurredAt: data.occurredAt,
          createdByCommandId: commandId,
        },
      });
      const customer = await tx.customer.updateMany({
        where: { id: order.customerId, deletedAt: null },
        data: { totalSpent: { increment: data.amount } },
      });
      if (customer.count !== 1) {
        throw new ConflictError(
          "Customer realized-value projection cannot be restored safely",
        );
      }

      const effectiveAfter = before.effective - data.amount;
      const reversedAfter = before.reversed + data.amount;
      const refundState = refundProjectionState(
        effectiveAfter,
        receivable,
        reversedAfter,
      );
      const nextVersion = await updateCanonicalReturnProjection(
        tx,
        order,
        data.expectedVersion,
        {
          status: order.status,
          fulfillmentState: order.fulfillmentState ?? "closed",
          deliveryState: order.deliveryState ?? "delivered",
          inventoryState: order.inventoryState ?? "settled",
          codState: currentCodState(order.codState),
          returnState: currentReturnState(order.returnState),
          refundState,
        },
      );
      await recordOrderChangeInTx(tx, {
        orderId: order.id,
        actionType: "refund_reversed",
        actor: principal.auditActor,
        payload: {
          refundId: refund.id,
          reversalId,
          returnId: refund.returnId,
          amount: data.amount,
          reasonCode: data.reasonCode,
          effectiveRefundAmount: effectiveAfter,
          refundState,
          orderVersion: nextVersion,
          commandId,
          authority: "canonical-refund-v1",
        },
      });

      const output: CanonicalRefundResult = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderVersion: nextVersion,
        refundId: refund.id,
        returnId: refund.returnId,
        action: "reversed",
        amount: data.amount,
        method: refund.method,
        receivableAmount: receivable,
        effectiveRefundAmount: effectiveAfter,
        remainingRefundableAmount: receivable - effectiveAfter,
        refundState,
        occurredAt: data.occurredAt.toISOString(),
      };
      const eventPayload = {
        ...output,
        reversalId,
        reasonCode: data.reasonCode,
      };
      const financialMovements: FinancialMovementFact[] = [
        {
          movementKey: `${commandId}:refund-reversal`,
          movementType: "customer_refund_reversed",
          orderId: order.id,
          amount: data.amount,
          currency: "DZD",
          counterparty: "customer",
          reference: refund.reference ?? undefined,
          reason: `Canonical customer refund reversal for order ${order.id}`,
          occurredAt: data.occurredAt,
        },
      ];
      const compensationFacts: CompensationFact[] = [
        {
          key: `${commandId}:customer-value`,
          type: "customer.refund-reversal.realized-value-adjustment.v1",
          payload: {
            orderId: order.id,
            refundId: refund.id,
            reversalId,
            customerId: order.customerId,
            amountDelta: data.amount,
          },
        },
      ];

      return {
        result: output,
        audit: {
          action: "customer.refund.reversed.v1",
          entity: "order",
          entityId: order.id,
          before: {
            version: order.version,
            refundState: order.refundState,
            effectiveRefundAmount: before.effective,
          },
          after: output,
          metadata: {
            refundId: refund.id,
            authority: "canonical-refund-v1",
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "customer.refund.reversed.v1",
            payload: eventPayload,
            occurredAt: data.occurredAt,
          },
        ],
        outbox: [
          {
            effectKey: `${commandId}:projection`,
            effectType: "customer.refund.reversed.v1",
            payload: eventPayload,
          },
        ],
        financialMovements,
        compensationFacts,
        projectionInvalidations: returnProjectionKeys(order.id),
      };
    },
  );
}
