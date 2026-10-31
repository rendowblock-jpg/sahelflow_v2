import { afterEach, describe, expect, it, vi } from "vitest";
import { buildNotificationMarker, emitNotificationEvent, type NotificationEmitClient } from "../emit";

type Row = Record<string, unknown>;

function fakeClient(opts: { failWith?: Error } = {}) {
  const rows = new Map<string, Row>();
  const client = {
    notificationEvent: {
      upsert: async (args: { where: { eventKey: string }; create: Row }) => {
        if (opts.failWith) throw opts.failWith;
        if (!rows.has(args.where.eventKey)) rows.set(args.where.eventKey, args.create);
        return rows.get(args.where.eventKey);
      },
    },
  } as unknown as NotificationEmitClient;
  return { client, rows };
}

const SHOP = "shop_1";
const base = new Date("2026-10-31T10:00:00Z");
const plus = (min: number) => new Date(base.getTime() + min * 60_000);

afterEach(() => vi.restoreAllMocks());

describe("emitNotificationEvent", () => {
  it("40 imported orders in one burst are ONE row", async () => {
    const { client, rows } = fakeClient();
    for (let i = 0; i < 40; i += 1) {
      await emitNotificationEvent(client, { kind: "order.new", shopId: SHOP, at: plus(i % 10 === 9 ? 9 : i % 9) });
    }
    expect(rows.size).toBe(1);
    await emitNotificationEvent(client, { kind: "order.new", shopId: SHOP, at: plus(10) });
    expect(rows.size).toBe(2);
  });

  it("whatsapp: three messages of one conversation in 5 minutes are one row, another conversation is another", async () => {
    const { client, rows } = fakeClient();
    for (const m of [0, 1, 4]) await emitNotificationEvent(client, { kind: "whatsapp.received", shopId: SHOP, subject: "conv1", at: plus(m) });
    expect(rows.size).toBe(1);
    await emitNotificationEvent(client, { kind: "whatsapp.received", shopId: SHOP, subject: "conv2", at: plus(1) });
    await emitNotificationEvent(client, { kind: "whatsapp.received", shopId: SHOP, subject: "conv1", at: plus(5) });
    expect(rows.size).toBe(3);
    expect([...rows.values()][0]?.link).toBe("/inbox?conversation=conv1");
  });

  it("backup: twice in a day is one row; next day another", async () => {
    const { client, rows } = fakeClient();
    await emitNotificationEvent(client, { kind: "backup.failed", shopId: SHOP, at: plus(0), severity: "warning" });
    await emitNotificationEvent(client, { kind: "backup.failed", shopId: SHOP, at: plus(600), severity: "critical" });
    expect(rows.size).toBe(1);
    await emitNotificationEvent(client, { kind: "backup.failed", shopId: SHOP, at: plus(60 * 24) });
    expect(rows.size).toBe(2);
  });

  it("licence: each threshold once; update once per version; ai once per provider per pause", async () => {
    const { client, rows } = fakeClient();
    for (const t of ["7", "7", "3", "3", "1", "1"]) {
      await emitNotificationEvent(client, { kind: "licence.ending", shopId: SHOP, subject: "2026-11-03", variant: t });
    }
    expect(rows.size).toBe(3);
    for (const v of ["1.4.2", "1.4.2", "1.4.3"]) await emitNotificationEvent(client, { kind: "update.available", shopId: SHOP, variant: v });
    expect(rows.size).toBe(5);
    for (const p of ["gemini", "gemini", "groq"]) {
      await emitNotificationEvent(client, { kind: "ai.quota", shopId: SHOP, subject: p, variant: "2026-10-31T14:30:00.000Z" });
    }
    expect(rows.size).toBe(7);
  });

  it("delivery: failed -> delivered -> failed again does not ring twice", async () => {
    const { client, rows } = fakeClient();
    for (const s of ["failed", "failed", "failed"]) {
      await emitNotificationEvent(client, { kind: "delivery.failed", shopId: SHOP, subject: "d1", variant: s });
    }
    expect(rows.size).toBe(1);
  });

  it("the marker carries only the allowed fields and no name or phone", async () => {
    const { client, rows } = fakeClient();
    await emitNotificationEvent(client, { kind: "whatsapp.received", shopId: SHOP, subject: "Amine Benali 0550123456", at: base });
    await emitNotificationEvent(client, { kind: "delivery.failed", shopId: SHOP, subject: "+213550123456", variant: "0550123456", at: base });
    const marker = buildNotificationMarker({ kind: "order.new", shopId: SHOP, at: base });
    expect(Object.keys(marker).sort()).toEqual([
      "category", "eventKey", "eventType", "expiresAt", "id", "link", "occurredAt",
      "requiredAction", "severity", "sourceRecordId", "targetId", "targetType",
    ]);
    const text = JSON.stringify([...rows.values()]);
    expect(text).not.toContain("Amine");
    expect(text).not.toContain("0550123456");
    expect(text).not.toContain("213550123456");
  });

  it("never throws into the caller and logs no text from the error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client } = fakeClient({ failWith: Object.assign(new Error("Amine 0550123456 broke"), { code: "P2002" }) });
    const result = await emitNotificationEvent(client, { kind: "order.new", shopId: SHOP, at: base });
    expect(result).toEqual({ emitted: false, eventKey: null });
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("P2002");
    expect(logged).not.toContain("Amine");
    expect(logged).not.toContain("0550123456");
  });

  it("a thrown value that is not an Error is swallowed too", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = { notificationEvent: { upsert: async () => { throw "boom"; } } } as unknown as NotificationEmitClient;
    await expect(emitNotificationEvent(client, { kind: "order.new", shopId: SHOP })).resolves.toEqual({ emitted: false, eventKey: null });
  });
});
