// W3-F3 round 3b, D2: a SENT command is never expired by the clock alone. At its deadline the phone asks the relay once.
import { describe, expect, it } from "vitest";
import { createOutbox, type ParsedResult, type Reply } from "../src/outbox/outbox";
import type { Db, StoreName } from "../src/storage/idb";

const T0 = Date.UTC(2026, 9, 31, 8, 0, 0); const DEVICE = "phone_pwa_0001"; const DAY = 24 * 3_600_000;
function memDb(): Db {
  const m = new Map<string, Map<string, unknown>>(); const of = (n: string): Map<string, unknown> => { let s = m.get(n); if (!s) { s = new Map(); m.set(n, s); } return s; };
  return { get: async <T>(n: StoreName, k: string) => of(n).get(k) as T | undefined, put: async (n, k, v) => { of(n).set(k, v); }, remove: async (n, k) => { of(n).delete(k); }, clear: async (n) => { of(n).clear(); }, keys: async (n) => [...of(n).keys()], close: () => undefined };
}
function rig() {
  let t = T0; let n = 0; const asked: string[] = []; let posts = 0;
  const reply: { next: () => Promise<Reply> } = { next: async () => ({ status: 200, body: { state: "queued", result: null } }) };
  const opened: { value: ParsedResult | null } = { value: null };
  const ob = createOutbox({
    db: memDb(), now: () => t, deviceId: DEVICE, newId: () => `cmd_${String(++n).padStart(8, "0")}`, policyVersion: () => 7,
    seal: async () => "{\"sealed\":1}", post: async () => { posts += 1; return { status: 202, body: { relaySequence: 1 } }; },
    status: async (id) => { asked.push(id); return reply.next(); },
    openResult: async () => opened.value ?? { ok: false, reason: "bad_signature" },
  });
  const confirm = { kind: "command.orders.confirm", target: { type: "order", id: "o1", expectedVersion: 3 }, labelForUi: "Order 1", draftText: "" } as const;
  const sentCommand = async () => { const put = await ob.enqueue(confirm); if (!put.ok) throw new Error("setup"); await ob.flush(); return put.record; };
  return { ob, asked, posts: () => posts, reply, opened, at: (ms: number) => { t = ms; }, sentCommand, only: async () => (await ob.list())[0] };
}

describe("D2: the late look", () => {
  it("the PC confirmed in time, the phone looks after the deadline: committed (via refresh and via flush), the relay is asked once", async () => {
    for (const via of ["refresh", "flush"] as const) {
      const r = rig(); const rec = await r.sentCommand(); expect((await r.only())?.state).toBe("sent");
      r.reply.next = async () => ({ status: 200, body: { state: "committed", result: { env: 1 } } });
      r.opened.value = { ok: true, deviceId: DEVICE, commandId: rec.commandId, outcome: "committed" };
      r.at(rec.expiresAt + 60_000); await r.ob[via]();
      expect(await r.only()).toMatchObject({ state: "committed", lastError: null }); expect(r.asked).toEqual([rec.commandId]);
    }
  });
  it("the relay cannot be reached (thrown, 503, 404 or a result that does not verify): unknown, never expired or failed", async () => {
    const cases: ReadonlyArray<readonly [string, () => Promise<Reply>]> = [
      ["offline", async () => { throw new TypeError("offline"); }], ["503", async () => ({ status: 503, body: null })], ["404", async () => ({ status: 404, body: null })],
      ["committed but the result does not verify", async () => ({ status: 200, body: { state: "committed", result: { forged: 1 } } })],
    ];
    for (const [name, next] of cases) {
      const r = rig(); const rec = await r.sentCommand(); r.reply.next = next; r.at(rec.expiresAt + 1); await r.ob.refresh();
      const after = await r.only(); expect({ name, state: after?.state }).toEqual({ name, state: "unknown" });
    }
  });
  it("unknown after a silent relay is settled when the relay answers later", async () => {
    const r = rig(); const rec = await r.sentCommand(); r.reply.next = async () => { throw new TypeError("offline"); }; r.at(rec.expiresAt + 5); await r.ob.refresh();
    expect(await r.only()).toMatchObject({ state: "unknown", lastError: "deadline_unsure" });
    r.reply.next = async () => ({ status: 200, body: { state: "committed", result: { env: 1 } } }); r.opened.value = { ok: true, deviceId: DEVICE, commandId: rec.commandId, outcome: "committed" };
    r.at(rec.expiresAt + DAY); await r.ob.refresh(); expect((await r.only())?.state).toBe("committed");
  });
  it("the relay still holds it unexecuted after the deadline: expired, as before", async () => {
    const r = rig(); const rec = await r.sentCommand(); r.at(rec.expiresAt); await r.ob.refresh();
    expect(await r.only()).toMatchObject({ state: "expired", lastError: "deadline" }); expect(r.asked).toHaveLength(1);
  });
  it("a command the PC refused with EXPIRED is expired; a failed result stays failed", async () => {
    const r = rig(); const rec = await r.sentCommand(); r.reply.next = async () => ({ status: 200, body: { state: "rejected", result: { env: 1 } } });
    r.opened.value = { ok: true, deviceId: DEVICE, commandId: rec.commandId, outcome: "expired", code: "EXPIRED" }; r.at(rec.expiresAt + 1); await r.ob.refresh();
    expect((await r.only())?.state).toBe("expired");
  });
  it("a command that was never sent expires without asking the relay and is never posted", async () => {
    const r = rig(); const put = await r.ob.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: "o1", expectedVersion: 3 }, labelForUi: "Order 1", draftText: "" });
    if (!put.ok) throw new Error("setup"); r.at(put.record.expiresAt + 1); await r.ob.flush();
    expect((await r.only())?.state).toBe("expired"); expect(r.asked).toHaveLength(0); expect(r.posts()).toBe(0);
  });
  it("before the deadline a sent command is not asked about by the clock", async () => {
    const r = rig(); const rec = await r.sentCommand(); r.at(rec.expiresAt - 1); await r.ob.flush();
    expect((await r.only())?.state).toBe("sent"); expect(r.asked).toHaveLength(0);
  });
});
