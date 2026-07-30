import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  executeBusinessCommand,
  type BusinessTransaction,
} from "@/lib/business-truth/command-kernel";
import type {
  BusinessCommandResult,
  CodFinancialState,
  CompensationFact,
  DomainEventFact,
  FinancialMovementFact,
  OutboxIntentFact,
} from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { ConflictError, NotFoundError, ValidationError } from "@/types/errors";

const idempotencyKeySchema = z.string().trim().min(8).max(200);
const correlationIdSchema = z.string().trim().min(1).max(200).optional();
const providerSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i)
  .transform((value) => value.toLowerCase());
const referenceSchema = z.string().trim().min(1).max(200);
const reasonCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i)
  .transform((value) => value.toLowerCase());
const evidenceHashSchema = z.string().trim().toLowerCase().regex(/^[0-9a-f]{64}$/);
const dateSchema = z.coerce.date();
const moneySchema = z.number().int().nonnegative().safe();
const positiveMoneySchema = z.number().int().positive().safe();
const signedMoneySchema = z.number().int().safe();
const nonZeroMoneySchema = signedMoneySchema.refine((value) => value !== 0, {
  message: "The correction delta must not be zero",
});
const expectedVersionSchema = z.number().int().positive().safe();

export const canonicalCodCollectionSchema = z.object({
  orderId: z.string().trim().min(1),
  expectedVersion: expectedVersionSchema,
  amount: positiveMoneySchema,
  provider: providerSchema,
  reference: referenceSchema.optional(),
  collectedAt: dateSchema,
  idempotencyKey: idempotencyKeySchema,
  correlationId: correlationIdSchema,
});

const settlementLineSchema = z
  .object({
    providerLineReference: referenceSchema.optional(),
    orderId: z.string().trim().min(1).optional(),
    expectedVersion: expectedVersionSchema.optional(),
    grossRemittedAmount: positiveMoneySchema,
    feeAmount: moneySchema.default(0),
    adjustmentAmount: signedMoneySchema.default(0),
    isFinal: z.boolean().default(true),
  })
  .superRefine((line, context) => {
    if (line.orderId && line.expectedVersion === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedVersion"],
        message: "Matched settlement lines require the current order version",
      });
    }
    if (!line.orderId && line.expectedVersion !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedVersion"],
        message: "Unmatched settlement lines cannot claim an order version",
      });
    }
    if (!line.orderId && line.isFinal === false) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isFinal"],
        message: "Unmatched settlement lines are always final evidence lines",
      });
    }
    if (line.grossRemittedAmount - line.feeAmount + line.adjustmentAmount < 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adjustmentAmount"],
        message: "Settlement line net amount cannot be negative",
      });
    }
  });

export const canonicalCodSettlementSchema = z
  .object({
    provider: providerSchema,
    externalReference: referenceSchema,
    receivedAt: dateSchema,
    evidenceSha256: evidenceHashSchema.optional(),
    evidenceName: z.string().trim().min(1).max(240).optional(),
    lines: z.array(settlementLineSchema).min(1).max(500),
    idempotencyKey: idempotencyKeySchema,
    correlationId: correlationIdSchema,
  })
  .superRefine((input, context) => {
    const orderIds = new Set<string>();
    const lineReferences = new Set<string>();
    input.lines.forEach((line, index) => {
      if (line.orderId) {
        if (orderIds.has(line.orderId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lines", index, "orderId"],
            message: "A settlement batch can contain an order only once",
          });
        }
        orderIds.add(line.orderId);
      }
      if (line.providerLineReference) {
        if (lineReferences.has(line.providerLineReference)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lines", index, "providerLineReference"],
            message: "Provider line references must be unique inside a batch",
          });
        }
        lineReferences.add(line.providerLineReference);
      }
    });
  });

export const canonicalCodCollectionCorrectionSchema = z.object({
  orderId: z.string().trim().min(1),
  expectedVersion: expectedVersionSchema,
  amountDelta: nonZeroMoneySchema,
  reasonCode: reasonCodeSchema,
  occurredAt: dateSchema,
  idempotencyKey: idempotencyKeySchema,
  correlationId: correlationIdSchema,
});

export const canonicalCodSettlementCorrectionSchema = z
  .object({
    settlementLineId: z.string().trim().min(1),
    expectedVersion: expectedVersionSchema.optional(),
    grossDelta: signedMoneySchema.default(0),
    feeDelta: signedMoneySchema.default(0),
    adjustmentDelta: signedMoneySchema.default(0),
    discrepancyDelta: signedMoneySchema.default(0),
    reasonCode: reasonCodeSchema,
    occurredAt: dateSchema,
    idempotencyKey: idempotencyKeySchema,
    correlationId: correlationIdSchema,
  })
  .superRefine((input, context) => {
    if (
      input.grossDelta === 0 &&
      input.feeDelta === 0 &&
      input.adjustmentDelta === 0 &&
      input.discrepancyDelta === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["grossDelta"],
        message: "At least one settlement correction delta must be non-zero",
      });
    }
  });

export const canonicalCodSettlementMatchSchema = z.object({
  settlementLineId: z.string().trim().min(1),
  orderId: z.string().trim().min(1),
  expectedVersion: expectedVersionSchema,
  reasonCode: reasonCodeSchema,
  occurredAt: dateSchema,
  idempotencyKey: idempotencyKeySchema,
  correlationId: correlationIdSchema,
});

export type CanonicalCodCollectionInput = z.infer<
  typeof canonicalCodCollectionSchema
>;
export type CanonicalCodSettlementInput = z.infer<
  typeof canonicalCodSettlementSchema
>;
export type CanonicalCodCollectionCorrectionInput = z.infer<
  typeof canonicalCodCollectionCorrectionSchema
>;
export type CanonicalCodSettlementCorrectionInput = z.infer<
  typeof canonicalCodSettlementCorrectionSchema
>;
export type CanonicalCodSettlementMatchInput = z.infer<
  typeof canonicalCodSettlementMatchSchema
>;

export interface CanonicalCodCollectionResult {
  orderId: string;
  orderNumber: string;
  version: number;
  collectionId: string;
  provider: string;
  amount: number;
  expectedAmount: number;
  discrepancyAmount: number;
  codState: CodFinancialState;
  collectedAt: string;
}

export interface CanonicalCodSettlementLineResult {
  lineId: string;
  providerLineReference: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderVersion: number | null;
  status: "matched" | "partial" | "disputed" | "unmatched";
  isFinal: boolean;
  grossRemittedAmount: number;
  feeAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  discrepancyAmount: number;
  remainingBefore: number | null;
  remainingAfter: number | null;
  codState: CodFinancialState | null;
}

export interface CanonicalCodSettlementResult {
  settlementId: string;
  settlementKey: string;
  provider: string;
  externalReference: string;
  status: "posted" | "needs_review";
  receivedAt: string;
  grossAmount: number;
  feeAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  discrepancyAmount: number;
  unmatchedAmount: number;
  lines: CanonicalCodSettlementLineResult[];
}

export interface CanonicalCodCollectionCorrectionResult {
  orderId: string;
  orderNumber: string;
  version: number;
  collectionId: string;
  amountDelta: number;
  effectiveCollected: number;
  expectedAmount: number;
  grossRemitted: number;
  discrepancyAmount: number;
  codState: CodFinancialState;
}

export interface CanonicalCodSettlementCorrectionResult {
  settlementLineId: string;
  orderId: string | null;
  orderNumber: string | null;
  orderVersion: number | null;
  effectiveGross: number;
  effectiveFee: number;
  effectiveAdjustment: number;
  effectiveNet: number;
  effectiveDiscrepancy: number;
  codState: CodFinancialState | null;
}

export interface CanonicalCodSettlementMatchResult {
  settlementLineId: string;
  orderId: string;
  orderNumber: string;
  orderVersion: number;
  matchId: string;
  status: "matched" | "disputed";
  grossRemittedAmount: number;
  discrepancyAmount: number;
  remainingBefore: number;
  remainingAfter: number;
  codState: CodFinancialState;
}

interface AmountRow {
  amount: number | bigint | null;
}

interface AmountAndCountRow extends AmountRow {
  total: number | bigint;
}

interface LatestSettlementRow {
  externalReference: string;
  receivedAt: Date | string;
}

interface CanonicalOrderRow {
  id: string;
  orderNumber: string;
  source: string;
  sourceMetadata: string | null;
  status: string;
  version: number;
  deliveryState: string | null;
  codState: string | null;
}

interface PreparedSettlementLine {
  index: number;
  lineId: string;
  lineKey: string;
  providerLineReference: string | null;
  order: CanonicalOrderRow | null;
  isFinal: boolean;
  grossRemittedAmount: number;
  feeAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  discrepancyAmount: number;
  status: CanonicalCodSettlementLineResult["status"];
  remainingBefore: number | null;
  remainingAfter: number | null;
  nextCodState: CodFinancialState | null;
  nextVersion: number | null;
}

function integer(value: number | bigint | null | undefined, field: string): number {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result)) {
    throw new ConflictError(`${field} is outside the supported integer range`);
  }
  return result;
}

function codProjectionKeys(orderIds: readonly string[]): string[] {
  return [
    "accounting:cod",
    "accounting:profitability",
    "dashboard:accounting",
    "dashboard:orders",
    "orders:list",
    ...orderIds.map((orderId) => `orders:${orderId}`),
  ];
}

async function canonicalReceivableAmount(
  tx: BusinessTransaction,
  orderId: string,
): Promise<number> {
  const rows = await tx.$queryRaw<AmountAndCountRow[]>`
    SELECT
      COUNT(*) AS "total",
      COALESCE(SUM("amount"), 0) AS "amount"
    FROM "FinancialMovement"
    WHERE "orderId" = ${orderId}
      AND "movementType" = 'cod_receivable_created'
      AND "currency" = 'DZD'
  `;
  const total = integer(rows[0]?.total, "COD receivable movement count");
  const amount = integer(rows[0]?.amount, "COD receivable amount");
  if (total !== 1 || amount <= 0) {
    throw new ConflictError(
      `Order ${orderId} requires exactly one positive canonical COD receivable movement`,
    );
  }
  return amount;
}

async function effectiveCollectionAmount(
  tx: BusinessTransaction,
  collectionId: string,
  baseAmount: number,
): Promise<number> {
  const rows = await tx.$queryRaw<AmountRow[]>`
    SELECT COALESCE(SUM("amountDelta"), 0) AS "amount"
    FROM "CodCollectionCorrection"
    WHERE "collectionId" = ${collectionId}
  `;
  return baseAmount + integer(rows[0]?.amount, "collection correction total");
}

async function settledGrossForOrder(
  tx: BusinessTransaction,
  orderId: string,
): Promise<number> {
  const rows = await tx.$queryRaw<AmountRow[]>`
    SELECT COALESCE(SUM(
      line."grossRemittedAmount" + COALESCE((
        SELECT SUM(correction."grossDelta")
        FROM "CodSettlementCorrection" correction
        WHERE correction."settlementLineId" = line."id"
      ), 0)
    ), 0) AS "amount"
    FROM "CodSettlementLine" line
    LEFT JOIN "CodSettlementLineMatch" match
      ON match."settlementLineId" = line."id"
    WHERE line."orderId" = ${orderId}
       OR match."orderId" = ${orderId}
  `;
  return integer(rows[0]?.amount, "settled gross total");
}

async function settlementDiscrepancyForOrder(
  tx: BusinessTransaction,
  orderId: string,
): Promise<number> {
  const rows = await tx.$queryRaw<AmountRow[]>`
    SELECT COALESCE(SUM(
      line."discrepancyAmount" +
      COALESCE((
        SELECT SUM(correction."discrepancyDelta")
        FROM "CodSettlementCorrection" correction
        WHERE correction."settlementLineId" = line."id"
      ), 0) +
      COALESCE(match."discrepancyAmount", 0)
    ), 0) AS "amount"
    FROM "CodSettlementLine" line
    LEFT JOIN "CodSettlementLineMatch" match
      ON match."settlementLineId" = line."id"
    WHERE line."orderId" = ${orderId}
       OR match."orderId" = ${orderId}
  `;
  return integer(rows[0]?.amount, "settlement discrepancy total");
}

async function latestSettlementForOrder(
  tx: BusinessTransaction,
  orderId: string,
): Promise<{ externalReference: string; receivedAt: Date } | null> {
  const rows = await tx.$queryRaw<LatestSettlementRow[]>`
    SELECT
      settlement."externalReference" AS "externalReference",
      settlement."receivedAt" AS "receivedAt"
    FROM "CodSettlementLine" line
    JOIN "CodSettlement" settlement
      ON settlement."id" = line."settlementId"
    LEFT JOIN "CodSettlementLineMatch" match
      ON match."settlementLineId" = line."id"
    WHERE line."orderId" = ${orderId}
       OR match."orderId" = ${orderId}
    ORDER BY settlement."receivedAt" DESC, line."createdAt" DESC
    LIMIT 1
  `;
  const latest = rows[0];
  if (!latest) return null;
  return {
    externalReference: latest.externalReference,
    receivedAt:
      latest.receivedAt instanceof Date
        ? latest.receivedAt
        : new Date(latest.receivedAt),
  };
}

function deriveCodState(input: {
  expectedReceivable: number;
  effectiveCollected: number;
  grossRemitted: number;
  settlementDiscrepancy: number;
}): CodFinancialState {
  if (input.effectiveCollected <= 0) return "receivable";
  if (
    input.effectiveCollected !== input.expectedReceivable ||
    input.settlementDiscrepancy !== 0 ||
    input.grossRemitted > input.effectiveCollected
  ) {
    return "disputed";
  }
  if (input.grossRemitted <= 0) return "collected";
  if (input.grossRemitted < input.effectiveCollected) {
    return "partially_remitted";
  }
  return "remitted";
}

function assertCanonicalDeliveredOrder(order: {
  id: string;
  source: string;
  sourceMetadata: string | null;
  status: string;
  deliveryState: string | null;
  codState: string | null;
}): void {
  if (!isTrustedManualOrderAuthority(order.source, order.sourceMetadata)) {
    throw new ValidationError(
      "Canonical COD commands currently govern trusted manual orders only",
      "order.authority",
    );
  }
  if (order.status !== "delivered" || order.deliveryState !== "delivered") {
    throw new ConflictError(
      "COD collection and remittance require a canonically delivered order",
    );
  }
  if (!order.codState || order.codState === "not_expected") {
    throw new ConflictError("The delivered order has no canonical COD receivable");
  }
}

async function loadCanonicalOrder(
  tx: BusinessTransaction,
  orderId: string,
): Promise<CanonicalOrderRow> {
  const order = await tx.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      id: true,
      orderNumber: true,
      source: true,
      sourceMetadata: true,
      status: true,
      version: true,
      deliveryState: true,
      codState: true,
    },
  });
  if (!order) throw new NotFoundError("Order", orderId);
  assertCanonicalDeliveredOrder(order);
  return order;
}

async function updateOrderCodProjection(
  tx: BusinessTransaction,
  input: {
    order: CanonicalOrderRow;
    expectedVersion: number;
    nextVersion: number;
    codState: CodFinancialState;
    effectiveCollected: number;
    collectedAt: Date | null;
    remittanceAt: Date | null;
    remittanceRef: string | null;
  },
): Promise<void> {
  const updated = await tx.order.updateMany({
    where: {
      id: input.order.id,
      version: input.expectedVersion,
      status: "delivered",
      deliveryState: "delivered",
      deletedAt: null,
    },
    data: {
      version: input.nextVersion,
      codState: input.codState,
      codCollected: input.effectiveCollected > 0,
      codCollectedAt: input.effectiveCollected > 0 ? input.collectedAt : null,
      codRemitted: input.codState === "remitted",
      codRemittedAt: input.codState === "remitted" ? input.remittanceAt : null,
      codRemittanceRef:
        input.codState === "remitted" ? input.remittanceRef : null,
    },
  });
  if (updated.count !== 1) {
    throw new ConflictError(
      `Order ${input.order.id} changed while canonical COD facts were committed`,
    );
  }
}

function orderChangeActionForState(state: CodFinancialState): string {
  if (state === "remitted") return "cod_remitted";
  if (state === "partially_remitted") return "cod_partially_remitted";
  if (state === "disputed") return "cod_disputed";
  if (state === "collected") return "cod_collected";
  return "cod_receivable";
}

export async function recordCanonicalCodCollection(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalCodCollectionResult>> {
  const data = canonicalCodCollectionSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "order.cod.collection.record.v1",
      aggregate: {
        type: "canonical-order-cod-collection",
        id: data.orderId,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: {
        orderId: data.orderId,
        expectedVersion: data.expectedVersion,
        amount: data.amount,
        provider: data.provider,
        reference: data.reference ?? null,
        collectedAt: data.collectedAt,
      },
    },
    async ({ tx, commandId, principal }) => {
      const order = await loadCanonicalOrder(tx, data.orderId);
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }
      if (await tx.codCollection.findUnique({ where: { orderId: order.id } })) {
        throw new ConflictError(
          "This order already has a canonical COD collection fact",
        );
      }

      const expectedAmount = await canonicalReceivableAmount(tx, order.id);
      const collectionId = randomUUID();
      const nextVersion = order.version + 1;
      const discrepancyAmount = data.amount - expectedAmount;
      const codState = deriveCodState({
        expectedReceivable: expectedAmount,
        effectiveCollected: data.amount,
        grossRemitted: 0,
        settlementDiscrepancy: 0,
      });

      await tx.codCollection.create({
        data: {
          id: collectionId,
          collectionKey: `${commandId}:collection`,
          orderId: order.id,
          provider: data.provider,
          amount: data.amount,
          currency: "DZD",
          reference: data.reference,
          collectedAt: data.collectedAt,
          createdByCommandId: commandId,
        },
      });
      await updateOrderCodProjection(tx, {
        order,
        expectedVersion: data.expectedVersion,
        nextVersion,
        codState,
        effectiveCollected: data.amount,
        collectedAt: data.collectedAt,
        remittanceAt: null,
        remittanceRef: null,
      });

      await tx.orderChange.create({
        data: {
          orderId: order.id,
          status: order.status,
          actionType: orderChangeActionForState(codState),
          actor: principal.auditActor,
          payload: JSON.stringify({
            amount: data.amount,
            expectedAmount,
            discrepancyAmount,
            provider: data.provider,
            orderVersion: nextVersion,
            commandId,
            authority: "canonical-cod-v1",
          }),
          confirmedBy: principal.auditActor,
          confirmedAt: data.collectedAt,
        },
      });

      const financialMovements: FinancialMovementFact[] = [
        {
          movementKey: `${commandId}:cash-collected`,
          movementType: "cod_cash_collected_by_courier",
          orderId: order.id,
          amount: data.amount,
          currency: "DZD",
          counterparty: data.provider,
          reference: data.reference,
          reason: `Courier collection recorded for canonical order ${order.id}`,
          occurredAt: data.collectedAt,
        },
      ];
      if (discrepancyAmount !== 0) {
        financialMovements.push({
          movementKey: `${commandId}:collection-discrepancy`,
          movementType: "cod_collection_discrepancy_recorded",
          orderId: order.id,
          amount: discrepancyAmount,
          currency: "DZD",
          counterparty: data.provider,
          reference: data.reference,
          reason: `Collected COD differed from the canonical receivable for order ${order.id}`,
          occurredAt: data.collectedAt,
        });
      }

      const eventPayload = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderVersion: nextVersion,
        provider: data.provider,
        amount: data.amount,
        expectedAmount,
        discrepancyAmount,
        codState,
        collectedAt: data.collectedAt.toISOString(),
      };
      const result: CanonicalCodCollectionResult = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        version: nextVersion,
        collectionId,
        provider: data.provider,
        amount: data.amount,
        expectedAmount,
        discrepancyAmount,
        codState,
        collectedAt: data.collectedAt.toISOString(),
      };

      return {
        result,
        audit: {
          action: "order.cod.collection.recorded.v1",
          entity: "order",
          entityId: order.id,
          before: {
            version: order.version,
            codState: order.codState,
            codCollected: false,
          },
          after: {
            version: nextVersion,
            codState,
            codCollected: true,
            amount: data.amount,
            discrepancyAmount,
          },
          metadata: { provider: data.provider, authority: "canonical-cod-v1" },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "order.cod.collection.recorded.v1",
            payload: eventPayload,
            occurredAt: data.collectedAt,
          },
        ],
        outbox: [
          {
            effectKey: `${commandId}:projection`,
            effectType: "order.cod.collection.recorded.v1",
            payload: eventPayload,
          },
        ],
        financialMovements,
        projectionInvalidations: codProjectionKeys([order.id]),
      };
    },
  );
}

async function prepareSettlementLines(
  tx: BusinessTransaction,
  commandId: string,
  data: CanonicalCodSettlementInput,
): Promise<{
  plans: PreparedSettlementLine[];
  totals: {
    grossAmount: number;
    feeAmount: number;
    adjustmentAmount: number;
    netAmount: number;
    discrepancyAmount: number;
    unmatchedAmount: number;
  };
  needsReview: boolean;
}> {
  const plans: PreparedSettlementLine[] = [];
  let grossAmount = 0;
  let feeAmount = 0;
  let adjustmentAmount = 0;
  let netAmount = 0;
  let discrepancyAmount = 0;
  let unmatchedAmount = 0;
  let needsReview = false;

  for (const [index, line] of data.lines.entries()) {
    const lineId = randomUUID();
    const lineKey = `${commandId}:line:${index}`;
    const lineNet =
      line.grossRemittedAmount - line.feeAmount + line.adjustmentAmount;
    grossAmount += line.grossRemittedAmount;
    feeAmount += line.feeAmount;
    adjustmentAmount += line.adjustmentAmount;
    netAmount += lineNet;

    if (!line.orderId) {
      needsReview = true;
      unmatchedAmount += line.grossRemittedAmount;
      plans.push({
        index,
        lineId,
        lineKey,
        providerLineReference: line.providerLineReference ?? null,
        order: null,
        isFinal: true,
        grossRemittedAmount: line.grossRemittedAmount,
        feeAmount: line.feeAmount,
        adjustmentAmount: line.adjustmentAmount,
        netAmount: lineNet,
        discrepancyAmount: 0,
        status: "unmatched",
        remainingBefore: null,
        remainingAfter: null,
        nextCodState: null,
        nextVersion: null,
      });
      continue;
    }

    const order = await loadCanonicalOrder(tx, line.orderId);
    if (order.version !== line.expectedVersion) {
      throw new ConflictError(
        `Order ${order.id} version conflict: expected ${String(line.expectedVersion)}, current ${order.version}`,
      );
    }
    const collection = await tx.codCollection.findUnique({
      where: { orderId: order.id },
      select: {
        id: true,
        amount: true,
        provider: true,
      },
    });
    if (!collection) {
      throw new ConflictError(
        `Order ${order.id} has no canonical collection fact to settle`,
      );
    }
    if (collection.provider !== data.provider) {
      throw new ConflictError(
        `Order ${order.id} was collected by '${collection.provider}', not '${data.provider}'`,
      );
    }

    const expectedReceivable = await canonicalReceivableAmount(tx, order.id);
    const effectiveCollected = await effectiveCollectionAmount(
      tx,
      collection.id,
      collection.amount,
    );
    const previouslySettled = await settledGrossForOrder(tx, order.id);
    const existingDiscrepancy = await settlementDiscrepancyForOrder(tx, order.id);
    const remainingBefore = effectiveCollected - previouslySettled;
    if (remainingBefore <= 0) {
      throw new ConflictError(
        `Order ${order.id} has no remaining canonical COD receivable`,
      );
    }

    let status: CanonicalCodSettlementLineResult["status"];
    let lineDiscrepancy = 0;
    if (line.isFinal) {
      lineDiscrepancy = line.grossRemittedAmount - remainingBefore;
      status = lineDiscrepancy === 0 ? "matched" : "disputed";
    } else {
      if (line.grossRemittedAmount >= remainingBefore) {
        throw new ValidationError(
          "A partial remittance must be smaller than the remaining receivable",
          `lines.${index}.grossRemittedAmount`,
        );
      }
      status = "partial";
    }
    const remainingAfter = remainingBefore - line.grossRemittedAmount;
    discrepancyAmount += lineDiscrepancy;
    if (status === "disputed") needsReview = true;
    const nextCodState = deriveCodState({
      expectedReceivable,
      effectiveCollected,
      grossRemitted: previouslySettled + line.grossRemittedAmount,
      settlementDiscrepancy: existingDiscrepancy + lineDiscrepancy,
    });

    plans.push({
      index,
      lineId,
      lineKey,
      providerLineReference: line.providerLineReference ?? null,
      order,
      isFinal: line.isFinal,
      grossRemittedAmount: line.grossRemittedAmount,
      feeAmount: line.feeAmount,
      adjustmentAmount: line.adjustmentAmount,
      netAmount: lineNet,
      discrepancyAmount: lineDiscrepancy,
      status,
      remainingBefore,
      remainingAfter,
      nextCodState,
      nextVersion: order.version + 1,
    });
  }

  return {
    plans,
    totals: {
      grossAmount,
      feeAmount,
      adjustmentAmount,
      netAmount,
      discrepancyAmount,
      unmatchedAmount,
    },
    needsReview,
  };
}

export async function postCanonicalCodSettlement(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalCodSettlementResult>> {
  const data = canonicalCodSettlementSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();
  const aggregateId = `${data.provider}:${data.externalReference}`;

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "cod.settlement.post.v1",
      aggregate: {
        type: "canonical-cod-settlement",
        id: aggregateId,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: {
        provider: data.provider,
        externalReference: data.externalReference,
        receivedAt: data.receivedAt,
        evidenceSha256: data.evidenceSha256 ?? null,
        evidenceName: data.evidenceName ?? null,
        lines: data.lines,
      },
    },
    async ({ tx, commandId, principal }) => {
      const duplicate = await tx.codSettlement.findUnique({
        where: {
          provider_externalReference: {
            provider: data.provider,
            externalReference: data.externalReference,
          },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictError(
          "This provider remittance reference is already governed by another settlement",
        );
      }

      const settlementId = randomUUID();
      const prepared = await prepareSettlementLines(tx, commandId, data);
      const settlementStatus: CanonicalCodSettlementResult["status"] =
        prepared.needsReview ? "needs_review" : "posted";

      await tx.codSettlement.create({
        data: {
          id: settlementId,
          settlementKey: `${commandId}:settlement`,
          provider: data.provider,
          externalReference: data.externalReference,
          evidenceSha256: data.evidenceSha256,
          evidenceName: data.evidenceName,
          status: settlementStatus,
          currency: "DZD",
          ...prepared.totals,
          receivedAt: data.receivedAt,
          createdByCommandId: commandId,
        },
      });

      const lineResults: CanonicalCodSettlementLineResult[] = [];
      const financialMovements: FinancialMovementFact[] = [];
      const events: DomainEventFact[] = [];
      const outbox: OutboxIntentFact[] = [];
      const affectedOrderIds: string[] = [];

      for (const plan of prepared.plans) {
        await tx.codSettlementLine.create({
          data: {
            id: plan.lineId,
            lineKey: plan.lineKey,
            settlementId,
            providerLineReference: plan.providerLineReference ?? undefined,
            orderId: plan.order?.id,
            isFinal: plan.isFinal,
            grossRemittedAmount: plan.grossRemittedAmount,
            feeAmount: plan.feeAmount,
            adjustmentAmount: plan.adjustmentAmount,
            netAmount: plan.netAmount,
            discrepancyAmount: plan.discrepancyAmount,
            status: plan.status,
          },
        });

        if (!plan.order) {
          if (plan.netAmount !== 0) {
            financialMovements.push({
              movementKey: `${plan.lineKey}:unmatched-net`,
              movementType: "cod_unmatched_remittance_received",
              settlementId,
              amount: plan.netAmount,
              currency: "DZD",
              counterparty: data.provider,
              reference: plan.providerLineReference ?? data.externalReference,
              reason: `Unmatched provider remittance line in settlement ${settlementId}`,
              occurredAt: data.receivedAt,
            });
          }
          const unmatchedResult: CanonicalCodSettlementLineResult = {
            lineId: plan.lineId,
            providerLineReference: plan.providerLineReference,
            orderId: null,
            orderNumber: null,
            orderVersion: null,
            status: "unmatched",
            isFinal: true,
            grossRemittedAmount: plan.grossRemittedAmount,
            feeAmount: plan.feeAmount,
            adjustmentAmount: plan.adjustmentAmount,
            netAmount: plan.netAmount,
            discrepancyAmount: 0,
            remainingBefore: null,
            remainingAfter: null,
            codState: null,
          };
          lineResults.push(unmatchedResult);
          events.push({
            key: `${plan.lineKey}:event`,
            type: "cod.settlement.line.unmatched.v1",
            payload: {
              settlementId,
              lineId: plan.lineId,
              providerLineReference: plan.providerLineReference,
              grossRemittedAmount: plan.grossRemittedAmount,
              netAmount: plan.netAmount,
            },
            occurredAt: data.receivedAt,
          });
          continue;
        }

        const collection = await tx.codCollection.findUniqueOrThrow({
          where: { orderId: plan.order.id },
          select: { id: true, amount: true, collectedAt: true },
        });
        const effectiveCollected = await effectiveCollectionAmount(
          tx,
          collection.id,
          collection.amount,
        );
        const latestSettlement = await latestSettlementForOrder(
          tx,
          plan.order.id,
        );
        await updateOrderCodProjection(tx, {
          order: plan.order,
          expectedVersion: plan.order.version,
          nextVersion: plan.nextVersion ?? plan.order.version + 1,
          codState: plan.nextCodState ?? "disputed",
          effectiveCollected,
          collectedAt: collection.collectedAt,
          remittanceAt: latestSettlement?.receivedAt ?? null,
          remittanceRef: latestSettlement?.externalReference ?? null,
        });

        const nextVersion = plan.nextVersion ?? plan.order.version + 1;
        await tx.orderChange.create({
          data: {
            orderId: plan.order.id,
            status: plan.order.status,
            actionType: orderChangeActionForState(plan.nextCodState ?? "disputed"),
            actor: principal.auditActor,
            payload: JSON.stringify({
              settlementId,
              externalReference: data.externalReference,
              provider: data.provider,
              grossRemittedAmount: plan.grossRemittedAmount,
              feeAmount: plan.feeAmount,
              adjustmentAmount: plan.adjustmentAmount,
              netAmount: plan.netAmount,
              discrepancyAmount: plan.discrepancyAmount,
              isFinal: plan.isFinal,
              remainingBefore: plan.remainingBefore,
              remainingAfter: plan.remainingAfter,
              codState: plan.nextCodState,
              orderVersion: nextVersion,
              commandId,
              authority: "canonical-cod-v1",
            }),
            confirmedBy: principal.auditActor,
            confirmedAt: data.receivedAt,
          },
        });

        financialMovements.push({
          movementKey: `${plan.lineKey}:gross`,
          movementType: "cod_remittance_gross_received",
          orderId: plan.order.id,
          settlementId,
          amount: plan.grossRemittedAmount,
          currency: "DZD",
          counterparty: data.provider,
          reference: plan.providerLineReference ?? data.externalReference,
          reason: `Gross COD remittance received for order ${plan.order.id}`,
          occurredAt: data.receivedAt,
        });
        if (plan.feeAmount > 0) {
          financialMovements.push({
            movementKey: `${plan.lineKey}:fee`,
            movementType: "courier_fee_withheld",
            orderId: plan.order.id,
            settlementId,
            amount: -plan.feeAmount,
            currency: "DZD",
            counterparty: data.provider,
            reference: plan.providerLineReference ?? data.externalReference,
            reason: `Courier fee withheld from settlement for order ${plan.order.id}`,
            occurredAt: data.receivedAt,
          });
        }
        if (plan.adjustmentAmount !== 0) {
          financialMovements.push({
            movementKey: `${plan.lineKey}:adjustment`,
            movementType: "cod_settlement_adjustment",
            orderId: plan.order.id,
            settlementId,
            amount: plan.adjustmentAmount,
            currency: "DZD",
            counterparty: data.provider,
            reference: plan.providerLineReference ?? data.externalReference,
            reason: `Provider settlement adjustment recorded for order ${plan.order.id}`,
            occurredAt: data.receivedAt,
          });
        }
        if (plan.discrepancyAmount !== 0) {
          financialMovements.push({
            movementKey: `${plan.lineKey}:discrepancy`,
            movementType: "cod_settlement_discrepancy_recorded",
            orderId: plan.order.id,
            settlementId,
            amount: plan.discrepancyAmount,
            currency: "DZD",
            counterparty: data.provider,
            reference: plan.providerLineReference ?? data.externalReference,
            reason: `Final provider remittance differed from the remaining receivable for order ${plan.order.id}`,
            occurredAt: data.receivedAt,
          });
        }

        const resultLine: CanonicalCodSettlementLineResult = {
          lineId: plan.lineId,
          providerLineReference: plan.providerLineReference,
          orderId: plan.order.id,
          orderNumber: plan.order.orderNumber,
          orderVersion: nextVersion,
          status: plan.status,
          isFinal: plan.isFinal,
          grossRemittedAmount: plan.grossRemittedAmount,
          feeAmount: plan.feeAmount,
          adjustmentAmount: plan.adjustmentAmount,
          netAmount: plan.netAmount,
          discrepancyAmount: plan.discrepancyAmount,
          remainingBefore: plan.remainingBefore,
          remainingAfter: plan.remainingAfter,
          codState: plan.nextCodState,
        };
        lineResults.push(resultLine);
        affectedOrderIds.push(plan.order.id);
        events.push({
          key: `${plan.lineKey}:event`,
          type:
            plan.status === "partial"
              ? "order.cod.remittance.partial.v1"
              : plan.status === "matched"
                ? "order.cod.remittance.matched.v1"
                : "order.cod.remittance.disputed.v1",
          payload: {
            settlementId,
            lineId: plan.lineId,
            orderId: plan.order.id,
            orderNumber: plan.order.orderNumber,
            orderVersion: nextVersion,
            status: plan.status,
            codState: plan.nextCodState,
            grossRemittedAmount: plan.grossRemittedAmount,
            feeAmount: plan.feeAmount,
            adjustmentAmount: plan.adjustmentAmount,
            netAmount: plan.netAmount,
            discrepancyAmount: plan.discrepancyAmount,
            remainingBefore: plan.remainingBefore,
            remainingAfter: plan.remainingAfter,
          },
          occurredAt: data.receivedAt,
        });
        outbox.push({
          effectKey: `${plan.lineKey}:projection`,
          effectType: "order.cod.remittance.changed.v1",
          payload: {
            settlementId,
            orderId: plan.order.id,
            orderVersion: nextVersion,
            status: plan.status,
            codState: plan.nextCodState,
          },
        });
      }

      const result: CanonicalCodSettlementResult = {
        settlementId,
        settlementKey: `${commandId}:settlement`,
        provider: data.provider,
        externalReference: data.externalReference,
        status: settlementStatus,
        receivedAt: data.receivedAt.toISOString(),
        ...prepared.totals,
        lines: lineResults,
      };
      const settlementEvent = {
        settlementId,
        provider: data.provider,
        externalReference: data.externalReference,
        status: settlementStatus,
        receivedAt: data.receivedAt.toISOString(),
        ...prepared.totals,
        matchedOrderCount: affectedOrderIds.length,
        lineCount: lineResults.length,
      };
      events.unshift({
        key: `${commandId}:event`,
        type: "cod.settlement.posted.v1",
        payload: settlementEvent,
        occurredAt: data.receivedAt,
      });
      outbox.unshift({
        effectKey: `${commandId}:projection`,
        effectType: "cod.settlement.posted.v1",
        payload: settlementEvent,
      });

      return {
        result,
        audit: {
          action: "cod.settlement.posted.v1",
          entity: "cod_settlement",
          entityId: settlementId,
          after: settlementEvent,
          metadata: {
            authority: "canonical-cod-v1",
            evidenceAttached: Boolean(data.evidenceSha256),
          },
        },
        events,
        outbox,
        financialMovements,
        projectionInvalidations: codProjectionKeys(affectedOrderIds),
      };
    },
  );
}

export async function correctCanonicalCodCollection(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalCodCollectionCorrectionResult>> {
  const data = canonicalCodCollectionCorrectionSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "order.cod.collection.correct.v1",
      aggregate: {
        type: "canonical-order-cod-collection-correction",
        id: `${data.orderId}:${data.idempotencyKey}`,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: data,
    },
    async ({ tx, commandId, principal }) => {
      const order = await loadCanonicalOrder(tx, data.orderId);
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }
      const collection = await tx.codCollection.findUnique({
        where: { orderId: order.id },
        select: {
          id: true,
          amount: true,
          provider: true,
          reference: true,
          collectedAt: true,
        },
      });
      if (!collection) {
        throw new ConflictError("The order has no canonical collection to correct");
      }

      const expectedAmount = await canonicalReceivableAmount(tx, order.id);
      const currentCollected = await effectiveCollectionAmount(
        tx,
        collection.id,
        collection.amount,
      );
      const grossRemitted = await settledGrossForOrder(tx, order.id);
      const settlementDiscrepancy = await settlementDiscrepancyForOrder(
        tx,
        order.id,
      );
      const effectiveCollected = currentCollected + data.amountDelta;
      if (effectiveCollected < 0) {
        throw new ValidationError(
          "A collection correction cannot make the effective collection negative",
          "amountDelta",
        );
      }
      if (effectiveCollected < grossRemitted) {
        throw new ConflictError(
          "A collection correction cannot reduce collected cash below already governed remittances",
        );
      }

      const codState = deriveCodState({
        expectedReceivable: expectedAmount,
        effectiveCollected,
        grossRemitted,
        settlementDiscrepancy,
      });
      const nextVersion = order.version + 1;
      await tx.codCollectionCorrection.create({
        data: {
          id: randomUUID(),
          correctionKey: `${commandId}:collection-correction`,
          collectionId: collection.id,
          amountDelta: data.amountDelta,
          reasonCode: data.reasonCode,
          occurredAt: data.occurredAt,
          createdByCommandId: commandId,
        },
      });
      const latestSettlement = await latestSettlementForOrder(tx, order.id);
      await updateOrderCodProjection(tx, {
        order,
        expectedVersion: data.expectedVersion,
        nextVersion,
        codState,
        effectiveCollected,
        collectedAt: collection.collectedAt,
        remittanceAt: latestSettlement?.receivedAt ?? null,
        remittanceRef: latestSettlement?.externalReference ?? null,
      });
      await tx.orderChange.create({
        data: {
          orderId: order.id,
          status: order.status,
          actionType: "cod_collection_corrected",
          actor: principal.auditActor,
          payload: JSON.stringify({
            amountDelta: data.amountDelta,
            effectiveCollected,
            expectedAmount,
            grossRemitted,
            settlementDiscrepancy,
            codState,
            reasonCode: data.reasonCode,
            orderVersion: nextVersion,
            commandId,
            authority: "canonical-cod-v1",
          }),
          confirmedBy: principal.auditActor,
          confirmedAt: data.occurredAt,
        },
      });

      const discrepancyAmount = effectiveCollected - expectedAmount;
      const eventPayload = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderVersion: nextVersion,
        collectionId: collection.id,
        amountDelta: data.amountDelta,
        effectiveCollected,
        expectedAmount,
        grossRemitted,
        discrepancyAmount,
        codState,
        reasonCode: data.reasonCode,
      };
      const result: CanonicalCodCollectionCorrectionResult = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        version: nextVersion,
        collectionId: collection.id,
        amountDelta: data.amountDelta,
        effectiveCollected,
        expectedAmount,
        grossRemitted,
        discrepancyAmount,
        codState,
      };

      return {
        result,
        audit: {
          action: "order.cod.collection.corrected.v1",
          entity: "order",
          entityId: order.id,
          before: {
            version: order.version,
            effectiveCollected: currentCollected,
            codState: order.codState,
          },
          after: {
            version: nextVersion,
            effectiveCollected,
            codState,
          },
          metadata: {
            reasonCode: data.reasonCode,
            authority: "canonical-cod-v1",
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "order.cod.collection.corrected.v1",
            payload: eventPayload,
            occurredAt: data.occurredAt,
          },
        ],
        outbox: [
          {
            effectKey: `${commandId}:projection`,
            effectType: "order.cod.collection.corrected.v1",
            payload: eventPayload,
          },
        ],
        financialMovements: [
          {
            movementKey: `${commandId}:collection-correction`,
            movementType: "cod_collection_correction",
            orderId: order.id,
            amount: data.amountDelta,
            currency: "DZD",
            counterparty: collection.provider,
            reference: collection.reference ?? undefined,
            reason: `Governed COD collection correction for order ${order.id}`,
            occurredAt: data.occurredAt,
          },
        ],
        compensationFacts: [
          {
            key: `${commandId}:compensation`,
            type: "cod.collection.correction.v1",
            payload: eventPayload,
          },
        ],
        projectionInvalidations: codProjectionKeys([order.id]),
      };
    },
  );
}

export async function correctCanonicalCodSettlementLine(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalCodSettlementCorrectionResult>> {
  const data = canonicalCodSettlementCorrectionSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "cod.settlement.line.correct.v1",
      aggregate: {
        type: "canonical-cod-settlement-line-correction",
        id: `${data.settlementLineId}:${data.idempotencyKey}`,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: data,
    },
    async ({ tx, commandId, principal }) => {
      const line = await tx.codSettlementLine.findUnique({
        where: { id: data.settlementLineId },
        include: {
          corrections: true,
          settlement: true,
          match: true,
        },
      });
      if (!line) {
        throw new NotFoundError("COD settlement line", data.settlementLineId);
      }

      const currentGross =
        line.grossRemittedAmount +
        line.corrections.reduce((sum, entry) => sum + entry.grossDelta, 0);
      const currentFee =
        line.feeAmount +
        line.corrections.reduce((sum, entry) => sum + entry.feeDelta, 0);
      const currentAdjustment =
        line.adjustmentAmount +
        line.corrections.reduce((sum, entry) => sum + entry.adjustmentDelta, 0);
      const currentDiscrepancy =
        line.discrepancyAmount +
        line.corrections.reduce((sum, entry) => sum + entry.discrepancyDelta, 0) +
        (line.match?.discrepancyAmount ?? 0);
      const effectiveGross = currentGross + data.grossDelta;
      const effectiveFee = currentFee + data.feeDelta;
      const effectiveAdjustment = currentAdjustment + data.adjustmentDelta;
      const effectiveNet = effectiveGross - effectiveFee + effectiveAdjustment;
      const effectiveDiscrepancy =
        currentDiscrepancy + data.discrepancyDelta;
      if (effectiveGross < 0 || effectiveFee < 0 || effectiveNet < 0) {
        throw new ValidationError(
          "Settlement corrections cannot make gross, fee or net amounts negative",
          "grossDelta",
        );
      }

      const orderId = line.orderId ?? line.match?.orderId ?? null;
      let order: CanonicalOrderRow | null = null;
      let nextVersion: number | null = null;
      let codState: CodFinancialState | null = null;
      let expectedReceivable = 0;
      let effectiveCollected = 0;
      if (orderId) {
        if (data.expectedVersion === undefined) {
          throw new ValidationError(
            "A matched settlement correction requires the current order version",
            "expectedVersion",
          );
        }
        order = await loadCanonicalOrder(tx, orderId);
        if (order.version !== data.expectedVersion) {
          throw new ConflictError(
            `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
          );
        }
        const collection = await tx.codCollection.findUniqueOrThrow({
          where: { orderId },
          select: {
            id: true,
            amount: true,
            collectedAt: true,
          },
        });
        expectedReceivable = await canonicalReceivableAmount(tx, orderId);
        effectiveCollected = await effectiveCollectionAmount(
          tx,
          collection.id,
          collection.amount,
        );
        const totalGross = await settledGrossForOrder(tx, orderId);
        const totalDiscrepancy = await settlementDiscrepancyForOrder(tx, orderId);
        const prospectiveGross = totalGross - currentGross + effectiveGross;
        const prospectiveDiscrepancy =
          totalDiscrepancy - currentDiscrepancy + effectiveDiscrepancy;
        codState = deriveCodState({
          expectedReceivable,
          effectiveCollected,
          grossRemitted: prospectiveGross,
          settlementDiscrepancy: prospectiveDiscrepancy,
        });
        nextVersion = order.version + 1;
        const latestSettlement = await latestSettlementForOrder(tx, order.id);
        await updateOrderCodProjection(tx, {
          order,
          expectedVersion: data.expectedVersion,
          nextVersion,
          codState,
          effectiveCollected,
          collectedAt: collection.collectedAt,
          remittanceAt: latestSettlement?.receivedAt ?? null,
          remittanceRef: latestSettlement?.externalReference ?? null,
        });
      } else if (data.expectedVersion !== undefined) {
        throw new ValidationError(
          "An unmatched settlement correction cannot claim an order version",
          "expectedVersion",
        );
      }

      await tx.codSettlementCorrection.create({
        data: {
          id: randomUUID(),
          correctionKey: `${commandId}:settlement-correction`,
          settlementLineId: line.id,
          grossDelta: data.grossDelta,
          feeDelta: data.feeDelta,
          adjustmentDelta: data.adjustmentDelta,
          discrepancyDelta: data.discrepancyDelta,
          reasonCode: data.reasonCode,
          occurredAt: data.occurredAt,
          createdByCommandId: commandId,
        },
      });

      if (order && nextVersion && codState) {
        await tx.orderChange.create({
          data: {
            orderId: order.id,
            status: order.status,
            actionType: "cod_settlement_corrected",
            actor: principal.auditActor,
            payload: JSON.stringify({
              settlementLineId: line.id,
              grossDelta: data.grossDelta,
              feeDelta: data.feeDelta,
              adjustmentDelta: data.adjustmentDelta,
              discrepancyDelta: data.discrepancyDelta,
              effectiveGross,
              effectiveFee,
              effectiveAdjustment,
              effectiveNet,
              effectiveDiscrepancy,
              codState,
              reasonCode: data.reasonCode,
              orderVersion: nextVersion,
              commandId,
              authority: "canonical-cod-v1",
            }),
            confirmedBy: principal.auditActor,
            confirmedAt: data.occurredAt,
          },
        });
      }

      const result: CanonicalCodSettlementCorrectionResult = {
        settlementLineId: line.id,
        orderId,
        orderNumber: order?.orderNumber ?? null,
        orderVersion: nextVersion,
        effectiveGross,
        effectiveFee,
        effectiveAdjustment,
        effectiveNet,
        effectiveDiscrepancy,
        codState,
      };
      const eventPayload = {
        settlementLineId: line.id,
        settlementId: line.settlementId,
        orderId,
        orderVersion: nextVersion,
        grossDelta: data.grossDelta,
        feeDelta: data.feeDelta,
        adjustmentDelta: data.adjustmentDelta,
        discrepancyDelta: data.discrepancyDelta,
        effectiveGross,
        effectiveFee,
        effectiveAdjustment,
        effectiveNet,
        effectiveDiscrepancy,
        codState,
        reasonCode: data.reasonCode,
      };
      const financialMovements: FinancialMovementFact[] = [];
      if (data.grossDelta !== 0) {
        financialMovements.push({
          movementKey: `${commandId}:gross`,
          movementType: "cod_remittance_gross_correction",
          orderId: orderId ?? undefined,
          settlementId: line.settlementId,
          amount: data.grossDelta,
          currency: "DZD",
          counterparty: line.settlement.provider,
          reference: line.providerLineReference ?? line.settlement.externalReference,
          reason: `Governed gross remittance correction for settlement line ${line.id}`,
          occurredAt: data.occurredAt,
        });
      }
      if (data.feeDelta !== 0) {
        financialMovements.push({
          movementKey: `${commandId}:fee`,
          movementType: "courier_fee_correction",
          orderId: orderId ?? undefined,
          settlementId: line.settlementId,
          amount: -data.feeDelta,
          currency: "DZD",
          counterparty: line.settlement.provider,
          reference: line.providerLineReference ?? line.settlement.externalReference,
          reason: `Governed courier fee correction for settlement line ${line.id}`,
          occurredAt: data.occurredAt,
        });
      }
      if (data.adjustmentDelta !== 0) {
        financialMovements.push({
          movementKey: `${commandId}:adjustment`,
          movementType: "cod_settlement_adjustment_correction",
          orderId: orderId ?? undefined,
          settlementId: line.settlementId,
          amount: data.adjustmentDelta,
          currency: "DZD",
          counterparty: line.settlement.provider,
          reference: line.providerLineReference ?? line.settlement.externalReference,
          reason: `Governed settlement adjustment correction for line ${line.id}`,
          occurredAt: data.occurredAt,
        });
      }
      if (data.discrepancyDelta !== 0) {
        financialMovements.push({
          movementKey: `${commandId}:discrepancy`,
          movementType: "cod_settlement_discrepancy_correction",
          orderId: orderId ?? undefined,
          settlementId: line.settlementId,
          amount: data.discrepancyDelta,
          currency: "DZD",
          counterparty: line.settlement.provider,
          reference: line.providerLineReference ?? line.settlement.externalReference,
          reason: `Governed settlement discrepancy correction for line ${line.id}`,
          occurredAt: data.occurredAt,
        });
      }

      return {
        result,
        audit: {
          action: "cod.settlement.line.corrected.v1",
          entity: "cod_settlement_line",
          entityId: line.id,
          before: {
            gross: currentGross,
            fee: currentFee,
            adjustment: currentAdjustment,
            discrepancy: currentDiscrepancy,
          },
          after: {
            gross: effectiveGross,
            fee: effectiveFee,
            adjustment: effectiveAdjustment,
            discrepancy: effectiveDiscrepancy,
            codState,
          },
          metadata: {
            reasonCode: data.reasonCode,
            authority: "canonical-cod-v1",
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "cod.settlement.line.corrected.v1",
            payload: eventPayload,
            occurredAt: data.occurredAt,
          },
        ],
        outbox: [
          {
            effectKey: `${commandId}:projection`,
            effectType: "cod.settlement.line.corrected.v1",
            payload: eventPayload,
          },
        ],
        financialMovements,
        compensationFacts: [
          {
            key: `${commandId}:compensation`,
            type: "cod.settlement.line.correction.v1",
            payload: eventPayload,
          },
        ],
        projectionInvalidations: codProjectionKeys(orderId ? [orderId] : []),
      };
    },
  );
}

export async function matchCanonicalCodSettlementLine(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalCodSettlementMatchResult>> {
  const data = canonicalCodSettlementMatchSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "cod.settlement.line.match.v1",
      aggregate: {
        type: "canonical-cod-settlement-line-match",
        id: data.settlementLineId,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: data,
    },
    async ({ tx, commandId, principal }) => {
      const line = await tx.codSettlementLine.findUnique({
        where: { id: data.settlementLineId },
        include: {
          corrections: true,
          settlement: true,
          match: true,
        },
      });
      if (!line) {
        throw new NotFoundError("COD settlement line", data.settlementLineId);
      }
      if (line.orderId || line.status !== "unmatched" || line.match) {
        throw new ConflictError(
          "Only an unresolved unmatched settlement line can be matched",
        );
      }

      const order = await loadCanonicalOrder(tx, data.orderId);
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }
      const collection = await tx.codCollection.findUnique({
        where: { orderId: order.id },
        select: {
          id: true,
          amount: true,
          provider: true,
          collectedAt: true,
        },
      });
      if (!collection) {
        throw new ConflictError(
          `Order ${order.id} has no canonical collection fact to reconcile`,
        );
      }
      if (collection.provider !== line.settlement.provider) {
        throw new ConflictError(
          `The unmatched line belongs to '${line.settlement.provider}', not '${collection.provider}'`,
        );
      }

      const effectiveGross =
        line.grossRemittedAmount +
        line.corrections.reduce((sum, entry) => sum + entry.grossDelta, 0);
      const lineCorrectionDiscrepancy = line.corrections.reduce(
        (sum, entry) => sum + entry.discrepancyDelta,
        0,
      );
      if (effectiveGross <= 0) {
        throw new ConflictError(
          "An unmatched line must retain a positive effective gross amount before matching",
        );
      }

      const expectedReceivable = await canonicalReceivableAmount(tx, order.id);
      const effectiveCollected = await effectiveCollectionAmount(
        tx,
        collection.id,
        collection.amount,
      );
      const previouslySettled = await settledGrossForOrder(tx, order.id);
      const previousDiscrepancy = await settlementDiscrepancyForOrder(tx, order.id);
      const remainingBefore = effectiveCollected - previouslySettled;
      if (remainingBefore <= 0) {
        throw new ConflictError(
          `Order ${order.id} has no remaining canonical COD receivable`,
        );
      }
      const discrepancyAmount = effectiveGross - remainingBefore;
      const remainingAfter = remainingBefore - effectiveGross;
      const status: CanonicalCodSettlementMatchResult["status"] =
        discrepancyAmount === 0 ? "matched" : "disputed";
      const codState = deriveCodState({
        expectedReceivable,
        effectiveCollected,
        grossRemitted: previouslySettled + effectiveGross,
        settlementDiscrepancy:
          previousDiscrepancy + lineCorrectionDiscrepancy + discrepancyAmount,
      });
      const nextVersion = order.version + 1;
      const matchId = randomUUID();

      await tx.codSettlementLineMatch.create({
        data: {
          id: matchId,
          matchKey: `${commandId}:match`,
          settlementLineId: line.id,
          orderId: order.id,
          status,
          discrepancyAmount,
          reasonCode: data.reasonCode,
          occurredAt: data.occurredAt,
          createdByCommandId: commandId,
        },
      });
      const latestSettlement = await latestSettlementForOrder(tx, order.id);
      await updateOrderCodProjection(tx, {
        order,
        expectedVersion: data.expectedVersion,
        nextVersion,
        codState,
        effectiveCollected,
        collectedAt: collection.collectedAt,
        remittanceAt: latestSettlement?.receivedAt ?? null,
        remittanceRef: latestSettlement?.externalReference ?? null,
      });
      await tx.orderChange.create({
        data: {
          orderId: order.id,
          status: order.status,
          actionType: "cod_unmatched_line_reconciled",
          actor: principal.auditActor,
          payload: JSON.stringify({
            settlementLineId: line.id,
            settlementId: line.settlementId,
            provider: line.settlement.provider,
            grossRemittedAmount: effectiveGross,
            discrepancyAmount,
            remainingBefore,
            remainingAfter,
            codState,
            reasonCode: data.reasonCode,
            orderVersion: nextVersion,
            commandId,
            authority: "canonical-cod-v1",
          }),
          confirmedBy: principal.auditActor,
          confirmedAt: data.occurredAt,
        },
      });

      const result: CanonicalCodSettlementMatchResult = {
        settlementLineId: line.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderVersion: nextVersion,
        matchId,
        status,
        grossRemittedAmount: effectiveGross,
        discrepancyAmount,
        remainingBefore,
        remainingAfter,
        codState,
      };
      const eventPayload = {
        ...result,
        settlementId: line.settlementId,
        provider: line.settlement.provider,
        reasonCode: data.reasonCode,
      };
      const compensationFacts: CompensationFact[] = [
        {
          key: `${commandId}:match`,
          type: "cod.unmatched-line.matched.v1",
          payload: eventPayload,
        },
      ];

      return {
        result,
        audit: {
          action: "cod.settlement.line.matched.v1",
          entity: "cod_settlement_line",
          entityId: line.id,
          before: { status: "unmatched", orderId: null },
          after: {
            status,
            orderId: order.id,
            discrepancyAmount,
            codState,
          },
          metadata: {
            reasonCode: data.reasonCode,
            authority: "canonical-cod-v1",
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type:
              status === "matched"
                ? "cod.settlement.line.matched.v1"
                : "cod.settlement.line.matched-disputed.v1",
            payload: eventPayload,
            occurredAt: data.occurredAt,
          },
        ],
        outbox: [
          {
            effectKey: `${commandId}:projection`,
            effectType: "cod.settlement.line.reconciled.v1",
            payload: eventPayload,
          },
        ],
        compensationFacts,
        projectionInvalidations: codProjectionKeys([order.id]),
      };
    },
  );
}
