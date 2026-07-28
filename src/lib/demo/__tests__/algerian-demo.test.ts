process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import { BUSINESS_ENVELOPE_SECRET_KEY } from "@/lib/business-truth/envelope-key";
import type { DbClient } from "@/lib/db";
import {
  clearAlgerianDemoData,
  getAlgerianDemoStatus,
  seedAlgerianDemoData,
} from "@/lib/demo/algerian-demo";
import {
  getAlgerianDemoWorkspaceStatus,
  loadAlgerianDemoWorkspace,
  removeAlgerianDemoWorkspace,
} from "@/lib/demo/algerian-demo-lifecycle";
import { finalizeAlgerianDemoStory } from "@/lib/demo/algerian-demo-story";
import {
  createTestPrisma,
  disconnectTestPrisma,
} from "@/lib/data/__tests__/helpers";

let prisma: PrismaClient;

const demoClient = () => prisma as unknown as DbClient;

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
  await clearAlgerianDemoData(demoClient()).catch(() => undefined);
  await prisma.secret.deleteMany().catch(() => undefined);
  await prisma.setting.deleteMany().catch(() => undefined);
  await prisma.customer.deleteMany().catch(() => undefined);
  await disconnectTestPrisma(prisma);
});

describe("Algerian demo data", () => {
  it("seeds a deterministic empty shop, finalizes the flagship COD story, and cleans up", async () => {
    const initial = await getAlgerianDemoStatus(demoClient());
    expect(initial).toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: false,
    });

    const seeded = await seedAlgerianDemoData(demoClient());
    expect(seeded).toMatchObject({
      loaded: true,
      canSeed: false,
      hasBusinessData: true,
      counts: {
        categories: 5,
        products: 16,
        customers: 24,
        orders: 48,
        conversations: 8,
        messages: 32,
        expenses: 12,
      },
    });

    await finalizeAlgerianDemoStory(demoClient());

    const flagship = await prisma.order.findUnique({
      where: { id: "demo-order-001" },
      include: {
        items: true,
        delivery: true,
        orderChanges: { orderBy: { createdAt: "asc" } },
      },
    });
    expect(flagship).toMatchObject({
      orderNumber: "DZ-DEMO-0001",
      status: "delivered",
      totalPrice: 6_350,
      deliveryCost: 450,
      codCollected: true,
      codRemitted: true,
      codRemittanceRef: "REM-YAL-DEMO-001",
      delivery: {
        provider: "yalidine",
        status: "delivered",
        trackingNumber: "YALIDINE-DEMO-26001",
      },
    });
    expect(flagship?.items).toEqual([
      expect.objectContaining({
        productName: "Mini imprimante thermique Bluetooth",
        quantity: 1,
        unitPrice: 5_900,
        total: 5_900,
      }),
    ]);
    expect(flagship?.orderChanges.map((change) => change.actionType)).toEqual([
      "create",
      "status_change",
      "ship",
      "deliver",
      "cod_remitted",
    ]);

    const now = Date.now();
    expect(flagship?.createdAt.getTime()).toBeLessThan(now);
    expect(flagship?.confirmedAt?.getTime()).toBeGreaterThan(
      flagship?.createdAt.getTime() ?? 0,
    );
    expect(flagship?.shippedAt?.getTime()).toBeGreaterThan(
      flagship?.confirmedAt?.getTime() ?? 0,
    );
    expect(flagship?.deliveredAt?.getTime()).toBeGreaterThan(
      flagship?.shippedAt?.getTime() ?? 0,
    );
    expect(flagship?.codRemittedAt?.getTime()).toBeGreaterThan(
      flagship?.deliveredAt?.getTime() ?? 0,
    );
    expect(flagship?.codRemittedAt?.getTime()).toBeLessThanOrEqual(now);
    expect(
      flagship?.orderChanges.every(
        (change) => change.createdAt.getTime() <= now,
      ),
    ).toBe(true);

    const firstConversation = await prisma.conversation.findUnique({
      where: { id: "demo-conversation-01" },
      include: { messages: { orderBy: { timestamp: "asc" } } },
    });
    expect(firstConversation).toMatchObject({
      contactName: "Fatima Zohra Benamar",
      channel: "whatsapp",
      priority: "high",
    });
    expect(firstConversation?.messages[0]?.body).toContain(
      "سلام، شفت mini imprimante",
    );
    expect(firstConversation?.messages.at(-1)?.body).toContain(
      "DZ-DEMO-0001",
    );
    expect(
      firstConversation?.messages.every(
        (message) => message.timestamp.getTime() < (flagship?.createdAt.getTime() ?? 0),
      ),
    ).toBe(true);

    const automations = await prisma.automation.findMany({
      where: { id: { startsWith: "demo-" } },
    });
    expect(automations).toHaveLength(3);
    expect(automations.every((automation) => automation.dryRun)).toBe(true);
    expect(await prisma.authSecret.count()).toBe(0);
    expect(await prisma.integration.count()).toBe(0);

    const secondSeed = await seedAlgerianDemoData(demoClient());
    expect(secondSeed.counts.orders).toBe(48);
    expect(await prisma.order.count()).toBe(48);

    const cleared = await clearAlgerianDemoData(demoClient());
    expect(cleared).toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: false,
      counts: {
        categories: 0,
        products: 0,
        customers: 0,
        orders: 0,
        deliveries: 0,
        returns: 0,
        refunds: 0,
        conversations: 0,
        messages: 0,
        expenses: 0,
      },
    });
  });

  it("refuses to mix the demo with existing seller business data", async () => {
    await prisma.customer.create({
      data: {
        id: "real-customer-01",
        name: "Existing Seller Customer",
        phone: "0555999999",
      },
    });

    await expect(seedAlgerianDemoData(demoClient())).rejects.toMatchObject({
      code: "DEMO_SHOP_NOT_EMPTY",
      statusCode: 409,
    });

    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.customer.count()).toBe(1);
  });

  it("allows demo load and removal while preserving the internal wrapped key", async () => {
    await prisma.secret.create({
      data: {
        key: BUSINESS_ENVELOPE_SECRET_KEY,
        ciphertext: "internal-ciphertext",
        iv: "internal-iv",
        tag: "internal-tag",
      },
    });

    await expect(getAlgerianDemoWorkspaceStatus(demoClient())).resolves.toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: false,
    });

    await expect(loadAlgerianDemoWorkspace(demoClient())).resolves.toMatchObject({
      loaded: true,
      canSeed: false,
    });
    await expect(removeAlgerianDemoWorkspace(demoClient())).resolves.toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: false,
    });

    await expect(
      prisma.secret.findUnique({ where: { key: BUSINESS_ENVELOPE_SECRET_KEY } }),
    ).resolves.toMatchObject({ key: BUSINESS_ENVELOPE_SECRET_KEY });
  });

  it("removes the complete generated command graph for demo aggregates", async () => {
    await loadAlgerianDemoWorkspace(demoClient());
    const item = await prisma.orderItem.findFirstOrThrow({
      where: {
        orderId: { startsWith: "demo-" },
        productId: { not: null },
      },
    });
    if (item.productId === null) {
      throw new Error("Expected a product-backed demo order item");
    }
    const productId = item.productId;

    await executeBusinessCommand(
      { prisma: demoClient() as never },
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
            productId,
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
            productId,
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
            currency: "DZD" as const,
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

    await expect(removeAlgerianDemoWorkspace(demoClient())).resolves.toMatchObject({
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
    await loadAlgerianDemoWorkspace(demoClient());

    await executeBusinessCommand(
      { prisma: demoClient() as never },
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

    await expect(getAlgerianDemoWorkspaceStatus(demoClient())).resolves.toMatchObject({
      loaded: true,
      hasBusinessData: true,
    });
    await expect(removeAlgerianDemoWorkspace(demoClient())).rejects.toMatchObject({
      code: "DEMO_REMOVAL_REAL_DATA_PRESENT",
      statusCode: 409,
    });
  });
});
