import { describe, expect, it, vi } from "vitest";
import { buildNotificationMarker, emitNotificationEvent, type NotificationEmitClient } from "../emit";
import type { NotificationKind } from "../event-kinds";

// The three kinds whose emit call-site lives in another track's files
// (orders to confirm, held WhatsApp message, AI pause): the helper must be ready.
const KINDS: readonly NotificationKind[] = ["orders.toConfirm", "whatsapp.held", "ai.quota"];
const AT = new Date("2026-10-31T10:00:00Z");
const HOSTILE = "Ahmed Benali 0555123456 5000 DA";
const ALLOWED_KEYS = [
  "category", "eventKey", "eventType", "expiresAt", "id", "link", "occurredAt",
  "requiredAction", "severity", "sourceRecordId", "targetId", "targetType",
];

describe.each(KINDS)("emit helper for %s", (kind) => {
  it("builds a PII-free marker even when handed a name, a phone and an amount", () => {
    const marker = buildNotificationMarker({ kind, shopId: "shop_1", at: AT, subject: HOSTILE, variant: "0555123456789" });
    expect(Object.keys(marker).sort()).toEqual(ALLOWED_KEYS);
    expect(JSON.stringify(marker)).not.toMatch(/Ahmed|Benali|0555|\b5000\b/);
    for (const value of Object.values(marker)) {
      if (typeof value === "string") expect(value).toMatch(/^[A-Za-z0-9._:/?=&%-]+$/);
    }
  });
  it("writes one marker through the client and says so", async () => {
    const upsert = vi.fn(async () => ({}));
    const client = { notificationEvent: { upsert } } as unknown as NotificationEmitClient;
    const result = await emitNotificationEvent(client, { kind, shopId: "shop_1", at: AT, subject: "item_1", variant: "p1" });
    expect(result.emitted).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
  it("the same situation on the same day is the same key (no second row)", () => {
    const a = buildNotificationMarker({ kind, shopId: "shop_1", at: AT, subject: "item_1", variant: "p1" });
    const b = buildNotificationMarker({ kind, shopId: "shop_1", at: new Date(AT.getTime() + 60_000), subject: "item_1", variant: "p1" });
    expect(b.eventKey).toBe(a.eventKey);
  });
});
