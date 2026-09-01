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
});
