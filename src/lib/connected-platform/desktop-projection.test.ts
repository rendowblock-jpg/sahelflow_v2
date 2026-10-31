import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  read: vi.fn(),
  stats: vi.fn(),
  recent: vi.fn(),
  analytics: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./phone-today-counts", () => ({ readPhoneTodayCounts: h.read }));
vi.mock("@/lib/data/dashboard", () => ({
  getDashboardStats: h.stats,
  getRecentOrders: h.recent,
}));
vi.mock("@/lib/data/analytics-data", () => ({ getDashboardAnalytics: h.analytics }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    db: {
      $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
        run({
          setting: {
            findUnique: async () => null,
            upsert: async () => ({}),
          },
        }),
    },
  };
});
vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import type { Phase2Action } from "@/lib/identity/permissions";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import { publishRemoteDashboardProjection } from "./desktop-projection";
import { openConnectedEnvelope } from "./envelope";
import type { ConnectedEnvelope } from "./protocol";
import { generateConnectedKeyPair } from "./payload-crypto";

// The three key names the phone reads from stats (control-plane/pwa/src/today/
// relay-source.ts, parseDashboard). One shared literal list: if either side renames
// a key, this list and the PWA check below stop agreeing.
const PHONE_TODAY_KEYS = ["ordersWaiting", "whatsappHeld", "codToCollectDzd"] as const;

// MAX_CIPHERTEXT_CHARS in src/lib/connected-platform/protocol.ts (not exported).
const RELAY_CIPHERTEXT_CAP = 512 * 1024;

const DEVICE_ID = "7".repeat(32);
const MEMBER_ID = "6".repeat(32);
const SHOP = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "shop-test-a",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "4".repeat(64),
});

function actor(
  role: "owner" | "operator",
  permissions?: readonly Phase2Action[],
): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "5".repeat(32),
      workspaceMemberId: MEMBER_ID,
      deviceId: "8".repeat(32),
      sessionId: "session-1",
      role,
      policyVersion: 1,
      revocationEpoch: 0,
      ...(permissions ? { permissions } : {}),
    },
    shop: SHOP,
  } as TrustedActorContext;
}

const STATS = {
  ordersToday: 4,
  ordersTrend: 20,
  revenueToday: 12_000,
  revenueTrend: 10,
  realizedRevenueToday: 8_000,
  realizedRevenueTrend: 5,
  newCustomers: 2,
  activeConversations: 3,
  pendingDeliveries: 1,
  lowStockProducts: 6,
};

const RECENT = Array.from({ length: 8 }, (_, i) => ({
  id: `order-${i}`,
  orderNumber: `ORD-${i}`,
  status: "pending",
  wilaya: "Alger",
  totalPrice: 3_500,
  items: [{ id: `item-${i}` }],
  customer: { name: "Seller customer" },
}));

const SERIES = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-09-${String(i + 1).padStart(2, "0")}`,
  revenue: 12_000 + i,
  orders: 4,
}));

type Counts = Readonly<Record<(typeof PHONE_TODAY_KEYS)[number], number | null>>;

async function publish(
  context: TrustedActorContext,
  counts: Counts,
): Promise<{
  stats: Record<string, unknown>;
  envelope: ConnectedEnvelope;
}> {
  h.read.mockResolvedValue(counts);
  const desktop = generateConnectedKeyPair();
  const phone = generateConnectedKeyPair();
  let sent: ConnectedEnvelope | null = null;
  const client = {
    listDevices: async () => ({
      devices: [
        {
          device_id: DEVICE_ID,
          member_id: MEMBER_ID,
          encryption_public_key: phone.encryptionPublicKeyJwk,
          revocation_epoch: 0,
        },
      ],
    }),
    putCommandPolicy: async () => ({ status: "stored", policyVersion: 1 }),
    putProjection: async (envelope: ConnectedEnvelope) => {
      sent = envelope;
      return { status: "stored", sequence: envelope.sequence };
    },
  };
  await publishRemoteDashboardProjection({
    client: client as never,
    desktopKeys: desktop,
    actorContext: context,
    deviceId: DEVICE_ID,
    now: new Date("2026-10-31T01:00:00.000Z"),
  });
  if (!sent) throw new Error("projection was not sent");
  const envelope: ConnectedEnvelope = sent;
  const opened = openConnectedEnvelope<{ stats: Record<string, unknown> }>(
    envelope,
    desktop.signingPublicKey,
    phone.encryptionPrivateKeyPkcs8,
    new Date("2026-10-31T01:05:00.000Z"),
  );
  return { stats: opened.payload.stats, envelope };
}

const ALL: Counts = { ordersWaiting: 7, whatsappHeld: 2, codToCollectDzd: 45_000 };
const NONE: Counts = { ordersWaiting: null, whatsappHeld: null, codToCollectDzd: null };
const keysIn = (stats: Record<string, unknown>) =>
  PHONE_TODAY_KEYS.filter((key) => key in stats);

beforeEach(() => {
  h.read.mockReset();
  h.stats.mockReset().mockResolvedValue(STATS);
  h.recent.mockReset().mockResolvedValue(RECENT);
  h.analytics.mockReset().mockResolvedValue({
    revenueSeries: SERIES,
    customerGrowth: [],
    deliveryPerformance: { deliveryRate: 80, delivered: 8, inTransit: 1, pending: 1, returned: 0 },
  });
});

describe("desktop dashboard projection carries the exact today numbers", () => {
  it("asks for, and the phone receives, all three numbers for the owner", async () => {
    const { stats } = await publish(actor("owner"), ALL);
    expect(h.read).toHaveBeenCalledTimes(1);
    expect(h.read.mock.calls[0]?.[0]).toEqual({
      want: { ordersWaiting: true, whatsappHeld: true, codToCollectDzd: true },
    });
    expect(stats).toMatchObject(ALL);
  });

  it("never queries the money amount for a member without order financials", async () => {
    const { stats } = await publish(
      actor("operator", ["shops.read", "orders.read", "conversations.read"]),
      { ordersWaiting: 7, whatsappHeld: 2, codToCollectDzd: null },
    );
    expect(h.read.mock.calls[0]?.[0]).toEqual({
      want: { ordersWaiting: true, whatsappHeld: true, codToCollectDzd: false },
    });
    expect(keysIn(stats)).toEqual(["ordersWaiting", "whatsappHeld"]);
  });

  it("never queries WhatsApp for a member without conversations", async () => {
    const { stats } = await publish(
      actor("operator", ["shops.read", "orders.read", "orders.financials.read"]),
      { ordersWaiting: 7, whatsappHeld: null, codToCollectDzd: 45_000 },
    );
    expect(h.read.mock.calls[0]?.[0]).toEqual({
      want: { ordersWaiting: true, whatsappHeld: false, codToCollectDzd: true },
    });
    expect(keysIn(stats)).toEqual(["ordersWaiting", "codToCollectDzd"]);
  });

  it("never queries orders for a member who cannot read them, even with financials", async () => {
    await publish(
      actor("operator", ["shops.read", "orders.financials.read"]),
      NONE,
    );
    expect(h.read.mock.calls[0]?.[0]).toEqual({
      want: { ordersWaiting: false, whatsappHeld: false, codToCollectDzd: false },
    });
  });

  it("publishes without the failed number and still publishes", async () => {
    const { stats } = await publish(actor("owner"), {
      ordersWaiting: 7,
      whatsappHeld: null,
      codToCollectDzd: 0,
    });
    expect(stats.codToCollectDzd).toBe(0);
    expect(keysIn(stats)).toEqual(["ordersWaiting", "codToCollectDzd"]);
  });

  it("uses the same key names as the phone reader", async () => {
    const { stats } = await publish(actor("owner"), ALL);
    expect(keysIn(stats)).toEqual([...PHONE_TODAY_KEYS]);
    for (const key of PHONE_TODAY_KEYS) {
      const value = stats[key];
      // the phone only accepts whole, non-negative, safe integers
      expect(typeof value === "number" && Number.isSafeInteger(value) && value >= 0).toBe(true);
    }
  });

  // The phone code lives on another branch; when it is in this tree, check it for real.
  const phoneReader = join(process.cwd(), "control-plane/pwa/src/today/relay-source.ts");
  it.skipIf(!existsSync(phoneReader))("the phone reader reads exactly these stats keys", () => {
    const source = readFileSync(phoneReader, "utf8");
    for (const key of PHONE_TODAY_KEYS) expect(source).toContain(`stats.${key}`);
  });

  it("stays far under the relay cap with the three fields added", async () => {
    const withCounts = await publish(actor("owner"), ALL);
    const without = await publish(actor("owner"), NONE);
    const added = withCounts.envelope.ciphertext.length - without.envelope.ciphertext.length;
    // three small integers add about 70 bytes of JSON, about 100 base64 chars
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThan(200);
    // a full projection (8 orders, 30 days) is a few KB: under one sixteenth of the cap
    expect(withCounts.envelope.ciphertext.length).toBeLessThan(RELAY_CIPHERTEXT_CAP / 16);
  });
});
