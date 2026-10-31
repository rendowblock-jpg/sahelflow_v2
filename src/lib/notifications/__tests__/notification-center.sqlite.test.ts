process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanDb,
  createTestPrisma,
  seedCustomer,
  seedOrder,
  seedProduct,
  teardownTestPrisma,
} from "@/lib/data/__tests__/helpers";
import { db, shopContext } from "@/lib/db";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import { emitNotificationEvent } from "../emit";
import { KIND_SPECS, NOTIFICATION_KINDS, type NotificationKind } from "../event-kinds";
import {
  claimNativeDelivery,
  listNotifications,
  readAllNotifications,
  synchronizeNotifications,
  updateNotificationPreference,
} from "../notification-center";

const CTX = {
  version: 1,
  actor: {
    kind: "person",
    personId: "5".repeat(32),
    workspaceMemberId: "6".repeat(32),
    deviceId: "7".repeat(32),
    sessionId: "session-1",
    role: "owner",
    policyVersion: 1,
    revocationEpoch: 0,
  },
  shop: shopContext,
} as TrustedActorContext;

const QUERY = { state: "active", limit: 50 } as const;

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
  await prisma.notificationDeliveryAttempt.deleteMany();
  await prisma.operationalNotification.deleteMany();
  await prisma.notificationEvent.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await cleanDb(prisma);
  customerId = (await seedCustomer(prisma)).id;
  productId = (await seedProduct(prisma)).id;
});

async function importedOrder(at: Date) {
  const order = await seedOrder(prisma, { customerId, productId, status: "pending" });
  await prisma.order.update({ where: { id: order.id }, data: { source: "web", createdAt: at } });
}

function bucketStart(minutesAgo: number): Date {
  const bucket = (KIND_SPECS["order.new"].bucketMinutes ?? 10) * 60_000;
  return new Date(Math.floor((Date.now() - minutesAgo * 60_000) / bucket) * bucket + 30_000);
}

const NINE_INPUTS: Record<NotificationKind, { subject?: string; variant?: string }> = {
  "order.new": {},
  "orders.toConfirm": {},
  "delivery.failed": { subject: "dlv_1", variant: "booking_failed" },
  "whatsapp.received": { subject: "conv_1" },
  "whatsapp.held": { subject: "msg_1" },
  "backup.failed": {},
  "licence.ending": { variant: "3" },
  "update.available": { variant: "1.2.3" },
  "ai.quota": { subject: "gemini", variant: "p1" },
};

describe("listNotifications / synchronizeNotifications on real SQLite", () => {
  it("the nine kinds appear once each, each with its own wording, and a second sync adds nothing", async () => {
    let minutes = 0;
    for (const kind of NOTIFICATION_KINDS) {
      minutes += 1;
      const emitted = await emitNotificationEvent(db, { kind, shopId: "test", at: new Date(Date.now() - minutes * 60_000), ...NINE_INPUTS[kind] });
      expect(emitted.emitted).toBe(true);
    }
    expect((await synchronizeNotifications(CTX)).projected).toBe(9);
    expect((await synchronizeNotifications(CTX)).projected).toBe(0);
    const listed = await listNotifications(CTX, QUERY);
    expect(listed.notifications.map((row) => row.kind).sort()).toEqual([...NOTIFICATION_KINDS].sort());
    expect(new Set(listed.notifications.map((row) => row.titleKey)).size).toBe(9);
    expect(listed.unreadCount).toBe(9);
  });

  it("40 'new order' events in one burst give ONE row with count 40", async () => {
    const at = bucketStart(180);
    for (let i = 0; i < 40; i += 1) {
      const when = new Date(at.getTime() + i * 1000);
      await importedOrder(when);
      await emitNotificationEvent(db, { kind: "order.new", shopId: "test", at: when });
    }
    await synchronizeNotifications(CTX);
    const listed = await listNotifications(CTX, QUERY);
    // The 40 imported orders are 3 hours old and still pending: the to-confirm sweep (w169) rightly adds ITS own line.
    const newOrderRows = listed.notifications.filter((row) => row.kind === "order.new");
    expect(newOrderRows).toHaveLength(1);
    expect(newOrderRows[0]).toMatchObject({ kind: "order.new", count: 40 });
    expect(listed.notifications.map((row) => row.kind).sort()).toEqual(["order.new", "orders.toConfirm"]);
    expect(listed.unreadCount).toBe(2);
  });

  it("read-all clears the badge for every durable row", async () => {
    for (const kind of ["order.new", "backup.failed", "update.available"] as const) {
      await emitNotificationEvent(db, { kind, shopId: "test", at: new Date(), ...NINE_INPUTS[kind] });
    }
    await synchronizeNotifications(CTX);
    expect((await listNotifications(CTX, QUERY)).unreadCount).toBe(3);
    expect(await readAllNotifications(CTX)).toEqual({ updated: 3 });
    const after = await listNotifications(CTX, QUERY);
    expect(after.unreadCount).toBe(0);
    expect(after.notifications.every((row) => row.read)).toBe(true);
  });

  it("50 groups: the list answers fast enough (number printed)", async () => {
    const bucket = (KIND_SPECS["order.new"].bucketMinutes ?? 10) * 60_000;
    const first = bucketStart(60).getTime();
    for (let i = 0; i < 50; i += 1) {
      const when = new Date(first - i * bucket);
      if (i % 5 === 0) await importedOrder(when);
      await emitNotificationEvent(db, { kind: "order.new", shopId: "test", at: when });
    }
    await synchronizeNotifications(CTX);
    await listNotifications(CTX, QUERY); // warm-up
    const t0 = performance.now();
    const listed = await listNotifications(CTX, QUERY);
    const ms = performance.now() - t0;
    console.info(`LIST50_MS=${ms.toFixed(1)}`);
    expect(listed.notifications).toHaveLength(50);
    expect(ms).toBeLessThan(2000);
  });
});

describe("claimNativeDelivery on real SQLite", () => {
  async function oneRowId(): Promise<string> {
    await emitNotificationEvent(db, { kind: "update.available", shopId: "test", at: new Date(), variant: "1.2.3" });
    await synchronizeNotifications(CTX);
    const row = (await listNotifications(CTX, QUERY)).notifications[0];
    if (!row) throw new Error("no row projected");
    return row.id;
  }

  it("an unknown id answers calmly and never throws (A9)", async () => {
    await expect(claimNativeDelivery(CTX, "does-not-exist")).resolves.toMatchObject({ deliver: false, reasonCode: "not-found" });
    await expect(claimNativeDelivery(CTX, "x".repeat(300))).resolves.toMatchObject({ deliver: false });
  });

  it("no preference row yet: 'disabled', not a 500", async () => {
    const id = await oneRowId();
    await prisma.notificationPreference.deleteMany();
    await expect(claimNativeDelivery(CTX, id)).resolves.toEqual({ deliver: false, reasonCode: "disabled" });
  });

  it("quiet hours hold the toast (row kept, state held) but the list still shows the row", async () => {
    const id = await oneRowId();
    const now = new Date();
    const minute = ((now.getUTCHours() + 1) % 24) * 60 + now.getUTCMinutes();
    await updateNotificationPreference(CTX, {
      nativeEnabled: true,
      quietStartMinute: (minute - 30 + 1440) % 1440,
      quietEndMinute: (minute + 30) % 1440,
    });
    await expect(claimNativeDelivery(CTX, id)).resolves.toMatchObject({ deliver: false, reasonCode: "quiet-hours" });
    const attempt = await prisma.notificationDeliveryAttempt.findFirst({ where: { notificationId: id } });
    expect(attempt?.state).toBe("held");
    const listed = await listNotifications(CTX, QUERY);
    expect(listed.notifications.map((row) => row.id)).toContain(id);
  });

  it("outside quiet hours the first claim delivers, the second (lease) does not", async () => {
    const id = await oneRowId();
    await updateNotificationPreference(CTX, { nativeEnabled: true, quietStartMinute: null, quietEndMinute: null });
    await expect(claimNativeDelivery(CTX, id)).resolves.toMatchObject({ deliver: true });
    await expect(claimNativeDelivery(CTX, id)).resolves.toMatchObject({ deliver: false });
  });
});
