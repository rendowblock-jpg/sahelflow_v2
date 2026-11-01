process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDb, createTestPrisma, teardownTestPrisma } from "@/lib/data/__tests__/helpers";
import { db, shopContext } from "@/lib/db";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

// The permissions an actor holds are set per test; everything else in the module is the real one.
const granted = vi.hoisted(() => new Set<string>());
vi.mock("@/lib/identity/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/authorization")>();
  return { ...actual, trustedActionAllowed: vi.fn((_context: unknown, action: string) => granted.has(action)) };
});
vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import { emitNotificationEvent } from "../emit";
import { NOTIFICATION_KINDS, type NotificationKind } from "../event-kinds";
import { claimNativeDelivery, listNotifications, synchronizeNotifications } from "../notification-center";

function actor(memberDigit: string): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: memberDigit.repeat(32),
      workspaceMemberId: memberDigit.repeat(32),
      deviceId: "7".repeat(32),
      sessionId: `session-${memberDigit}`,
      role: "owner",
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: shopContext,
  } as TrustedActorContext;
}

const QUERY = { state: "active", limit: 50 } as const;
const INPUTS: Record<NotificationKind, { subject?: string; variant?: string }> = {
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

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = await createTestPrisma();
});
afterAll(async () => {
  await teardownTestPrisma(prisma);
});
beforeEach(async () => {
  granted.clear();
  await prisma.notificationDeliveryAttempt.deleteMany();
  await prisma.operationalNotification.deleteMany();
  await prisma.notificationEvent.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await cleanDb(prisma);
  let minutes = 0;
  for (const kind of NOTIFICATION_KINDS) {
    minutes += 1;
    const emitted = await emitNotificationEvent(db, { kind, shopId: "test", at: new Date(Date.now() - minutes * 60_000), ...INPUTS[kind] });
    expect(emitted.emitted).toBe(true);
  }
});

async function seenBy(context: TrustedActorContext): Promise<string[]> {
  await synchronizeNotifications(context);
  const listed = await listNotifications(context, QUERY);
  return listed.notifications.map((row) => row.kind).sort();
}

const ORDER_KINDS = ["order.new", "orders.toConfirm"];
const CHAT_KINDS = ["whatsapp.held", "whatsapp.received"];
const SETTINGS_KINDS = ["ai.quota", "backup.failed", "licence.ending", "update.available"];

describe("each alert kind checks the permission that matches its subject", () => {
  it.each([
    ["nothing", [], []],
    ["conversations.read only", ["conversations.read"], CHAT_KINDS],
    ["settings.read only", ["settings.read"], SETTINGS_KINDS],
    ["orders.read only: order alerts, but not the delivery alert", ["orders.read"], ORDER_KINDS],
    ["deliveries.read only: no order alert, no delivery alert", ["deliveries.read"], []],
    ["orders.read + deliveries.read", ["orders.read", "deliveries.read"], [...ORDER_KINDS, "delivery.failed"]],
  ] as Array<[string, string[], string[]]>)("a member holding %s", async (_name, permissions, expected) => {
    for (const permission of permissions) granted.add(permission);
    expect(await seenBy(actor("1"))).toEqual([...expected].sort());
  });

  it("every permission together shows all nine kinds", async () => {
    for (const permission of ["orders.read", "deliveries.read", "conversations.read", "settings.read"]) granted.add(permission);
    expect(await seenBy(actor("2"))).toEqual([...NOTIFICATION_KINDS].sort());
  });

  it("rows already shown disappear from the list and the unread count when the permission is taken away", async () => {
    for (const permission of ["orders.read", "deliveries.read", "conversations.read", "settings.read"]) granted.add(permission);
    const context = actor("3");
    expect(await seenBy(context)).toHaveLength(9);

    granted.delete("deliveries.read");
    granted.delete("settings.read");
    const listed = await listNotifications(context, QUERY);
    expect(listed.notifications.map((row) => row.kind).sort()).toEqual([...ORDER_KINDS, ...CHAT_KINDS].sort());
    expect(listed.unreadCount).toBe(4);
  });

  it("a delivery alert cannot be opened for a native alert once deliveries.read is gone", async () => {
    for (const permission of ["orders.read", "deliveries.read"]) granted.add(permission);
    const context = actor("4");
    await synchronizeNotifications(context);
    const row = (await listNotifications(context, QUERY)).notifications.find((item) => item.kind === "delivery.failed");
    expect(row).toBeDefined();
    granted.delete("deliveries.read");
    expect(await claimNativeDelivery(context, row?.id ?? "missing")).toEqual({ deliver: false, reasonCode: "not-found" });
  });
});
