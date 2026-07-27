import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
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

beforeEach(async () => {
  prisma = await createTestPrisma();
});

afterEach(async () => {
  await prisma.storefrontConfig.deleteMany().catch(() => undefined);
  await prisma.extractionMetric.deleteMany().catch(() => undefined);
  await prisma.auditLog.deleteMany().catch(() => undefined);
  await removeAlgerianDemoWorkspace(client()).catch(() => undefined);
  await prisma.customer.deleteMany().catch(() => undefined);
  await disconnectTestPrisma(prisma);
});

describe("Algerian demo workspace lifecycle", () => {
  it("recovers a marker-less partial footprint and seeds one complete atomic workspace", async () => {
    await prisma.category.create({
      data: { id: "demo-interrupted-category", name: "Interrupted demo" },
    });

    const recoverable = await getAlgerianDemoWorkspaceStatus(client());
    expect(recoverable).toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: false,
    });

    const loaded = await loadAlgerianDemoWorkspace(client());
    expect(loaded).toMatchObject({
      loaded: true,
      canSeed: false,
      counts: {
        categories: 5,
        products: 16,
        customers: 24,
        orders: 48,
      },
    });
    expect(
      await prisma.category.findUnique({
        where: { id: "demo-interrupted-category" },
      }),
    ).toBeNull();
  });

  it("treats independent seller configuration as non-empty shop authority", async () => {
    await prisma.storefrontConfig.create({
      data: {
        id: "seller-storefront",
        slug: "seller-storefront",
        name: "Seller storefront",
        theme: JSON.stringify({ template: "minimal" }),
        productIds: "[]",
        isActive: false,
      },
    });

    const status = await getAlgerianDemoWorkspaceStatus(client());
    expect(status).toMatchObject({
      loaded: false,
      canSeed: false,
      hasBusinessData: true,
    });
    await expect(loadAlgerianDemoWorkspace(client())).rejects.toMatchObject({
      code: "DEMO_SHOP_NOT_EMPTY",
      statusCode: 409,
    });
    expect(await prisma.order.count()).toBe(0);
  });

  it("blocks destructive cleanup for a seller storefront and removes demo-derived analytics and audit rows", async () => {
    await loadAlgerianDemoWorkspace(client());

    await prisma.extractionMetric.create({
      data: {
        id: "generated-extraction-metric",
        messageId: "demo-conversation-01-message-1",
        method: "regex",
        confidence: 0.91,
        isComplete: true,
        fieldAccuracy: JSON.stringify({ phone: true }),
        latencyMs: 19,
      },
    });
    await prisma.auditLog.create({
      data: {
        id: "generated-audit-row",
        action: "order.viewed",
        entity: "order",
        entityId: "demo-order-001",
        actor: "owner",
      },
    });
    await prisma.storefrontConfig.create({
      data: {
        id: "seller-storefront",
        slug: "seller-storefront",
        name: "Seller storefront",
        theme: JSON.stringify({ template: "minimal" }),
        productIds: JSON.stringify(["demo-product-01"]),
        isActive: false,
      },
    });

    await expect(removeAlgerianDemoWorkspace(client())).rejects.toMatchObject({
      code: "DEMO_REMOVAL_REAL_DATA_PRESENT",
      statusCode: 409,
    });
    expect(await prisma.product.count()).toBe(16);

    await prisma.storefrontConfig.delete({ where: { id: "seller-storefront" } });
    const cleared = await removeAlgerianDemoWorkspace(client());
    expect(cleared).toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: false,
    });
    expect(
      await prisma.extractionMetric.findUnique({
        where: { id: "generated-extraction-metric" },
      }),
    ).toBeNull();
    expect(
      await prisma.auditLog.findUnique({ where: { id: "generated-audit-row" } }),
    ).toBeNull();
  });
});
