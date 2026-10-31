// Shared fixtures for the orders and notes tests (W3-F4). A FAKE outbox: no relay, no crypto.
import type { OrderProjectionRow, OrdersProjection } from "../../../src/lib/connected-platform/contracts";
import type { EnqueueInput, EnqueueResult } from "../src/outbox/outbox";
import type { OutboxRecord } from "../src/outbox/state";
import type { Db } from "../src/storage/idb";
import type { OrdersModel } from "../src/views/orders/model";
import type { OrdersHost } from "../src/views/orders/controller";
import { createDraftStore } from "../src/views/notes";

export const NOW = Date.UTC(2026, 9, 31, 10, 0);
export const row = (o: Partial<OrderProjectionRow> = {}): OrderProjectionRow => ({
  id: "o1", orderNumber: "SF-1042", status: "pending", version: 3, createdAt: new Date(NOW - 2 * 3_600_000).toISOString(), wilaya: "Alger",
  items: [{ name: "Robe", qty: 2 }, { name: "Echarpe", qty: 1 }], moreCount: 1, source: "whatsapp", totalPrice: 5400,
  customerName: "Amina B.", phone: "0550123456", address: "12 rue Didouche", noteCount: 2, noteVersion: 7, ...o,
});
export const proj = (orders: readonly OrderProjectionRow[], window?: Partial<OrdersProjection["window"]>): OrdersProjection => ({
  orders, window: { shown: orders.length, pendingTotal: orders.filter((r) => r.status === "pending").length, truncated: false, ...window },
});
export const rec = (o: Partial<OutboxRecord> = {}): OutboxRecord => ({
  commandId: "c1", idempotencyKey: "k1", kind: "command.orders.confirm", target: { type: "order", id: "o1", expectedVersion: 3 }, labelForUi: "SF-1042",
  draftText: "", sealedEnvelopeJson: "{}", state: "queued", createdAt: NOW - 1000, expiresAt: NOW + 43_200_000, attempts: 0, nextTryAt: NOW,
  lastError: null, relaySequence: null, policyVersion: 1, ...o,
});
export const mk = (o: Partial<OrdersModel> = {}): OrdersModel => ({
  locale: "en", now: NOW, online: true, pcOff: false, timeZone: "UTC", read: "ready", data: proj([row()]), asOf: NOW - 60_000, commands: [],
  filter: "confirm", openId: null, openedVersion: null, sheet: null, draft: "", noteError: null, notice: null, ...o,
});
export function memDb(): Db {
  const stores = new Map<string, Map<string, unknown>>();
  const s = (n: string): Map<string, unknown> => { let m = stores.get(n); if (!m) { m = new Map(); stores.set(n, m); } return m; };
  return {
    get: async <T>(n: string, k: string) => s(n).get(k) as T | undefined,
    put: async (n: string, k: string, v: unknown) => { s(n).set(k, v); },
    remove: async (n: string, k: string) => { s(n).delete(k); },
    clear: async (n: string) => { s(n).clear(); },
    keys: async (n: string) => [...s(n).keys()],
  } as unknown as Db;
}
export type FakeOutbox = { calls: EnqueueInput[]; records: OutboxRecord[]; next: EnqueueResult | "throw" | null; enqueue(i: EnqueueInput): Promise<EnqueueResult>; list(): Promise<readonly OutboxRecord[]> };
export function fakeOutbox(): FakeOutbox {
  const f: FakeOutbox = {
    calls: [], records: [], next: null,
    async enqueue(i) {
      f.calls.push(i);
      if (f.next === "throw") throw new Error("boom");
      if (f.next) return f.next;
      const open = f.records.some((r) => r.state === "queued" || r.state === "sent" || r.state === "unknown");
      if (open && f.records.some((r) => r.target.id === i.target.id)) return { ok: false, reason: "target_busy" };
      const record = rec({ commandId: `c${f.records.length + 1}`, kind: i.kind, target: i.target, draftText: i.draftText, labelForUi: i.labelForUi, createdAt: NOW });
      f.records.push(record); return { ok: true, record };
    },
    async list() { return f.records; },
  };
  return f;
}
export function fakeHost(o: { data?: OrdersProjection | null; asOf?: number | null; now?: number; online?: boolean; read?: "loading" | "error" | "ready" } = {}) {
  const outbox = fakeOutbox(); const db = memDb(); const state = { now: o.now ?? NOW, online: o.online ?? true, pcOff: false, data: o.data === undefined ? proj([row()]) : o.data, asOf: o.asOf === undefined ? NOW - 60_000 : o.asOf, read: o.read ?? "ready", reloads: 0, went: [] as string[] };
  const host: OrdersHost = {
    now: () => state.now, locale: () => "en", online: () => state.online, pcOff: () => state.pcOff, timeZone: "UTC",
    read: () => ({ status: state.read, data: state.data, asOf: state.asOf }),
    reload: async () => { state.reloads += 1; },
    commands: () => outbox.list(), enqueue: (i) => outbox.enqueue(i),
    drafts: createDraftStore(db, () => state.now), authorityExpiresAt: () => undefined,
    go: (s) => { state.went.push(s); }, subscribe: () => () => undefined,
  };
  return { host, outbox, state, db };
}
