// W3-F3 step 4: the command outbox. A command is built ONCE, kept on the phone, and drawn as done only when the PC says so.
import { describe, expect, it } from "vitest";
import { COMMAND_EXPIRY_MS } from "../../../src/lib/connected-platform/contracts";
import { mapResultCode } from "../src/outbox/codes";
import { createOutbox, type OutboxDeps, type ParsedResult } from "../src/outbox/outbox";
import { transition, type CmdEvent, type CmdState, type OutboxRecord } from "../src/outbox/state";
import type { Db, StoreName } from "../src/storage/idb";

const T0 = Date.UTC(2026, 9, 31, 8, 0, 0); const DEVICE = "phone_pwa_0001";
const rec = (over: Partial<OutboxRecord> = {}): OutboxRecord => ({
  commandId: "cmd_00000001", idempotencyKey: "idem_0000001", kind: "command.orders.confirm", target: { type: "order", id: "o1", expectedVersion: 3 }, labelForUi: "Order 1042", draftText: "",
  sealedEnvelopeJson: "{\"sealed\":1}", state: "queued", createdAt: T0, expiresAt: T0 + 12 * 3_600_000, attempts: 0, nextTryAt: T0, lastError: null, relaySequence: null, policyVersion: 7, ...over,
});
const ev = (e: CmdEvent): CmdEvent => e;

describe("transition table", () => {
  const rows: ReadonlyArray<readonly [string, CmdState, CmdEvent, CmdState]> = [
    ["relay accepted", "queued", ev({ type: "relay_accepted", at: T0 + 1, relaySequence: 4 }), "sent"],
    ["relay says queued: NOT done", "sent", ev({ type: "relay_state", at: T0 + 1, state: "queued" }), "sent"],
    ["relay says committed but no sealed result yet: NOT done", "sent", ev({ type: "relay_state", at: T0 + 1, state: "committed" }), "sent"],
    ["relay says expired", "sent", ev({ type: "relay_state", at: T0 + 1, state: "expired" }), "expired"],
    ["relay says revoked", "queued", ev({ type: "relay_state", at: T0 + 1, state: "revoked" }), "failed"],
    ["verified result committed", "sent", ev({ type: "result", at: T0 + 1, outcome: "committed" }), "committed"],
    ["verified result failed", "sent", ev({ type: "result", at: T0 + 1, outcome: "failed", code: "ORDER_CHANGED" }), "failed"],
    ["result code EXPIRED", "sent", ev({ type: "result", at: T0 + 1, outcome: "expired", code: "EXPIRED" }), "expired"],
    ["an expired RESULT envelope is unknown, never failed", "sent", ev({ type: "result_unreadable", at: T0 + 1, reason: "expired" }), "unknown"],
    ["a forged result is ignored", "sent", ev({ type: "result_unreadable", at: T0 + 1, reason: "bad_signature" }), "sent"],
    ["deadline passes while queued", "queued", ev({ type: "tick", at: T0 + 12 * 3_600_000 }), "expired"],
    ["the clock alone does not expire a SENT command (the PC may have confirmed it in time)", "sent", ev({ type: "tick", at: T0 + 12 * 3_600_000 + 1 }), "sent"],
    ["deadline passes while sent and the relay still holds it unexecuted", "sent", ev({ type: "late_queued", at: T0 + 12 * 3_600_000 }), "expired"],
    ["late look before the deadline changes nothing", "sent", ev({ type: "late_queued", at: T0 + 12 * 3_600_000 - 1 }), "sent"],
    ["deadline passes while sent and the relay settled nothing: unknown, never expired", "sent", ev({ type: "late_unsure", at: T0 + 12 * 3_600_000 }), "unknown"],
    ["before the deadline nothing happens", "queued", ev({ type: "tick", at: T0 + 12 * 3_600_000 - 1 }), "queued"],
    ["unknown does not expire by the clock (the PC already answered)", "unknown", ev({ type: "tick", at: T0 + 13 * 3_600_000 }), "unknown"],
    ["unknown is settled by the re-read projection", "unknown", ev({ type: "reread", at: T0 + 1, executed: true }), "committed"],
    ["unknown stays unknown when the re-read shows nothing", "unknown", ev({ type: "reread", at: T0 + 1, executed: false }), "unknown"],
    ["network failure keeps it queued", "queued", ev({ type: "send_failed", at: T0 + 1, error: "network" }), "queued"],
    ["PC off keeps it queued", "queued", ev({ type: "waiting_pc", at: T0 + 1 }), "queued"],
    ["committed is final", "committed", ev({ type: "relay_state", at: T0 + 1, state: "expired" }), "committed"],
    ["failed is final", "failed", ev({ type: "result", at: T0 + 1, outcome: "committed" }), "failed"],
    ["expired is final", "expired", ev({ type: "relay_accepted", at: T0 + 1, relaySequence: 1 }), "expired"],
  ];
  it.each(rows)("%s", (_n, from, event, to) => { expect(transition(rec({ state: from }), event).state).toBe(to); });
  it("a failed send backs off and counts attempts; PC-off waits a minute", () => {
    const a = transition(rec(), ev({ type: "send_failed", at: T0 + 10, error: "network" }));
    expect(a).toMatchObject({ attempts: 1, lastError: "network" }); expect(a.nextTryAt).toBeGreaterThan(T0 + 10);
    const b = transition(rec(), ev({ type: "send_failed", at: T0 + 10, error: "rate", retryAfterMs: 90_000 })); expect(b.nextTryAt).toBe(T0 + 10 + 90_000);
    expect(transition(rec(), ev({ type: "waiting_pc", at: T0 + 10 }))).toMatchObject({ lastError: "waiting_pc", nextTryAt: T0 + 60_010 });
  });
});

describe("result codes", () => {
  it.each([["ORDER_ALREADY_CONFIRMED", "done"], ["ORDER_ALREADY_CANCELLED", "done"], ["ORDER_CHANGED", "review"], ["ALREADY_ANSWERED", "answered"], ["REMOTE_POLICY_STALE", "resync"], ["EXPIRED", "expired"], ["SOMETHING_ELSE", "failed"]])("%s -> %s", (code, ui) => { expect(mapResultCode(code)).toBe(ui); });
});

function memDb(): Db {
  const m = new Map<string, Map<string, unknown>>(); const of = (s: StoreName): Map<string, unknown> => { let x = m.get(s); if (!x) { x = new Map(); m.set(s, x); } return x; };
  return { get: async <T>(s: StoreName, k: string) => of(s).get(k) as T | undefined, put: async (s, k, v) => { of(s).set(k, v); }, remove: async (s, k) => { of(s).delete(k); }, clear: async (s) => { of(s).clear(); }, keys: async (s) => [...of(s).keys()], close: () => undefined };
}
function rig(over: Partial<OutboxDeps> = {}) {
  let clock = T0; let ids = 0; const posted: string[] = []; const sealed: string[] = []; let policy = 7;
  const script: { status: number; body: unknown; retryAfterMs?: number }[] = []; const statusScript: { status: number; body: unknown }[] = [];
  const results: ParsedResult[] = [];
  const deps: OutboxDeps = {
    db: memDb(), now: () => clock, deviceId: DEVICE, newId: () => `id_${String(++ids).padStart(8, "0")}`, policyVersion: () => policy,
    seal: async (i) => { const json = JSON.stringify({ sealed: sealed.length + 1, v: i.policyVersion, c: i.commandId, k: i.idempotencyKey }); sealed.push(json); return json; },
    post: async (json) => { posted.push(json); const next = script.shift(); if (!next) throw new Error("network"); return next; },
    status: async () => statusScript.shift() ?? { status: 200, body: { state: "queued", result: null } },
    openResult: async () => results.shift() ?? { ok: false, reason: "malformed" },
    ...over,
  };
  return { deps, posted, sealed, script, statusScript, results, ob: createOutbox(deps), at: (ms: number) => { clock = T0 + ms; }, setPolicy: (v: number) => { policy = v; }, db: deps.db };
}
const confirm = { kind: "command.orders.confirm" as const, target: { type: "order" as const, id: "o1", expectedVersion: 3 }, labelForUi: "Order 1042", draftText: "" };

describe("outbox", () => {
  it("enqueue builds the envelope once, stores it, and sets the deadline by kind", async () => {
    const r = rig(); const out = await r.ob.enqueue(confirm);
    expect(out.ok).toBe(true); if (!out.ok) return;
    expect(out.record).toMatchObject({ state: "queued", attempts: 0, createdAt: T0, expiresAt: T0 + COMMAND_EXPIRY_MS["command.orders.confirm"], policyVersion: 7 });
    expect(out.record.idempotencyKey).not.toBe(out.record.commandId); expect(r.sealed).toHaveLength(1);
    expect(await r.db.get("outbox", out.record.commandId)).toEqual(out.record);
    const long = await rig().ob.enqueue({ ...confirm, labelForUi: "x".repeat(200) }); if (long.ok) expect(long.record.labelForUi).toHaveLength(80);
    const note = await rig().ob.enqueue({ ...confirm, kind: "command.comments.write" }); if (note.ok) expect(note.record.expiresAt - note.record.createdAt).toBe(COMMAND_EXPIRY_MS["command.comments.write"]);
  });
  it("one open command per target, at most 20 open", async () => {
    const r = rig(); expect((await r.ob.enqueue(confirm)).ok).toBe(true);
    expect(await r.ob.enqueue({ ...confirm, kind: "command.orders.reject" })).toEqual({ ok: false, reason: "target_busy" });
    for (let i = 2; i <= 20; i += 1) expect((await r.ob.enqueue({ ...confirm, target: { type: "order", id: `o${i}`, expectedVersion: 1 } })).ok).toBe(true);
    expect(await r.ob.enqueue({ ...confirm, target: { type: "order", id: "o21", expectedVersion: 1 } })).toEqual({ ok: false, reason: "too_many" });
  });
  it("send: the relay's 'queued' is NOT done; committed needs the relay AND an opened result for THIS device and THIS command", async () => {
    const r = rig(); const out = await r.ob.enqueue(confirm); if (!out.ok) throw new Error("setup"); const id = out.record.commandId;
    r.script.push({ status: 202, body: { commandId: id, state: "queued", relaySequence: 5 } }); await r.ob.flush();
    expect((await r.ob.list())[0]).toMatchObject({ state: "sent", relaySequence: 5 });
    r.statusScript.push({ status: 200, body: { state: "queued", result: null } }); await r.ob.refresh(); expect((await r.ob.list())[0]?.state).toBe("sent");
    r.statusScript.push({ status: 200, body: { state: "committed", result: { env: 1 } } }); r.results.push({ ok: true, deviceId: "phone_other_99", commandId: id, outcome: "committed" });
    await r.ob.refresh(); expect((await r.ob.list())[0]?.state).toBe("sent");
    r.statusScript.push({ status: 200, body: { state: "committed", result: { env: 1 } } }); r.results.push({ ok: true, deviceId: DEVICE, commandId: "cmd_other_0002", outcome: "committed" });
    await r.ob.refresh(); expect((await r.ob.list())[0]?.state).toBe("sent");
    r.statusScript.push({ status: 200, body: { state: "committed", result: { env: 1 } } }); r.results.push({ ok: true, deviceId: DEVICE, commandId: id, outcome: "committed" });
    await r.ob.refresh(); expect((await r.ob.list())[0]?.state).toBe("committed");
  });
  it("a result envelope that expired is 'unknown', never 'failed'", async () => {
    const r = rig(); const out = await r.ob.enqueue(confirm); if (!out.ok) throw new Error("setup");
    r.script.push({ status: 202, body: { state: "queued" } }); await r.ob.flush();
    r.statusScript.push({ status: 200, body: { state: "committed", result: { env: 1 } } }); r.results.push({ ok: false, reason: "expired" });
    await r.ob.refresh(); expect((await r.ob.list())[0]?.state).toBe("unknown");
  });
  it("a retry resends the SAME stored envelope (re-sealing would change the digest and the relay would answer 409)", async () => {
    const r = rig(); const out = await r.ob.enqueue(confirm); if (!out.ok) throw new Error("setup");
    await r.ob.flush(); expect((await r.ob.list())[0]).toMatchObject({ state: "queued", attempts: 1, lastError: "network" });
    await r.ob.flush(); expect(r.posted).toHaveLength(1);
    r.at(10 * 60_000); r.script.push({ status: 202, body: { state: "queued", relaySequence: 1 } }); await r.ob.flush();
    expect(r.posted).toHaveLength(2); expect(r.posted[1]).toBe(r.posted[0]); expect(r.sealed).toHaveLength(1);
  });
  it("409 idempotency_conflict: ask the relay and adopt what it stored", async () => {
    const r = rig(); const out = await r.ob.enqueue(confirm); if (!out.ok) throw new Error("setup");
    r.script.push({ status: 409, body: { error: "idempotency_conflict" } });
    r.statusScript.push({ status: 200, body: { state: "committed", result: { env: 1 } } }); r.results.push({ ok: true, deviceId: DEVICE, commandId: out.record.commandId, outcome: "committed" });
    await r.ob.flush(); expect((await r.ob.list())[0]?.state).toBe("committed");
  });
  it("403 command_not_authorized with a NEW policy version: seal again once (same ids), then wait for the PC", async () => {
    const r = rig(); const out = await r.ob.enqueue(confirm); if (!out.ok) throw new Error("setup");
    r.setPolicy(8); r.script.push({ status: 403, body: { error: "command_not_authorized" } }, { status: 202, body: { state: "queued", relaySequence: 2 } });
    await r.ob.flush();
    expect(r.sealed).toHaveLength(2); expect(JSON.parse(r.sealed[1] ?? "{}")).toMatchObject({ v: 8, c: out.record.commandId, k: out.record.idempotencyKey });
    expect((await r.ob.list())[0]).toMatchObject({ state: "sent", policyVersion: 8 });
    const q = rig(); const o2 = await q.ob.enqueue(confirm); if (!o2.ok) throw new Error("setup");
    q.script.push({ status: 403, body: { error: "command_not_authorized" } }); await q.ob.flush();
    expect(q.sealed).toHaveLength(1); expect((await q.ob.list())[0]).toMatchObject({ state: "queued", lastError: "waiting_pc" });
  });
  it("deadline: a queued command past its deadline is expired and never posted; relay 'expired' is expired", async () => {
    const r = rig(); const out = await r.ob.enqueue(confirm); if (!out.ok) throw new Error("setup");
    r.at(13 * 3_600_000); await r.ob.flush(); expect(r.posted).toHaveLength(0); expect((await r.ob.list())[0]?.state).toBe("expired");
    const q = rig(); await q.ob.enqueue(confirm); q.script.push({ status: 202, body: { state: "queued" } }); await q.ob.flush();
    q.statusScript.push({ status: 200, body: { state: "expired", result: null } }); await q.ob.refresh(); expect((await q.ob.list())[0]?.state).toBe("expired");
  });
});
