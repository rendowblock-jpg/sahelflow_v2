import { describe, expect, it } from "vitest";
import { resolveLiveEventState, type LiveClient } from "../live-state";

type O = { createdAt: Date; status: string; source: string; deletedAt: Date | null };
const at = (iso: string) => new Date(iso);

function fakeClient(orders: O[], messages: { conversationId: string; createdAt: Date; direction: string }[] = [], deliveries: { status: string; updatedAt: Date; deletedAt: Date | null }[] = []): LiveClient {
  const matchOrder = (o: O, where: Record<string, unknown>) => {
    const created = where.createdAt as { gte: Date; lt: Date } | undefined;
    if (created && !(o.createdAt >= created.gte && o.createdAt < created.lt)) return false;
    if (where.status !== undefined && o.status !== where.status) return false;
    if (where.deletedAt === null && o.deletedAt !== null) return false;
    const source = where.source as { not: string } | undefined;
    if (source && o.source === source.not) return false;
    return true;
  };
  return {
    order: {
      count: async ({ where }: { where: Record<string, unknown> }) => orders.filter((o) => matchOrder(o, where)).length,
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        orders.filter((o) => matchOrder(o, where)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null,
    },
    message: {
      count: async ({ where }: { where: { conversationId: string; direction: string; createdAt: { gte: Date; lt: Date } } }) =>
        messages.filter((m) => m.conversationId === where.conversationId && m.direction === where.direction && m.createdAt >= where.createdAt.gte && m.createdAt < where.createdAt.lt).length,
    },
    delivery: {
      count: async ({ where }: { where: { status: { in: string[] }; updatedAt: { gte: Date } } }) =>
        deliveries.filter((d) => where.status.in.includes(d.status) && d.updatedAt >= where.updatedAt.gte && d.deletedAt === null).length,
    },
  } as unknown as LiveClient;
}

const mkOrder = (iso: string, extra: Partial<O> = {}): O => ({ createdAt: at(iso), status: "pending", source: "csv", deletedAt: null, ...extra });
const event = { eventType: "order.new.v1", severity: "info", occurredAt: at("2026-10-31T10:03:00Z"), targetId: "shop_1" };

describe("the number is counted when read", () => {
  it("order.new counts its own 10-minute window, skips manual and deleted orders, follows new arrivals", async () => {
    const orders = [
      mkOrder("2026-10-31T10:01:00Z"), mkOrder("2026-10-31T10:05:00Z"), mkOrder("2026-10-31T10:09:59Z"),
      mkOrder("2026-10-31T10:02:00Z", { source: "manual" }),
      mkOrder("2026-10-31T10:04:00Z", { deletedAt: at("2026-10-31T11:00:00Z") }),
      mkOrder("2026-10-31T10:10:00Z"), mkOrder("2026-10-31T09:59:59Z"),
    ];
    const first = await resolveLiveEventState(fakeClient(orders), event);
    expect(first.count).toBe(3);
    orders.push(mkOrder("2026-10-31T10:07:00Z"), mkOrder("2026-10-31T10:08:00Z"));
    const later = await resolveLiveEventState(fakeClient(orders), event);
    expect(later.count).toBe(5);
    expect(later.stillTrue).toBe(true);
  });

  it("orders to confirm: live count and the 2 h boundary", async () => {
    const now = at("2026-10-31T12:00:00Z");
    const ev = { ...event, eventType: "orders.toConfirm.v1" };
    const exactly = await resolveLiveEventState(fakeClient([mkOrder("2026-10-31T10:00:00Z"), mkOrder("2026-10-31T11:50:00Z")]), ev, now);
    expect(exactly.count).toBe(2);
    expect(exactly.severity).toBe("info");
    const older = await resolveLiveEventState(fakeClient([mkOrder("2026-10-31T09:59:59Z")]), ev, now);
    expect(older.severity).toBe("warning");
    const none = await resolveLiveEventState(fakeClient([mkOrder("2026-10-31T11:00:00Z", { status: "confirmed" })]), ev, now);
    expect(none.stillTrue).toBe(false);
  });

  it("whatsapp counts inbound messages of that conversation in its 5-minute window", async () => {
    const messages = [
      { conversationId: "c1", createdAt: at("2026-10-31T10:01:00Z"), direction: "inbound" },
      { conversationId: "c1", createdAt: at("2026-10-31T10:04:00Z"), direction: "inbound" },
      { conversationId: "c1", createdAt: at("2026-10-31T10:02:00Z"), direction: "outbound" },
      { conversationId: "c2", createdAt: at("2026-10-31T10:02:00Z"), direction: "inbound" },
      { conversationId: "c1", createdAt: at("2026-10-31T10:05:00Z"), direction: "inbound" },
    ];
    const state = await resolveLiveEventState(fakeClient([], messages), { eventType: "whatsapp.received.v1", severity: "info", occurredAt: at("2026-10-31T10:01:00Z"), targetId: "c1" });
    expect(state.count).toBe(2);
    const legacy = await resolveLiveEventState(fakeClient([], messages), { eventType: "whatsapp.message.received.v1", severity: "info", occurredAt: at("2026-10-31T10:01:00Z"), targetId: "c1" });
    expect(legacy.kind).toBe("whatsapp.received");
  });

  it("failed deliveries are counted for the shop day; unknown types and unnumbered kinds say null", async () => {
    const deliveries = [
      { status: "failed", updatedAt: at("2026-10-31T09:00:00Z"), deletedAt: null },
      { status: "returned", updatedAt: at("2026-10-31T09:30:00Z"), deletedAt: null },
      { status: "delivered", updatedAt: at("2026-10-31T09:30:00Z"), deletedAt: null },
      { status: "failed", updatedAt: at("2026-10-30T09:30:00Z"), deletedAt: null },
    ];
    const d = await resolveLiveEventState(fakeClient([], [], deliveries), { ...event, eventType: "delivery.failed.v1" });
    expect(d.count).toBe(2);
    expect((await resolveLiveEventState(fakeClient([]), { ...event, eventType: "backup.failed.v1", severity: "critical" })).count).toBeNull();
    const unknown = await resolveLiveEventState(fakeClient([]), { ...event, eventType: "nope.v1" });
    expect(unknown.kind).toBeNull();
  });
});
