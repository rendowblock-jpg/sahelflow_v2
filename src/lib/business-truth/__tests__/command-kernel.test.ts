process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

import type { ServiceContext } from "@/lib/data/service-base";
import { ConflictError, ValidationError } from "@/types/errors";
import type { BusinessCommandEnvelope, BusinessCommandOutcome } from "../contracts";
import { executeBusinessCommand } from "../command-kernel";

const db = new PrismaClient();
const context = { prisma: db as never } satisfies ServiceContext;

interface ProbePayload {
  delta: number;
}

interface ProbeResult {
  value: number;
}

interface SensitiveProbeResult extends ProbeResult {
  createdAt: Date;
  customer: {
    phone: string;
    address: string;
    notes: string;
  };
  optionalValue: undefined;
}

function command(
  overrides: Partial<BusinessCommandEnvelope<ProbePayload>> = {},
): BusinessCommandEnvelope<ProbePayload> {
  return {
    idempotencyKey: "probe-1",
    commandType: "probe.increment",
    aggregate: {
      type: "probe",
      id: "aggregate-1",
      expectedVersion: 0,
    },
    actor: "test-operator",
    correlationId: "correlation-1",
    payload: { delta: 1 },
    ...overrides,
  };
}

function outcome(value: number): BusinessCommandOutcome<ProbeResult> {
  return {
    result: { value },
    audit: {
      action: "probe.incremented",
      entity: "probe",
      entityId: "aggregate-1",
      before: { value: value - 1 },
      after: { value },
    },
    events: [
      {
        key: `probe-event-${value}`,
        type: "probe.incremented",
        payload: { value },
      },
    ],
    outbox: [
      {
        effectKey: `probe-effect-${value}`,
        effectType: "probe.notify",
        payload: { value },
      },
    ],
    reservations: [
      {
        operation: "open",
        id: `reservation-${value}`,
        reservationKey: `probe-reservation-${value}`,
        orderId: "order-1",
        productId: "product-1",
        quantity: 2,
      },
    ],
    inventoryMovements: [
      {
        movementKey: `probe-stock-${value}`,
        movementType: "reservation_created",
        orderId: "order-1",
        reservationId: `reservation-${value}`,
        productId: "product-1",
        quantity: 2,
        fromPosition: "available",
        toPosition: "reserved",
        reason: "probe",
      },
    ],
    financialMovements: [
      {
        movementKey: `probe-money-${value}`,
        movementType: "cod_receivable_created",
        orderId: "order-1",
        amount: 2500,
        currency: "DZD",
        counterparty: "courier",
        reason: "probe",
      },
    ],
    projectionInvalidations: ["probe:aggregate-1"],
    compensationFacts: [
      {
        key: `probe-compensation-${value}`,
        type: "probe.reverse",
        payload: { delta: -1 },
      },
    ],
  };
}

async function count(table: string): Promise<number> {
  const allowed = new Set([
    "AuditLog",
    "BusinessAggregateVersion",
    "BusinessCommand",
    "DomainEvent",
    "OutboxIntent",
    "InventoryReservation",
    "InventoryMovement",
    "FinancialMovement",
    "ProjectionInvalidation",
    "CompensationFact",
  ]);
  if (!allowed.has(table)) throw new Error(`Unsupported test table: ${table}`);
  const rows = await db.$queryRawUnsafe<Array<{ total: number | bigint }>>(
    `SELECT COUNT(*) AS total FROM "${table}"`,
  );
  return Number(rows[0]?.total ?? 0);
}

async function cleanBusinessTruth(): Promise<void> {
  await db.$executeRawUnsafe('DELETE FROM "CompensationFact"');
  await db.$executeRawUnsafe('DELETE FROM "ProjectionInvalidation"');
  await db.$executeRawUnsafe('DELETE FROM "FinancialMovement"');
  await db.$executeRawUnsafe('DELETE FROM "InventoryMovement"');
  await db.$executeRawUnsafe('DELETE FROM "InventoryReservation"');
  await db.$executeRawUnsafe('DELETE FROM "OutboxIntent"');
  await db.$executeRawUnsafe('DELETE FROM "DomainEvent"');
  await db.$executeRawUnsafe('DELETE FROM "BusinessCommand"');
  await db.$executeRawUnsafe('DELETE FROM "BusinessAggregateVersion"');
  await db.auditLog.deleteMany();
  await db.setting.deleteMany({ where: { key: { startsWith: "session2_probe" } } });
}

beforeEach(async () => {
  await cleanBusinessTruth();
});

afterAll(async () => {
  await cleanBusinessTruth();
  await db.$disconnect();
});

describe("executeBusinessCommand", () => {
  it("commits mutation, audit, event, outbox, movements and compensation atomically", async () => {
    const result = await executeBusinessCommand(context, command(), async ({ tx }) => {
      await tx.setting.upsert({
        where: { key: "session2_probe_value" },
        update: { value: "1" },
        create: { key: "session2_probe_value", value: "1" },
      });
      return outcome(1);
    });

    expect(result).toMatchObject({ aggregateVersion: 1, replayed: false, result: { value: 1 } });
    expect(await db.setting.findUnique({ where: { key: "session2_probe_value" } })).toMatchObject({ value: "1" });
    expect(await count("BusinessAggregateVersion")).toBe(1);
    expect(await count("BusinessCommand")).toBe(1);
    expect(await count("AuditLog")).toBe(1);
    expect(await count("DomainEvent")).toBe(1);
    expect(await count("OutboxIntent")).toBe(1);
    expect(await count("InventoryReservation")).toBe(1);
    expect(await count("InventoryMovement")).toBe(1);
    expect(await count("FinancialMovement")).toBe(1);
    expect(await count("ProjectionInvalidation")).toBe(1);
    expect(await count("CompensationFact")).toBe(1);
  });

  it("returns the original committed result for an exact same-key retry", async () => {
    const firstHandler = vi.fn(async ({ tx }: Parameters<Parameters<typeof executeBusinessCommand<ProbePayload, ProbeResult>>[2]>[0]) => {
      await tx.setting.create({ data: { key: "session2_probe_replay", value: "1" } });
      return outcome(1);
    });
    const first = await executeBusinessCommand(context, command(), firstHandler);

    const retryHandler = vi.fn(async () => outcome(99));
    const replay = await executeBusinessCommand(context, command(), retryHandler);

    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(retryHandler).not.toHaveBeenCalled();
    expect(await count("BusinessCommand")).toBe(1);
    expect(await count("DomainEvent")).toBe(1);
  });

  it("encrypts replay results and preserves Date and undefined types", async () => {
    const createdAt = new Date("2026-07-28T01:00:00.000Z");
    const sensitiveResult: SensitiveProbeResult = {
      value: 1,
      createdAt,
      customer: {
        phone: "0555000111",
        address: "12 Rue Replay Secret",
        notes: "private replay note",
      },
      optionalValue: undefined,
    };

    const first = await executeBusinessCommand<ProbePayload, SensitiveProbeResult>(
      context,
      command(),
      async () => ({ ...outcome(1), result: sensitiveResult }),
    );

    const stored = await db.$queryRaw<Array<{ resultJson: string }>>`
      SELECT "resultJson"
      FROM "BusinessCommand"
      WHERE "idempotencyKey" = ${command().idempotencyKey}
      LIMIT 1
    `;
    const resultJson = stored[0]?.resultJson;
    expect(resultJson).toBeTruthy();
    expect(resultJson).not.toContain(sensitiveResult.customer.phone);
    expect(resultJson).not.toContain(sensitiveResult.customer.address);
    expect(resultJson).not.toContain(sensitiveResult.customer.notes);
    expect(JSON.parse(resultJson ?? "{}")).toMatchObject({
      format: "sahelflow-business-command-result",
      version: 1,
      algorithm: "aes-256-gcm",
    });

    const replayHandler = vi.fn(async () => ({ ...outcome(2), result: sensitiveResult }));
    const replay = await executeBusinessCommand<ProbePayload, SensitiveProbeResult>(
      context,
      command(),
      replayHandler,
    );

    expect(first.result.createdAt).toBeInstanceOf(Date);
    expect(first.result.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(Object.prototype.hasOwnProperty.call(first.result, "optionalValue")).toBe(true);
    expect(first.result.optionalValue).toBeUndefined();
    expect(replay.result.createdAt).toBeInstanceOf(Date);
    expect(replay.result.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(replay.result).toEqual(first.result);
    expect(replayHandler).not.toHaveBeenCalled();
  });

  it("rejects reuse of an idempotency key for different command content", async () => {
    await executeBusinessCommand(context, command(), async () => outcome(1));

    await expect(
      executeBusinessCommand(
        context,
        command({ payload: { delta: 2 } }),
        async () => outcome(2),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await count("BusinessCommand")).toBe(1);
    expect(await count("DomainEvent")).toBe(1);
  });

  it("rolls back aggregate version, mutation and every fact when the handler fails", async () => {
    await expect(
      executeBusinessCommand(context, command(), async ({ tx }) => {
        await tx.setting.create({ data: { key: "session2_probe_rollback", value: "dirty" } });
        throw new Error("simulated failure");
      }),
    ).rejects.toThrow("simulated failure");

    expect(await db.setting.findUnique({ where: { key: "session2_probe_rollback" } })).toBeNull();
    expect(await count("BusinessAggregateVersion")).toBe(0);
    expect(await count("BusinessCommand")).toBe(0);
    expect(await count("AuditLog")).toBe(0);
    expect(await count("DomainEvent")).toBe(0);
  });

  it("reports an explicit optimistic-version conflict without partial records", async () => {
    await executeBusinessCommand(context, command(), async () => outcome(1));

    await expect(
      executeBusinessCommand(
        context,
        command({ idempotencyKey: "probe-2", correlationId: "correlation-2" }),
        async () => outcome(2),
      ),
    ).rejects.toThrow("version conflict");

    expect(await count("BusinessAggregateVersion")).toBe(1);
    expect(await count("BusinessCommand")).toBe(1);
    expect(await count("DomainEvent")).toBe(1);
  });

  it("rolls back a mutation when required canonical facts are invalid", async () => {
    await expect(
      executeBusinessCommand(context, command(), async ({ tx }) => {
        await tx.setting.create({ data: { key: "session2_probe_invalid", value: "dirty" } });
        return {
          ...outcome(1),
          events: [],
        };
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await db.setting.findUnique({ where: { key: "session2_probe_invalid" } })).toBeNull();
    expect(await count("BusinessAggregateVersion")).toBe(0);
    expect(await count("BusinessCommand")).toBe(0);
    expect(await count("AuditLog")).toBe(0);
  });

  it("rejects non-integer financial facts before commit", async () => {
    await expect(
      executeBusinessCommand(context, command(), async () => ({
        ...outcome(1),
        financialMovements: [
          {
            movementKey: "invalid-money",
            movementType: "cod_receivable_created",
            amount: 12.5,
            currency: "DZD" as const,
            reason: "invalid fractional DZD",
          },
        ],
      })),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await count("BusinessAggregateVersion")).toBe(0);
    expect(await count("BusinessCommand")).toBe(0);
    expect(await count("FinancialMovement")).toBe(0);
  });
});
