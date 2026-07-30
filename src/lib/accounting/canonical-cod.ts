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
const evidenceHashSchema = z.string().trim().toLowerCase().regex(/^[0-9a-f]{64}$/);
const dateSchema = z.coerce.date();
const moneySchema = z.number().int().nonnegative().safe();
const positiveMoneySchema = z.number().int().positive().safe();
const signedMoneySchema = z.number().int().safe();
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

export type CanonicalCodCollectionInput = z.infer<
  typeof canonicalCodCollectionSchema
>;
export type CanonicalCodSettlementInput = z.infer<
  typeof canonicalCodSettlementSchema
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

interface AmountRow {
  amount: number | bigint | null;
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
    WHERE line."orderId" = ${orderId}
  `;
  return integer(rows[0]?.amount, "settled gross total");
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
      const order = await tx.order.findFirst({
        where: { id: data.orderId, deletedAt: null },
        select: {
          id: true,
          orderNumber: true,
          source: true,
          sourceMetadata: true,
          status: true,
          version: true,
          totalPrice: true,
          deliveryState: true,
          codState: true,
        },
      });
      if (!order) throw new NotFoundError("Order", data.orderId);
      assertCanonicalDeliveredOrder(order);
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }
      if (await tx.codCollection.findUnique({ where: { orderId: order.id } })) {
        throw new ConflictError("This order already has a canonical COD collection fact");
      }

      const collectionId = randomUUID();
      const nextVersion = order.version + 1;
      const discrepancyAmount = data.amount - order.totalPrice;
      const codState: CodFinancialState =
        discrepancyAmount === 0 ? "collected" : "disputed";

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

      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          version: data.expectedVersion,
          status: "delivered",
          deliveryState: "delivered",
          deletedAt: null,
        },
        data: {
          version: nextVersion,
          codState,
          codCollected: true,
          codCollectedAt: data.collectedAt,
          codRemitted: false,
          codRemittedAt: null,
          codRemittanceRef: null,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictError("Order changed while COD collection was committed");
      }

      await tx.orderChange.create({
        data: {
          orderId: order.id,
          status: order.status,
          actionType: "cod_collected",
          actor: principal.auditActor,
          payload: JSON.stringify({
            amount: data.amount,
            expectedAmount: order.totalPrice,
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
          reason: `Collected COD differed from expected receivable for order ${order.id}`,
          occurredAt: data.collectedAt,
        });
      }

      const eventPayload = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderVersion: nextVersion,
        provider: data.provider,
        amount: data.amount,
        expectedAmount: order.totalPrice,
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
        expectedAmount: order.totalPrice,
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
      const lineResults: CanonicalCodSettlementLineResult[] = [];
      const financialMovements: FinancialMovementFact[] = [];
      const events: DomainEventFact[] = [];
      const outbox: OutboxIntentFact[] = [];
      const affectedOrderIds: string[] = [];

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
          await tx.codSettlementLine.create({
            data: {
              id: lineId,
              lineKey,
              settlementId,
              providerLineReference: line.providerLineReference,
              orderId: null,
              isFinal: true,
              grossRemittedAmount: line.grossRemittedAmount,
              feeAmount: line.feeAmount,
              adjustmentAmount: line.adjustmentAmount,
              netAmount: lineNet,
              discrepancyAmount: 0,
              status: "unmatched",
            },
          });
          financialMovements.push({
            movementKey: `${lineKey}:unmatched-net`,
            movementType: "cod_unmatched_remittance_received",
            settlementId,
            amount: lineNet,
            currency: "DZD",
            counterparty: data.provider,
            reference: line.providerLineReference ?? data.externalReference,
            reason: `Unmatched provider remittance line in settlement ${settlementId}`,
            occurredAt: data.receivedAt,
          });
          const resultLine: CanonicalCodSettlementLineResult = {
            lineId,
            providerLineReference: line.providerLineReference ?? null,
            orderId: null,
            orderNumber: null,
            orderVersion: null,
            status: "unmatched",
            isFinal: true,
            grossRemittedAmount: line.grossRemittedAmount,
            feeAmount: line.feeAmount,
            adjustmentAmount: line.adjustmentAmount,
            netAmount: lineNet,
            discrepancyAmount: 0,
            remainingBefore: null,
            remainingAfter: null,
            codState: null,
          };
          lineResults.push(resultLine);
          events.push({
            key: `${lineKey}:event`,
            type: "cod.settlement.line.unmatched.v1",
            payload: {
              settlementId,
              lineId,
              providerLineReference: line.providerLineReference ?? null,
              grossRemittedAmount: line.grossRemittedAmount,
              netAmount: lineNet,
            },
            occurredAt: data.receivedAt,
          });
          continue;
        }

        const order = await tx.order.findFirst({
          where: { id: line.orderId, deletedAt: null },
          select: {
            id: true,
            orderNumber: true,
            source: true,
            sourceMetadata: true,
            status: true,
            version: true,
            totalPrice: true,
            deliveryState: true,
            codState: true,
          },
        });
        if (!order) throw new NotFoundError("Order", line.orderId);
        assertCanonicalDeliveredOrder(order);
        if (order.version !== line.expectedVersion) {
          throw new ConflictError(
            `Order ${order.id} version conflict: expected ${String(line.expectedVersion)}, current ${order.version}`,
          );
        }

        const collection = await tx.codCollection.findUnique({
          where: { orderId: order.id },
          select: { id: true, amount: true, provider: true },
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

        const effectiveCollected = await effectiveCollectionAmount(
          tx,
          collection.id,
          collection.amount,
        );
        const previouslySettled = await settledGrossForOrder(tx, order.id);
        const remainingBefore = effectiveCollected - previouslySettled;
        if (remainingBefore <= 0) {
          throw new ConflictError(
            `Order ${order.id} has no remaining canonical COD receivable`,
          );
        }

        let status: CanonicalCodSettlementLineResult["status"];
        let lineDiscrepancy = 0;
        let codState: CodFinancialState;
        if (line.isFinal) {
          lineDiscrepancy = line.grossRemittedAmount - remainingBefore;
          status = lineDiscrepancy === 0 ? "matched" : "disputed";
          codState = lineDiscrepancy === 0 ? "remitted" : "disputed";
        } else {
          if (line.grossRemittedAmount >= remainingBefore) {
            throw new ValidationError(
              "A partial remittance must be smaller than the remaining receivable",
              `lines.${index}.grossRemittedAmount`,
            );
          }
          status = "partial";
          codState = "partially_remitted";
        }
        const remainingAfter = remainingBefore - line.grossRemittedAmount;
        discrepancyAmount += lineDiscrepancy;
        if (status === "disputed") needsReview = true;

        await tx.codSettlementLine.create({
          data: {
            id: lineId,
            lineKey,
            settlementId,
            providerLineReference: line.providerLineReference,
            orderId: order.id,
            isFinal: line.isFinal,
            grossRemittedAmount: line.grossRemittedAmount,
            feeAmount: line.feeAmount,
            adjustmentAmount: line.adjustmentAmount,
            netAmount: lineNet,
            discrepancyAmount: lineDiscrepancy,
            status,
          },
        });

        const nextVersion = order.version + 1;
        const updated = await tx.order.updateMany({
          where: {
            id: order.id,
            version: line.expectedVersion,
            status: "delivered",
            deliveryState: "delivered",
            deletedAt: null,
          },
          data: {
            version: nextVersion,
            codState,
            codRemitted: codState === "remitted",
            codRemittedAt: codState === "remitted" ? data.receivedAt : null,
            codRemittanceRef:
              codState === "remitted" ? data.externalReference : null,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictError(
            `Order ${order.id} changed while settlement was committed`,
          );
        }

        await tx.orderChange.create({
          data: {
            orderId: order.id,
            status: order.status,
            actionType:
              status === "partial"
                ? "cod_partially_remitted"
                : status === "matched"
                  ? "cod_remitted"
                  : "cod_disputed",
            actor: principal.auditActor,
            payload: JSON.stringify({
              settlementId,
              externalReference: data.externalReference,
              provider: data.provider,
              grossRemittedAmount: line.grossRemittedAmount,
              feeAmount: line.feeAmount,
              adjustmentAmount: line.adjustmentAmount,
              netAmount: lineNet,
              discrepancyAmount: lineDiscrepancy,
              isFinal: line.isFinal,
              remainingBefore,
              remainingAfter,
              codState,
              orderVersion: nextVersion,
              commandId,
              authority: "canonical-cod-v1",
            }),
            confirmedBy: principal.auditActor,
            confirmedAt: data.receivedAt,
          },
        });

        financialMovements.push({
          movementKey: `${lineKey}:gross`,
          movementType: "cod_remittance_gross_received",
          orderId: order.id,
          settlementId,
          amount: line.grossRemittedAmount,
          currency: "DZD",
          counterparty: data.provider,
          reference: line.providerLineReference ?? data.externalReference,
          reason: `Gross COD remittance received for order ${order.id}`,
          occurredAt: data.receivedAt,
        });
        if (line.feeAmount > 0) {
          financialMovements.push({
            movementKey: `${lineKey}:fee`,
            movementType: "courier_fee_withheld",
            orderId: order.id,
            settlementId,
            amount: -line.feeAmount,
            currency: "DZD",
            counterparty: data.provider,
            reference: line.providerLineReference ?? data.externalReference,
            reason: `Courier fee withheld from settlement for order ${order.id}`,
            occurredAt: data.receivedAt,
          });
        }
        if (line.adjustmentAmount !== 0) {
          financialMovements.push({
            movementKey: `${lineKey}:adjustment`,
            movementType: "cod_settlement_adjustment",
            orderId: order.id,
            settlementId,
            amount: line.adjustmentAmount,
            currency: "DZD",
            counterparty: data.provider,
            reference: line.providerLineReference ?? data.externalReference,
            reason: `Provider settlement adjustment recorded for order ${order.id}`,
            occurredAt: data.receivedAt,
          });
        }
        if (lineDiscrepancy !== 0) {
          financialMovements.push({
            movementKey: `${lineKey}:discrepancy`,
            movementType: "cod_settlement_discrepancy_recorded",
            orderId: order.id,
            settlementId,
            amount: lineDiscrepancy,
            currency: "DZD",
            counterparty: data.provider,
            reference: line.providerLineReference ?? data.externalReference,
            reason: `Final provider remittance differed from the remaining receivable for order ${order.id}`,
            occurredAt: data.receivedAt,
          });
        }

        const resultLine: CanonicalCodSettlementLineResult = {
          lineId,
          providerLineReference: line.providerLineReference ?? null,
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderVersion: nextVersion,
          status,
          isFinal: line.isFinal,
          grossRemittedAmount: line.grossRemittedAmount,
          feeAmount: line.feeAmount,
          adjustmentAmount: line.adjustmentAmount,
          netAmount: lineNet,
          discrepancyAmount: lineDiscrepancy,
          remainingBefore,
          remainingAfter,
          codState,
        };
        lineResults.push(resultLine);
        affectedOrderIds.push(order.id);
        events.push({
          key: `${lineKey}:event`,
          type:
            status === "partial"
              ? "order.cod.remittance.partial.v1"
              : status === "matched"
                ? "order.cod.remittance.matched.v1"
                : "order.cod.remittance.disputed.v1",
          payload: {
            settlementId,
            lineId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderVersion: nextVersion,
            status,
            codState,
            grossRemittedAmount: line.grossRemittedAmount,
            feeAmount: line.feeAmount,
            adjustmentAmount: line.adjustmentAmount,
            netAmount: lineNet,
            discrepancyAmount: lineDiscrepancy,
            remainingBefore,
            remainingAfter,
          },
          occurredAt: data.receivedAt,
        });
        outbox.push({
          effectKey: `${lineKey}:projection`,
          effectType: "order.cod.remittance.changed.v1",
          payload: {
            settlementId,
            orderId: order.id,
            orderVersion: nextVersion,
            status,
            codState,
          },
        });
      }

      const settlementStatus: CanonicalCodSettlementResult["status"] =
        needsReview ? "needs_review" : "posted";
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
          grossAmount,
          feeAmount,
          adjustmentAmount,
          netAmount,
          discrepancyAmount,
          unmatchedAmount,
          receivedAt: data.receivedAt,
          createdByCommandId: commandId,
        },
      });

      const result: CanonicalCodSettlementResult = {
        settlementId,
        settlementKey: `${commandId}:settlement`,
        provider: data.provider,
        externalReference: data.externalReference,
        status: settlementStatus,
        receivedAt: data.receivedAt.toISOString(),
        grossAmount,
        feeAmount,
        adjustmentAmount,
        netAmount,
        discrepancyAmount,
        unmatchedAmount,
        lines: lineResults,
      };
      const settlementEvent = {
        settlementId,
        provider: data.provider,
        externalReference: data.externalReference,
        status: settlementStatus,
        receivedAt: data.receivedAt.toISOString(),
        grossAmount,
        feeAmount,
        adjustmentAmount,
        netAmount,
        discrepancyAmount,
        unmatchedAmount,
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
