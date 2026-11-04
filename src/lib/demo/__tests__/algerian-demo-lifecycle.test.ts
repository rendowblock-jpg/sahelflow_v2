import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { DbClient } from "@/lib/db";
import {
  getAlgerianDemoWorkspaceStatus,
  loadAlgerianDemoWorkspace,
  removeAlgerianDemoWorkspace,
} from "@/lib/demo/algerian-demo-lifecycle";
import { ALGERIAN_DEMO_WORKSPACE_VERSION } from "@/lib/demo/algerian-demo-year";
import {
  withDemoPolicyLock,
} from "@/lib/demo/algerian-demo-policy";
import { setSetting, SETTING_KEYS } from "@/lib/settings";
import {
  createTestPrisma,
  disconnectTestPrisma,
} from "@/lib/data/__tests__/helpers";

let prisma: PrismaClient;
const client = () => prisma as unknown as DbClient;
const context = () => ({ prisma: client(), shop: {} as never });
const DEMO_REFERENCE_NOW = "2026-08-19T12:00:00.000Z";

async function resetLifecycleTables(): Promise<void> {
  await prisma.$transaction([
    prisma.extractionMetric.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.aiChatMessage.deleteMany(),
    prisma.aiChatSession.deleteMany(),
    prisma.automationLog.deleteMany(),
    prisma.automation.deleteMany(),
    prisma.returnNote.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.return.deleteMany(),
    prisma.delivery.deleteMany(),
    prisma.orderChange.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.storefrontConfig.deleteMany(),
    prisma.cannedResponse.deleteMany(),
    prisma.whatsAppTemplate.deleteMany(),
    prisma.integration.deleteMany(),
    prisma.secret.deleteMany(),
    prisma.phoneReputation.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.counter.deleteMany(),
  ]);
}

beforeEach(async () => {
  process.env.SF_DEMO_REFERENCE_NOW = DEMO_REFERENCE_NOW;
  prisma = await createTestPrisma();
  await resetLifecycleTables();
});

afterEach(async () => {
  await resetLifecycleTables().catch(() => undefined);
  await disconnectTestPrisma(prisma);
  delete process.env.SF_DEMO_REFERENCE_NOW;
});

describe("Algerian demo workspace lifecycle", () => {
  it("recovers a marker-less partial footprint and seeds one complete atomic annual workspace", async () => {
    await prisma.category.create({
      data: { id: "demo-interrupted-category", name: "Interrupted demo" },
    });

    const recoverable = await getAlgerianDemoWorkspaceStatus(client());
    expect(recoverable).toMatchObject({
      version: ALGERIAN_DEMO_WORKSPACE_VERSION,
      loaded: false,
      canSeed: true,
      hasBusinessData: false,
    });

    const loaded = await loadAlgerianDemoWorkspace(client());
    expect(loaded).toMatchObject({
      version: ALGERIAN_DEMO_WORKSPACE_VERSION,
      loaded: true,
      canSeed: false,
      counts: {
        categories: 5,
        products: 16,
        customers: 24,
      },
    });
    expect(loaded.counts.orders).toBeGreaterThanOrEqual(160);
    expect(loaded.counts.expenses).toBeGreaterThanOrEqual(40);

    const oldest = await prisma.order.findFirst({
      where: { id: { startsWith: "demo-" } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    expect(oldest).not.toBeNull();
    const reference = new Date(DEMO_REFERENCE_NOW);
    const oldestAgeDays =
      (reference.getTime() - (oldest?.createdAt.getTime() ?? reference.getTime())) /
      86_400_000;
    expect(oldestAgeDays).toBeGreaterThanOrEqual(350);
    expect(oldestAgeDays).toBeLessThanOrEqual(365);

    expect(
      await prisma.category.findUnique({
        where: { id: "demo-interrupted-category" },
      }),
    ).toBeNull();
  });

  it("loads the demo alongside independent seller configuration (FD-054 coexist)", async () => {
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
      canSeed: true,
      hasBusinessData: true,
    });
    // FD-054: seller configuration no longer blocks loading — the demo
    // workspace loads alongside it with demo-tagged rows only.
    const loaded = await loadAlgerianDemoWorkspace(client());
    expect(loaded).toMatchObject({ loaded: true, version: ALGERIAN_DEMO_WORKSPACE_VERSION });

    const removed = await removeAlgerianDemoWorkspace(client());
    expect(removed).toMatchObject({ loaded: false, canSeed: true });
    expect(
      await prisma.storefrontConfig.findUnique({ where: { id: "seller-storefront" } }),
    ).not.toBeNull();
  });

  it("treats sequence and extraction analytics as seller-owned business traces (informational under FD-054)", async () => {
    await prisma.counter.create({ data: { name: "ORD", value: 7 } });
    expect(await getAlgerianDemoWorkspaceStatus(client())).toMatchObject({
      canSeed: true,
      hasBusinessData: true,
    });
    await prisma.counter.deleteMany();

    await prisma.extractionMetric.create({
      data: {
        id: "seller-extraction-metric",
        method: "regex",
        confidence: 0.82,
        isComplete: true,
        latencyMs: 12,
      },
    });
    expect(await getAlgerianDemoWorkspaceStatus(client())).toMatchObject({
      canSeed: true,
      hasBusinessData: true,
    });
  });

  it("treats current and retained legacy phone reputation as seller-owned operational data (FD-054 coexist)", async () => {
    await prisma.phoneReputation.create({
      data: {
        id: "seller-phone-risk",
        phoneHash: "a".repeat(64),
        last4: "1122",
        severity: "risky",
        reportedBy: "owner",
      },
    });

    expect(await getAlgerianDemoWorkspaceStatus(client())).toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: true,
    });
    await prisma.phoneReputation.deleteMany();

    await prisma.setting.create({
      data: {
        key: "phone_reputation_blacklist",
        value: JSON.stringify([
          { phoneHash: "legacy-risk", reason: "refused delivery" },
        ]),
      },
    });
    expect(await getAlgerianDemoWorkspaceStatus(client())).toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: true,
    });
    // FD-054: retained seller intelligence loads alongside the demo and
    // must survive the load untouched.
    await loadAlgerianDemoWorkspace(client());
    expect(
      await prisma.setting.findUnique({
        where: { key: "phone_reputation_blacklist" },
      }),
    ).not.toBeNull();
  });

  it("reports malformed retained legacy phone-reputation data as informational state (FD-054)", async () => {
    await prisma.setting.create({
      data: {
        key: "phone_reputation_blacklist",
        value: "{not-valid-json",
      },
    });

    const status = await getAlgerianDemoWorkspaceStatus(client());
    expect(status).toMatchObject({ canSeed: true, hasBusinessData: true });
  });

  it("loads the demo alongside effectful daily-report settings (FD-054 coexist)", async () => {
    await prisma.setting.createMany({
      data: [
        { key: "daily_report_enabled", value: "true" },
        { key: "daily_report_phone", value: "0550009999" },
      ],
    });

    const status = await getAlgerianDemoWorkspaceStatus(client());
    expect(status).toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: true,
    });
    // FD-054: effectful report settings no longer block loading; demo rows
    // contribute to the aggregates until removed (FD-052 mixing accepted).
    const loaded = await loadAlgerianDemoWorkspace(client());
    expect(loaded).toMatchObject({ loaded: true });
    expect(
      await prisma.setting.findUnique({ where: { key: "daily_report_phone" } }),
    ).not.toBeNull();
  });

  it("accepts effectful daily-report settings while the demo is loaded (FD-052 A coexist)", async () => {
    await loadAlgerianDemoWorkspace(client());

    // The former DEMO_REPORT_CONFIGURATION_BLOCKED guard is gone: real shop
    // configuration flows while demo rows contribute to reports until removed.
    await expect(
      setSetting(context(), SETTING_KEYS.dailyReportEnabled, "true"),
    ).resolves.toBeUndefined();
    await expect(
      setSetting(context(), SETTING_KEYS.dailyReportPhone, "0550009999"),
    ).resolves.toBeUndefined();
    expect(await prisma.setting.count()).toBeGreaterThan(0);
  });

  it("protects demo lifecycle markers from the general settings service", async () => {
    await expect(
      setSetting(context(), "demo_seed_version", ""),
    ).rejects.toMatchObject({
      code: "SETTING_RESERVED_KEY",
      statusCode: 403,
    });
    await expect(
      setSetting(context(), "demo_seed_created_at", "2026-07-27"),
    ).rejects.toMatchObject({
      code: "SETTING_RESERVED_KEY",
      statusCode: 403,
    });
    expect(await prisma.setting.count()).toBe(0);
  });

  it("serializes concurrent demo-policy operations in arrival order", async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withDemoPolicyLock(async () => {
      events.push("first-start");
      await firstGate;
      events.push("first-end");
    });
    await Promise.resolve();

    const second = withDemoPolicyLock(async () => {
      events.push("second-start");
      events.push("second-end");
    });
    await Promise.resolve();
    expect(events).toEqual(["first-start"]);

    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual([
      "first-start",
      "first-end",
      "second-start",
      "second-end",
    ]);
  });

  it("removes the demo graph alongside a seller storefront and demo-derived analytics and audit rows (FD-054)", async () => {
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

    // FD-054: removal no longer refuses when seller state exists — the
    // storefront JSON reference is not FK-enforced, so removal deletes only
    // the demo graph and leaves the seller storefront untouched.
    const cleared = await removeAlgerianDemoWorkspace(client());
    expect(cleared).toMatchObject({
      loaded: false,
      canSeed: true,
      hasBusinessData: true,
    });
    expect(
      await prisma.extractionMetric.findUnique({
        where: { id: "generated-extraction-metric" },
      }),
    ).toBeNull();
    expect(
      await prisma.auditLog.findUnique({ where: { id: "generated-audit-row" } }),
    ).toBeNull();
    expect(
      await prisma.storefrontConfig.findUnique({ where: { id: "seller-storefront" } }),
    ).not.toBeNull();
    expect(await prisma.product.count()).toBe(0);
  });
  // F-0030: a shop whose inbox holds real chats AND sample chats. The inbox
  // "Remove sample data" control calls exactly this path (GET status for the
  // counts it prints, then DELETE). Only `demo-` rows may go.
  async function createRealShopRows() {
    await prisma.category.create({ data: { id: "real-cat-1", name: "Real category" } });
    await prisma.product.create({
      data: { id: "real-product-1", name: "Real product", price: 1500, categoryId: "real-cat-1" },
    });
    await prisma.customer.create({
      data: { id: "real-customer-1", name: "Real Customer", phone: "0555123456" },
    });
    await prisma.order.create({
      data: {
        id: "real-order-1",
        orderNumber: "DZ-REAL-0001",
        customerId: "real-customer-1",
        totalPrice: 1500,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "Rue 1",
        phone: "0555123456",
      },
    });
    await prisma.conversation.create({
      data: {
        id: "real-conversation-1",
        channel: "whatsapp",
        contactName: "Real Customer",
        contactPhone: "0555123456",
        sourceId: "213555123456@s.whatsapp.net",
        lastMessageAt: new Date("2026-08-19T10:00:00.000Z"),
      },
    });
    await prisma.message.create({
      data: {
        id: "real-message-1",
        conversationId: "real-conversation-1",
        body: "Salam, je veux commander",
        direction: "incoming",
        timestamp: new Date("2026-08-19T10:00:00.000Z"),
      },
    });
  }

  async function countByTag() {
    const demo = { startsWith: "demo-" };
    const real = { not: { startsWith: "demo-" } };
    const per = async (model: "conversation" | "message" | "order" | "customer" | "product") => {
      const delegate = prisma[model] as unknown as {
        count(args: { where: { id: object } }): Promise<number>;
      };
      return {
        demo: await delegate.count({ where: { id: demo } }),
        real: await delegate.count({ where: { id: real } }),
      };
    };
    return {
      conversations: await per("conversation"),
      messages: await per("message"),
      orders: await per("order"),
      customers: await per("customer"),
      products: await per("product"),
    };
  }

  it("a shop with BOTH real and sample rows: the status counts only the sample rows, and removal deletes only them (F-0030)", { timeout: 120_000 }, async () => {
    await createRealShopRows();
    await loadAlgerianDemoWorkspace(client());

    const before = await countByTag();
    // The shop really is mixed: every kind has real AND sample rows.
    for (const kind of ["conversations", "messages", "orders", "customers", "products"] as const) {
      expect(before[kind].real, `real ${kind}`).toBe(1);
      expect(before[kind].demo, `sample ${kind}`).toBeGreaterThan(0);
    }

    // The counts the inbox dialog prints come from this status. They must be
    // the SAMPLE counts, not the shop totals.
    const status = await getAlgerianDemoWorkspaceStatus(client());
    expect(status.loaded).toBe(true);
    expect(status.counts.conversations).toBe(before.conversations.demo);
    expect(status.counts.orders).toBe(before.orders.demo);
    expect(status.counts.customers).toBe(before.customers.demo);
    expect(status.counts.products).toBe(before.products.demo);

    const removed = await removeAlgerianDemoWorkspace(client());
    expect(removed.loaded).toBe(false);
    expect(removed.counts.conversations).toBe(0);

    const after = await countByTag();
    for (const kind of ["conversations", "messages", "orders", "customers", "products"] as const) {
      expect(after[kind].demo, `sample ${kind} after`).toBe(0);
      expect(after[kind].real, `real ${kind} after`).toBe(1);
    }
    // The real rows are intact, not just present.
    expect(
      await prisma.conversation.findUniqueOrThrow({ where: { id: "real-conversation-1" } }),
    ).toMatchObject({ contactName: "Real Customer", sourceId: "213555123456@s.whatsapp.net" });
    expect(await prisma.message.findUniqueOrThrow({ where: { id: "real-message-1" } })).toMatchObject({
      body: "Salam, je veux commander",
    });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: "real-order-1" } })).toMatchObject({
      orderNumber: "DZ-REAL-0001",
      totalPrice: 1500,
    });
  });

  it("a real order placed for a sample customer blocks removal and deletes nothing, real or sample (F-0030)", { timeout: 120_000 }, async () => {
    await createRealShopRows();
    await loadAlgerianDemoWorkspace(client());
    await prisma.order.create({
      data: {
        id: "real-order-for-sample-customer",
        orderNumber: "DZ-REAL-0002",
        customerId: "demo-customer-01",
        totalPrice: 900,
        wilaya: "Alger",
        commune: "Kouba",
        address: "Rue 2",
        phone: "0555000001",
      },
    });
    const before = await countByTag();

    await expect(removeAlgerianDemoWorkspace(client())).rejects.toMatchObject({
      code: "DEMO_REMOVAL_BLOCKED_BY_REFERENCES",
      statusCode: 409,
    });

    expect(await countByTag()).toEqual(before);
    expect(
      (await getAlgerianDemoWorkspaceStatus(client())).loaded,
    ).toBe(true);
  });
});
