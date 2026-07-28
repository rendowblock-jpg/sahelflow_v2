process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import { BUSINESS_ENVELOPE_SECRET_KEY } from "@/lib/business-truth/envelope-key";
import type { DbClient } from "@/lib/db";
import {
  getAlgerianDemoWorkspaceStatus,
  loadAlgerianDemoWorkspace,
  removeAlgerianDemoWorkspace,
} from "@/lib/demo/algerian-demo-lifecycle";
import {
  createTestPrisma,
  disconnectTestPrisma,
} from "@/lib/data/__tests__/helpers";

let prisma: PrismaClient;
const client = () => prisma as unknown as DbClient;

async function clearBusinessTruth(): Promise<void> {
  await prisma.compensationFact.deleteMany();
  await prisma.projectionInvalidation.deleteMany();
  await prisma.financialMovement.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.inventoryReservation.deleteMany();
  await prisma.outboxIntent.deleteMany();
  await prisma.domainEvent.deleteMany();
  await prisma.businessCommand.deleteMany();
  await prisma.businessAggregateVersion.deleteMany();
  await prisma.auditLog.deleteMany();
}

beforeEach(async () => {
  prisma = await createTestPrisma();
  await clearBusinessTruth();
  await prisma.secret.deleteMany();
  await prisma.setting.deleteMany();
});

afterEach(async () => {
  await clearBusinessTruth().catch(() => undefined);
  await prisma.secret.deleteMany().catch(() => undefined);
  await prisma.setting.deleteMany().catch(() => undefined);
  await disconnectTestPrisma(prisma);
});

describe("Algerian demo internal envelope-key lifecycle", () => {
  it("allows demo load and removal while preserving the internal wrapped key", async () => {
    await prisma.secret.create({
      data: {
        key: BUSINESS_ENVELOPE_SECRET_KEY,
        ciphertext: "internal-ciphertext",
        iv: "internal-iv",
        tag: "internal-tag",
      },
    });

    await expect(getAlgerianDemoWorkspaceStatus(client())).resolves.toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: false,
    });

    await expect(loadAlgerianDemoWorkspace(client())).resolves.toMatchObject({
      loaded: true,
      canSeed: false,
    });
    await expect(removeAlgerianDemoWorkspace(client())).resolves.toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: false,
    });

    await expect(
      prisma.secret.findUnique({ where: { key: BUSINESS_ENVELOPE_SECRET_KEY } }),
    ).resolves.toMatchObject({ key: BUSINESS_ENVELOPE_SECRET_KEY });
  });

  it("removes the complete generated command graph for demo aggregates", async () => {
    await loadAlgerianDemoWorkspace(client());
    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: { startsWith: "demo-" } },
    });

    await executeBusinessCommand(
      { prisma: client() as never },
      {
        idempotencyKey: "demo-canonical-command",
        commandType: "demo.order.probe",
        aggregate: {
          type: "order",
          id: item.orderId,
          expectedVersion: 0,
        },
        actor: "demo-test",
        correlationId: "demo-canonical-correlation",
        payload: { orderId: item.orderId },
      },
      async ({ commandId }) => ({
        result: { orderId: item.orderId },
        audit: {
          action: "demo.order.probed",
          entity: "order",
          entityId: item.orderId,
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "demo.order.probed",
            payload: { orderId: item.orderId },
          },
        ],
        outbox: [
          {
            effectKey: `${commandId}:effect`,
            effectType: "demo.notify",
            payload: { orderId: item.orderId },
          },
        ],
        reservations: [
          {
            operation: "open",
            id: "generated-reservation-id",
            reservationKey: "generated-reservation-key",
            orderId: item.orderId,
            orderItemId: item.id,
            productId: item.productId,
            productVariantId: item.productVariantId ?? undefined,
            quantity: 1,
          },
        ],
        inventoryMovements: [
          {
            movementKey: `${commandId}:inventory`,
            movementType: "reservation_created",
            orderId: item.orderId,
            orderItemId: item.id,
            reservationId: "generated-reservation-id",
            productId: item.productId,
            productVariantId: item.productVariantId ?? undefined,
            quantity: 1,
            fromPosition: "available",
            toPosition: "reserved",
            reason: "demo canonical lifecycle proof",
          },
        ],
        financialMovements: [
          {
            movementKey: `${commandId}:financial`,
            movementType: "cod_receivable_created",
            orderId: item.orderId,
            amount: 1000,
            currency: "DZD",
            reason: "demo canonical lifecycle proof",
          },
        ],
        projectionInvalidations: [`order:${item.orderId}`],
        compensationFacts: [
          {
            key: `${commandId}:compensation`,
            type: "demo.order.reverse",
            payload: { orderId: item.orderId },
          },
        ],
      }),
    );

    await expect(prisma.businessCommand.count()).resolves.toBe(1);
    await expect(prisma.domainEvent.count()).resolves.toBe(1);
    await expect(prisma.outboxIntent.count()).resolves.toBe(1);
    await expect(prisma.inventoryReservation.count()).resolves.toBe(1);
    await expect(prisma.inventoryMovement.count()).resolves.toBe(1);
    await expect(prisma.financialMovement.count()).resolves.toBe(1);
    await expect(prisma.projectionInvalidation.count()).resolves.toBe(1);
    await expect(prisma.compensationFact.count()).resolves.toBe(1);

    await expect(removeAlgerianDemoWorkspace(client())).resolves.toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: false,
    });

    await expect(prisma.businessCommand.count()).resolves.toBe(0);
    await expect(prisma.businessAggregateVersion.count()).resolves.toBe(0);
    await expect(prisma.domainEvent.count()).resolves.toBe(0);
    await expect(prisma.outboxIntent.count()).resolves.toBe(0);
    await expect(prisma.inventoryReservation.count()).resolves.toBe(0);
    await expect(prisma.inventoryMovement.count()).resolves.toBe(0);
    await expect(prisma.financialMovement.count()).resolves.toBe(0);
    await expect(prisma.projectionInvalidation.count()).resolves.toBe(0);
    await expect(prisma.compensationFact.count()).resolves.toBe(0);
    await expect(
      prisma.secret.findUnique({ where: { key: BUSINESS_ENVELOPE_SECRET_KEY } }),
    ).resolves.toMatchObject({ key: BUSINESS_ENVELOPE_SECRET_KEY });
  });

  it("treats non-demo canonical authority as seller-owned state", async () => {
    await loadAlgerianDemoWorkspace(client());

    await executeBusinessCommand(
      { prisma: client() as never },
      {
        idempotencyKey: "seller-canonical-command",
        commandType: "seller.probe",
        aggregate: {
          type: "seller-probe",
          id: "seller-owned-aggregate",
          expectedVersion: 0,
        },
        actor: "seller-test",
        correlationId: "seller-canonical-correlation",
        payload: { probe: true },
      },
      async ({ commandId }) => ({
        result: { ok: true },
        audit: {
          action: "seller.probed",
          entity: "seller-probe",
          entityId: "seller-owned-aggregate",
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "seller.probed",
            payload: { ok: true },
          },
        ],
      }),
    );

    await expect(getAlgerianDemoWorkspaceStatus(client())).resolves.toMatchObject({
      loaded: true,
      hasBusinessData: true,
    });
    await expect(removeAlgerianDemoWorkspace(client())).rejects.toMatchObject({
      code: "DEMO_REMOVAL_REAL_DATA_PRESENT",
      statusCode: 409,
    });
  });
});
