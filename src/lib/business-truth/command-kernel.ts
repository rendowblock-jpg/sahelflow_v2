import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { DbClient } from "@/lib/db";
import { redactPii } from "@/lib/redact-pii";
import { ConflictError, SahelFlowError } from "@/types/errors";
import {
  type BusinessCommandEnvelope,
  type BusinessCommandOutcome,
  type BusinessCommandResult,
  validateBusinessCommand,
  validateBusinessCommandOutcome,
} from "./contracts";
import { getBusinessEnvelopeKey } from "./envelope-key";
import {
  financialMovementDetailBinding,
  sealBusinessPayloadWithKey,
} from "./payload-codec";
import {
  type BusinessPrincipalContext,
  type TrustedBusinessPrincipal,
  hasDefaultBusinessReplayAuthority,
  resolveTrustedBusinessPrincipal,
} from "./principal";
import {
  canonicalBusinessRequestJson,
  compareCanonicalKeys,
} from "./request-codec";
import {
  openBusinessCommandResultWithKey,
  sealBusinessCommandResultWithKey,
} from "./result-codec";
import { assertBusinessCommandShopAuthority } from "./shop-authority";

export type BusinessTransaction = Parameters<
  Parameters<DbClient["$transaction"]>[0]
>[0];

export interface BusinessCommandExecution {
  tx: BusinessTransaction;
  commandId: string;
  aggregateVersion: number;
  principal: TrustedBusinessPrincipal;
}

export type BusinessCommandHandler<TResult> = (
  execution: BusinessCommandExecution,
) => Promise<BusinessCommandOutcome<TResult>>;

export interface StoredBusinessCommandIdentity {
  commandId: string;
  commandType: string;
  aggregateType: string;
  aggregateId: string;
  actor: string;
}

export interface BusinessCommandReplayAuthorizationContext<TPayload> {
  tx: BusinessTransaction;
  command: BusinessCommandEnvelope<TPayload>;
  principal: TrustedBusinessPrincipal;
  storedCommand: Readonly<StoredBusinessCommandIdentity>;
}

export type BusinessCommandReplayAuthorizer<TPayload> = (
  context: BusinessCommandReplayAuthorizationContext<TPayload>,
) => Promise<void>;

export interface BusinessCommandOptions<TPayload> {
  /**
   * Optional replay access policy. It runs before a stored result is decrypted.
   * A cross-principal replay is denied unless this policy explicitly authorizes
   * it. Callers may also provide it for same-principal access revalidation.
   */
  authorizeReplay?: BusinessCommandReplayAuthorizer<TPayload>;
}

interface StoredCommandRow {
  id: string;
  commandType: string;
  aggregateType: string;
  aggregateId: string;
  actor: string;
  requestHash: string;
  status: string;
  resultJson: string | null;
  committedVersion: number | bigint | null;
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new SahelFlowError(
        "Business command payload contains a non-finite number",
        "INVALID_COMMAND_PAYLOAD",
        400,
      );
    }
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => compareCanonicalKeys(left, right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  throw new SahelFlowError(
    `Unsupported business command value: ${typeof value}`,
    "INVALID_COMMAND_PAYLOAD",
    400,
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function businessCommandRequestHash<TPayload>(
  command: BusinessCommandEnvelope<TPayload>,
): string {
  const canonicalRequest = canonicalBusinessRequestJson({
    commandType: command.commandType,
    aggregate: command.aggregate,
    // This remains an untrusted caller claim and is only command content. The
    // persisted audit actor is resolved separately from trusted execution context.
    actor: command.actor,
    causationId: command.causationId ?? null,
    payload: command.payload,
  });
  return createHash("sha256").update(canonicalRequest, "utf8").digest("hex");
}

async function findStoredCommand(
  tx: BusinessTransaction,
  idempotencyKey: string,
): Promise<StoredCommandRow | null> {
  const rows = await tx.$queryRaw<StoredCommandRow[]>`
    SELECT
      "id",
      "commandType",
      "aggregateType",
      "aggregateId",
      "actor",
      "requestHash",
      "status",
      "resultJson",
      "committedVersion"
    FROM "BusinessCommand"
    WHERE "idempotencyKey" = ${idempotencyKey}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function assertStoredCommandReplayable(
  stored: StoredCommandRow,
  requestHash: string,
  idempotencyKey: string,
): void {
  if (stored.requestHash !== requestHash) {
    throw new ConflictError(
      `Idempotency key '${idempotencyKey}' is already bound to different command content`,
    );
  }
  if (
    stored.status !== "committed" ||
    stored.resultJson === null ||
    stored.committedVersion === null
  ) {
    throw new ConflictError(
      `Idempotency key '${idempotencyKey}' has an incomplete command record`,
    );
  }
}

async function authorizeStoredCommandReplay<TPayload>(
  tx: BusinessTransaction,
  stored: StoredCommandRow,
  command: BusinessCommandEnvelope<TPayload>,
  principal: TrustedBusinessPrincipal,
  options: BusinessCommandOptions<TPayload>,
): Promise<void> {
  const storedCommand: StoredBusinessCommandIdentity = Object.freeze({
    commandId: stored.id,
    commandType: stored.commandType,
    aggregateType: stored.aggregateType,
    aggregateId: stored.aggregateId,
    actor: stored.actor,
  });

  if (options.authorizeReplay !== undefined) {
    await options.authorizeReplay({
      tx,
      command,
      principal,
      storedCommand,
    });
    return;
  }

  if (!hasDefaultBusinessReplayAuthority(stored.actor, principal)) {
    throw new SahelFlowError(
      "This principal is not authorized to read another principal's committed command result",
      "BUSINESS_COMMAND_REPLAY_FORBIDDEN",
      403,
    );
  }
}

function replayStoredCommand<TResult>(
  stored: StoredCommandRow,
  requestHash: string,
  idempotencyKey: string,
  envelopeKey: Buffer,
): BusinessCommandResult<TResult> {
  return {
    commandId: stored.id,
    aggregateVersion: Number(stored.committedVersion),
    replayed: true,
    result: openBusinessCommandResultWithKey<TResult>(
      stored.resultJson ?? "",
      {
        commandId: stored.id,
        idempotencyKey,
        requestHash,
      },
      envelopeKey,
    ),
  };
}

async function claimAggregateVersion(
  tx: BusinessTransaction,
  aggregateType: string,
  aggregateId: string,
  expectedVersion: number,
): Promise<number> {
  await tx.$executeRaw`
    INSERT INTO "BusinessAggregateVersion" (
      "aggregateType", "aggregateId", "version", "updatedAt"
    ) VALUES (
      ${aggregateType}, ${aggregateId}, 0, CURRENT_TIMESTAMP
    )
    ON CONFLICT("aggregateType", "aggregateId") DO NOTHING
  `;

  const claimed = await tx.$queryRaw<Array<{ version: number | bigint }>>`
    UPDATE "BusinessAggregateVersion"
    SET "version" = "version" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "aggregateType" = ${aggregateType}
      AND "aggregateId" = ${aggregateId}
      AND "version" = ${expectedVersion}
    RETURNING "version"
  `;

  const version = claimed[0]?.version;
  if (version === undefined) {
    const current = await tx.$queryRaw<Array<{ version: number | bigint }>>`
      SELECT "version"
      FROM "BusinessAggregateVersion"
      WHERE "aggregateType" = ${aggregateType}
        AND "aggregateId" = ${aggregateId}
      LIMIT 1
    `;
    throw new ConflictError(
      `Aggregate ${aggregateType}/${aggregateId} version conflict: expected ${expectedVersion}, current ${String(current[0]?.version ?? "missing")}`,
    );
  }
  return Number(version);
}

function jsonOrNull(
  value: Readonly<Record<string, unknown>> | null | undefined,
): string | null {
  return value ? canonicalJson(redactPii(value)) : null;
}

async function persistOutcome<TResult>(
  tx: BusinessTransaction,
  command: BusinessCommandEnvelope<unknown>,
  commandId: string,
  aggregateVersion: number,
  outcome: BusinessCommandOutcome<TResult>,
  envelopeKey: Buffer,
  principal: TrustedBusinessPrincipal,
): Promise<void> {
  const now = new Date();

  await tx.auditLog.create({
    data: {
      action: outcome.audit.action,
      entity: outcome.audit.entity,
      entityId: outcome.audit.entityId,
      actor: principal.auditActor,
      before: jsonOrNull(outcome.audit.before),
      after: jsonOrNull(outcome.audit.after),
      metadata: canonicalJson(
        redactPii({
          ...(outcome.audit.metadata ?? {}),
          commandId,
          commandType: command.commandType,
          correlationId: command.correlationId,
          causationId: command.causationId ?? null,
          aggregateVersion,
          trustedPrincipalKind: principal.kind,
          trustedPrincipalSubject: principal.subjectId,
          claimedActor: command.actor,
        }),
      ),
    },
  });

  for (const reservation of outcome.reservations ?? []) {
    if (reservation.operation === "open") {
      await tx.$executeRaw`
        INSERT INTO "InventoryReservation" (
          "id", "reservationKey", "orderId", "orderItemId", "productId",
          "productVariantId", "quantity", "state", "createdByCommandId",
          "createdAt"
        ) VALUES (
          ${reservation.id}, ${reservation.reservationKey}, ${reservation.orderId},
          ${reservation.orderItemId ?? null}, ${reservation.productId},
          ${reservation.productVariantId ?? null}, ${reservation.quantity},
          'active', ${commandId}, ${now}
        )
      `;
      continue;
    }

    const state =
      reservation.operation === "release"
        ? "released"
        : reservation.operation === "consume"
          ? "consumed"
          : "cancelled";
    const updated = await tx.$executeRaw`
      UPDATE "InventoryReservation"
      SET "state" = ${state},
          "closedByCommandId" = ${commandId},
          "closedAt" = ${now}
      WHERE "id" = ${reservation.id}
        AND "state" = 'active'
    `;
    if (updated !== 1) {
      throw new ConflictError(
        `Inventory reservation '${reservation.id}' is missing or no longer active`,
      );
    }
  }

  for (const movement of outcome.inventoryMovements ?? []) {
    await tx.$executeRaw`
      INSERT INTO "InventoryMovement" (
        "id", "movementKey", "commandId", "orderId", "orderItemId",
        "reservationId", "productId", "productVariantId", "movementType",
        "quantity", "fromPosition", "toPosition", "reason", "occurredAt"
      ) VALUES (
        ${randomUUID()}, ${movement.movementKey}, ${commandId},
        ${movement.orderId ?? null}, ${movement.orderItemId ?? null},
        ${movement.reservationId ?? null}, ${movement.productId},
        ${movement.productVariantId ?? null}, ${movement.movementType},
        ${movement.quantity}, ${movement.fromPosition ?? null},
        ${movement.toPosition ?? null}, ${movement.reason},
        ${movement.occurredAt ?? now}
      )
    `;
  }

  for (const movement of outcome.financialMovements ?? []) {
    const encryptedCounterparty =
      movement.counterparty === undefined
        ? null
        : sealBusinessPayloadWithKey(
            movement.counterparty,
            financialMovementDetailBinding(
              commandId,
              movement.movementKey,
              movement.movementType,
              "counterparty",
            ),
            envelopeKey,
          );
    const encryptedReference =
      movement.reference === undefined
        ? null
        : sealBusinessPayloadWithKey(
            movement.reference,
            financialMovementDetailBinding(
              commandId,
              movement.movementKey,
              movement.movementType,
              "reference",
            ),
            envelopeKey,
          );
    const encryptedReason = sealBusinessPayloadWithKey(
      movement.reason,
      financialMovementDetailBinding(
        commandId,
        movement.movementKey,
        movement.movementType,
        "reason",
      ),
      envelopeKey,
    );

    await tx.$executeRaw`
      INSERT INTO "FinancialMovement" (
        "id", "movementKey", "commandId", "orderId", "settlementId",
        "movementType", "amount", "currency", "counterparty", "reference",
        "reason", "occurredAt"
      ) VALUES (
        ${randomUUID()}, ${movement.movementKey}, ${commandId},
        ${movement.orderId ?? null}, ${movement.settlementId ?? null},
        ${movement.movementType}, ${movement.amount}, ${movement.currency},
        ${encryptedCounterparty}, ${encryptedReference},
        ${encryptedReason}, ${movement.occurredAt ?? now}
      )
    `;
  }

  for (const event of outcome.events) {
    await tx.$executeRaw`
      INSERT INTO "DomainEvent" (
        "id", "eventKey", "commandId", "eventType", "aggregateType",
        "aggregateId", "aggregateVersion", "payloadJson", "occurredAt"
      ) VALUES (
        ${randomUUID()}, ${event.key}, ${commandId}, ${event.type},
        ${command.aggregate.type}, ${command.aggregate.id}, ${aggregateVersion},
        ${sealBusinessPayloadWithKey(
          event.payload,
          {
            kind: "domain-event",
            recordKey: event.key,
            recordType: event.type,
            commandId,
          },
          envelopeKey,
        )}, ${event.occurredAt ?? now}
      )
    `;
  }

  for (const intent of outcome.outbox ?? []) {
    await tx.$executeRaw`
      INSERT INTO "OutboxIntent" (
        "id", "effectKey", "commandId", "effectType", "payloadJson",
        "status", "attemptCount", "nextAttemptAt", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${intent.effectKey}, ${commandId}, ${intent.effectType},
        ${sealBusinessPayloadWithKey(
          intent.payload,
          {
            kind: "outbox-intent",
            recordKey: intent.effectKey,
            recordType: intent.effectType,
            commandId,
          },
          envelopeKey,
        )}, 'queued', 0,
        ${intent.nextAttemptAt ?? null}, ${now}, ${now}
      )
    `;
  }

  for (const projectionKey of outcome.projectionInvalidations ?? []) {
    await tx.$executeRaw`
      INSERT INTO "ProjectionInvalidation" (
        "id", "commandId", "projectionKey", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${commandId}, ${projectionKey}, ${now}
      )
    `;
  }

  for (const fact of outcome.compensationFacts ?? []) {
    await tx.$executeRaw`
      INSERT INTO "CompensationFact" (
        "id", "factKey", "commandId", "factType", "payloadJson", "createdAt"
      ) VALUES (
        ${randomUUID()}, ${fact.key}, ${commandId}, ${fact.type},
        ${sealBusinessPayloadWithKey(
          fact.payload,
          {
            kind: "compensation-fact",
            recordKey: fact.key,
            recordType: fact.type,
            commandId,
          },
          envelopeKey,
        )}, ${now}
      )
    `;
  }
}

export async function executeBusinessCommand<TPayload, TResult>(
  context: BusinessPrincipalContext,
  command: BusinessCommandEnvelope<TPayload>,
  handler: BusinessCommandHandler<TResult>,
  options: BusinessCommandOptions<TPayload> = {},
): Promise<BusinessCommandResult<TResult>> {
  validateBusinessCommand(command);
  assertBusinessCommandShopAuthority(context);
  const principal = await resolveTrustedBusinessPrincipal(context);
  const requestHash = businessCommandRequestHash(command);
  const envelopeKey = await getBusinessEnvelopeKey(context);

  return context.prisma.$transaction(async (tx) => {
    const stored = await findStoredCommand(tx, command.idempotencyKey);
    if (stored) {
      assertStoredCommandReplayable(
        stored,
        requestHash,
        command.idempotencyKey,
      );
      await authorizeStoredCommandReplay(
        tx,
        stored,
        command,
        principal,
        options,
      );
      return replayStoredCommand<TResult>(
        stored,
        requestHash,
        command.idempotencyKey,
        envelopeKey,
      );
    }

    const aggregateVersion = await claimAggregateVersion(
      tx,
      command.aggregate.type,
      command.aggregate.id,
      command.aggregate.expectedVersion,
    );
    const commandId = randomUUID();

    await tx.$executeRaw`
      INSERT INTO "BusinessCommand" (
        "id", "idempotencyKey", "commandType", "aggregateType",
        "aggregateId", "requestHash", "status", "actor", "correlationId",
        "causationId", "expectedVersion", "createdAt"
      ) VALUES (
        ${commandId}, ${command.idempotencyKey}, ${command.commandType},
        ${command.aggregate.type}, ${command.aggregate.id}, ${requestHash},
        'processing', ${principal.auditActor}, ${command.correlationId},
        ${command.causationId ?? null}, ${command.aggregate.expectedVersion},
        ${new Date()}
      )
    `;

    const outcome = await handler({
      tx,
      commandId,
      aggregateVersion,
      principal,
    });
    validateBusinessCommandOutcome(outcome);
    const sealedResult = sealBusinessCommandResultWithKey(
      outcome.result,
      {
        commandId,
        idempotencyKey: command.idempotencyKey,
        requestHash,
      },
      envelopeKey,
    );

    await persistOutcome(
      tx,
      command as BusinessCommandEnvelope<unknown>,
      commandId,
      aggregateVersion,
      outcome,
      envelopeKey,
      principal,
    );

    const updated = await tx.$executeRaw`
      UPDATE "BusinessCommand"
      SET "status" = 'committed',
          "resultJson" = ${sealedResult.resultJson},
          "committedVersion" = ${aggregateVersion},
          "committedAt" = ${new Date()}
      WHERE "id" = ${commandId}
        AND "status" = 'processing'
    `;
    if (updated !== 1) {
      throw new ConflictError(`Business command '${commandId}' was not in processing state`);
    }

    return {
      commandId,
      aggregateVersion,
      replayed: false,
      result: sealedResult.normalizedResult,
    };
  });
}
