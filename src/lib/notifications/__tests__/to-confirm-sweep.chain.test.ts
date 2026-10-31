process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * W3-G1 round 3 CHAIN test for `orders.toConfirm` (w169). The trigger is the REAL order rows (status pending, createdAt)
 * on a REAL SQLite and a fake clock (Date only). The seller's app syncs (real sync route), the sweep at the top of
 * synchronizeNotifications decides, and the test ends at the REAL list route in ar (RTL), fr and en with the catalog
 * sentence and the link. Decision of the lead: 2 hours pending, at most one grouped alert per hour, none in quiet hours,
 * drafts and cancelled orders never count, count 0 emits nothing.
 */
import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanDb,
  createTestPrisma,
  seedCustomer,
  seedOrder,
  seedProduct,
  teardownTestPrisma,
} from "@/lib/data/__tests__/helpers";

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  const { shopContext: shop } = await import("@/lib/db");
  const context = {
    version: 1, shop,
    actor: { kind: "person", personId: "5".repeat(32), workspaceMemberId: "6".repeat(32), deviceId: "7".repeat(32), sessionId: "session-chain-w169", role: "owner", policyVersion: 1, revocationEpoch: 0 },
  };
  return { ...actual, requireTrustedActor: vi.fn(async () => context), isTrustedActorContext: vi.fn(() => true) };
});
vi.mock("@/lib/identity/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/authorization")>();
  const { shopContext: shop } = await import("@/lib/db");
  return {
    ...actual,
    requireTrustedAction: vi.fn(async () => ({
      version: 1,
      shop,
      actor: {
        kind: "person", personId: "5".repeat(32), workspaceMemberId: "6".repeat(32),
        deviceId: "7".repeat(32), sessionId: "session-chain-w169", role: "owner", policyVersion: 1, revocationEpoch: 0,
      },
    })),
  };
});
vi.mock("next/headers", async () => (await import("./next-headers-mock")).nextHeadersMock());

import { db, shopContext } from "@/lib/db";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import { KIND_SPECS, NOTIFICATION_KINDS, TO_CONFIRM_AFTER_MS, TO_CONFIRM_ALERT_EVERY_MS } from "../event-kinds";
import { updateNotificationPreference } from "../notification-center";
import { isSafeNotificationLink } from "../native-client";
import { LOCALES, expectWording, sellerRowsOf, syncCentre } from "./seller-read";

const CTX = {
  version: 1,
  actor: {
    kind: "person", personId: "5".repeat(32), workspaceMemberId: "6".repeat(32), deviceId: "7".repeat(32),
    sessionId: "session-chain-w169", role: "owner", policyVersion: 1, revocationEpoch: 0,
  },
  shop: shopContext,
} as TrustedActorContext;

const MIN = 60_000;
const T0 = new Date("2026-10-31T08:00:00Z"); // 09:00 on the shop clock (Algiers, UTC+1)
const LINK = "/orders?status=pending";

let prisma: PrismaClient;
let customerId = "";
let productId = "";

beforeAll(async () => {
  prisma = await createTestPrisma();
});
afterAll(async () => {
  await teardownTestPrisma(prisma);
});
beforeEach(async () => {
  vi.useRealTimers();
  await prisma.notificationDeliveryAttempt.deleteMany();
  await prisma.operationalNotification.deleteMany();
  await prisma.notificationEvent.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await cleanDb(prisma);
  customerId = (await seedCustomer(prisma)).id;
  productId = (await seedProduct(prisma)).id;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

async function order(status: string, createdAt: Date, deletedAt: Date | null = null): Promise<string> {
  const row = await seedOrder(prisma, { customerId, productId, status });
  await prisma.order.update({ where: { id: row.id }, data: { createdAt, deletedAt } });
  return row.id;
}
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const afterMinutes = (minutes: number) => vi.setSystemTime(new Date(T0.getTime() + minutes * MIN));
const alerts = () => prisma.notificationEvent.count({ where: { eventType: "orders.toConfirm.v1" } });

describe("W3-G1 r3 chain: orders waiting in `pending` -> one grouped alert per hour (real rows, real SQLite, real routes)", () => {
  it("the constants are what the lead decided: 2 hours, one alert per hour", () => {
    expect(TO_CONFIRM_AFTER_MS).toBe(7_200_000);
    expect(TO_CONFIRM_ALERT_EVERY_MS).toBe(3_600_000);
  });

  it("119 minutes -> nothing; 120 minutes -> ONE alert with the count, read in ar (RTL), fr and en, linking to the pending orders", async () => {
    await order("pending", T0);
    await order("pending", T0);
    await order("pending", T0);
    afterMinutes(119);
    await syncCentre();
    expect(await alerts()).toBe(0);
    for (const locale of LOCALES) expect(await sellerRowsOf(locale, "orders.toConfirm")).toHaveLength(0);
    afterMinutes(120);
    await syncCentre();
    expect(await alerts()).toBe(1);
    for (const locale of LOCALES) {
      const rows = await sellerRowsOf(locale, "orders.toConfirm");
      expect(rows, `one alert in ${locale}`).toHaveLength(1);
      expectWording(rows[0]!, locale, "orders.toConfirm", 3, LINK);
    }
    const en = (await sellerRowsOf("en", "orders.toConfirm"))[0]!;
    expect(en.title).toBe("Orders to confirm");
    expect(en.body).toBe("You have 3 orders to confirm.");
    expect((await sellerRowsOf("fr", "orders.toConfirm"))[0]!.body).toBe("Vous avez 3 commandes à confirmer.");
    expect((await sellerRowsOf("ar", "orders.toConfirm"))[0]!.title).toBe("طلبات تنتظر التأكيد");
  });

  it("at most ONE alert per hour: many syncs in the same hour add nothing, the next hour adds one", async () => {
    await order("pending", T0);
    afterMinutes(120); // 10:00:00Z
    await syncCentre();
    afterMinutes(140);
    await syncCentre();
    at("2026-10-31T10:59:59Z");
    await syncCentre();
    await syncCentre();
    expect(await alerts()).toBe(1);
    at("2026-10-31T11:00:00Z");
    await syncCentre();
    at("2026-10-31T11:40:00Z");
    await syncCentre();
    expect(await alerts()).toBe(2);
    expect(await sellerRowsOf("en", "orders.toConfirm")).toHaveLength(2);
  });

  it("nothing inside the quiet window; the first sync after it ends gives one alert", async () => {
    await updateNotificationPreference(CTX, { quietStartMinute: 22 * 60, quietEndMinute: 7 * 60 });
    const created = new Date("2026-10-31T18:00:00Z");
    await order("pending", created);
    at("2026-10-31T22:30:00Z"); // 23:30 on the shop clock
    await syncCentre();
    at("2026-11-01T05:59:00Z"); // 06:59 on the shop clock
    await syncCentre();
    expect(await alerts()).toBe(0);
    at("2026-11-01T06:00:00Z"); // 07:00 on the shop clock: the window is over
    await syncCentre();
    expect(await alerts()).toBe(1);
  });

  it("drafts, cancelled, confirmed and deleted orders never count; a younger pending order is counted once an old one triggers", async () => {
    await order("draft", T0);
    await order("cancelled", T0);
    await order("confirmed", T0);
    await order("pending", T0, new Date(T0.getTime() + MIN));
    await order("pending", new Date(T0.getTime() + 10 * MIN));
    afterMinutes(121); // the only live pending order is 111 minutes old
    await syncCentre();
    expect(await alerts()).toBe(0);
    await order("pending", T0);
    await syncCentre();
    expect(await alerts()).toBe(1);
    const rows = await sellerRowsOf("en", "orders.toConfirm");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(2);
  });

  it("an order that is confirmed or cancelled stops counting at once; with none left the next hour emits nothing", async () => {
    const a = await order("pending", T0);
    const b = await order("pending", T0);
    const c = await order("pending", T0);
    afterMinutes(120);
    await syncCentre();
    expect((await sellerRowsOf("en", "orders.toConfirm"))[0]!.count).toBe(3);
    await prisma.order.updateMany({ where: { id: { in: [a, b] } }, data: { status: "confirmed" } });
    expect((await sellerRowsOf("en", "orders.toConfirm"))[0]!.count).toBe(1);
    await prisma.order.update({ where: { id: c }, data: { status: "cancelled" } });
    const zero = await sellerRowsOf("fr", "orders.toConfirm");
    expect(zero).toHaveLength(1);
    expect(zero[0]!.count).toBe(0);
    afterMinutes(185);
    await syncCentre();
    expect(await alerts()).toBe(1);
  });

  it("every kind points at a link the toast accepts (the three new kinds included)", () => {
    for (const kind of NOTIFICATION_KINDS) expect(isSafeNotificationLink(KIND_SPECS[kind].link), kind).toBe(true);
    expect(db).toBeDefined();
  });
});
