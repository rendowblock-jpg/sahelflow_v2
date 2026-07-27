import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  clearAlgerianDemoData,
  getAlgerianDemoStatus,
  seedAlgerianDemoData,
} from "@/lib/demo/algerian-demo";
import { finalizeAlgerianDemoStory } from "@/lib/demo/algerian-demo-story";
import {
  createTestPrisma,
  disconnectTestPrisma,
} from "@/lib/data/__tests__/helpers";

let prisma: PrismaClient;

const demoClient = () => prisma as never;

beforeEach(async () => {
  prisma = await createTestPrisma();
});

afterEach(async () => {
  await clearAlgerianDemoData(demoClient()).catch(() => undefined);
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
      include: { items: true, delivery: true, orderChanges: true },
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
    expect(flagship?.orderChanges.map((change) => change.actionType)).toEqual(
      expect.arrayContaining([
        "status_change",
        "ship",
        "deliver",
        "cod_remitted",
      ]),
    );

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
});
