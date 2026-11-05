// W4SEC-07: an update, automatic or forced, never loses offline-queued work. The real outbox and the real draft store run on one
// in-memory database that outlives the "page"; a reload is a new page built on the same database. The update logic is the real one.
import { describe, expect, it } from "vitest";
import { createOutbox, type OutboxDeps } from "../src/outbox/outbox";
import type { OutboxRecord } from "../src/outbox/state";
import type { Db, StoreName } from "../src/storage/idb";
import { createUpdateController, type ContainerLike, type RegistrationLike, type WorkerLike } from "../src/sw/update";
import { createDraftStore } from "../src/views/notes";

const HOUR = 3_600_000; const T0 = Date.UTC(2026, 10, 5, 8, 0, 0);
const autoUpdate = () => import("../src/sw/auto-update");
const safetyMod = () => import("../src/sw/update-safety");

function memDb(): Db {
  const m = new Map<string, Map<string, unknown>>(); const of = (s: StoreName): Map<string, unknown> => { let x = m.get(s); if (!x) { x = new Map(); m.set(s, x); } return x; };
  return { get: async <T>(s: StoreName, k: string) => of(s).get(k) as T | undefined, put: async (s, k, v) => { of(s).set(k, v); }, remove: async (s, k) => { of(s).delete(k); }, clear: async (s) => { of(s).clear(); }, keys: async (s) => [...of(s).keys()], close: () => undefined };
}
class FakeWorker implements WorkerLike {
  state = "installed"; posted: unknown[] = [];
  postMessage(m: unknown): void { this.posted.push(m); }
  addEventListener(): void { /* not needed: the worker is already waiting */ }
}
class FakeReg implements RegistrationLike {
  waiting: WorkerLike | null = new FakeWorker(); installing: WorkerLike | null = null; active: WorkerLike | null = null;
  addEventListener(): void { /* no updatefound in these runs */ }
  async update(): Promise<void> { /* the check for a newer worker is tested elsewhere */ }
}
class FakeContainer implements ContainerLike {
  controller: unknown = {}; private ls: Array<() => void> = [];
  addEventListener(_t: "controllerchange", l: () => void): void { this.ls.push(l); }
  change(): void { for (const l of this.ls) l(); }
}
const flush = async (): Promise<void> => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const reply = { kind: "command.messages.reply" as const, target: { type: "conversation" as const, id: "conv_0001" }, labelForUi: "", draftText: "Votre commande part demain" };
const confirm = { kind: "command.orders.confirm" as const, target: { type: "order" as const, id: "o1", expectedVersion: 3 }, labelForUi: "SF-1042", draftText: "" };

/** One "page": an outbox over the shared database. Throw it away and build another = a reload. */
function page(db: Db, post: (json: string) => Promise<{ status: number; body: unknown }>, seals: string[]) {
  let ids = 0;
  const deps: OutboxDeps = {
    db, now: () => T0, deviceId: "phone_pwa_0001", newId: () => `id_${String(++ids).padStart(8, "0")}_${seals.length}`, policyVersion: () => 7,
    seal: async (i) => { const json = JSON.stringify({ c: i.commandId, k: i.idempotencyKey, p: i.payload }); seals.push(json); return json; },
    post, status: async () => ({ status: 200, body: { state: "queued", result: null } }), openResult: async () => ({ ok: false, reason: "malformed" }),
  };
  return createOutbox(deps);
}
const offline = async (): Promise<{ status: number; body: unknown }> => { throw new Error("network"); };

async function wire(db: Db, o: { since?: number | null; composing?: boolean } = {}) {
  const mod = await autoUpdate(); const safe = await safetyMod();
  const reg = new FakeReg(); const container = new FakeContainer(); let reloads = 0; let clock = T0; let stored: number | null = o.since ?? null;
  const flags = { composing: o.composing ?? false };
  const hard = async (): Promise<boolean> => !(await safe.hasUnsentOutbox(db)) && !flags.composing;
  const controller = createUpdateController(reg, container, () => { reloads += 1; }, {
    now: () => clock, canReload: hard, since: { read: () => stored, write: (n: number) => { stored = n; }, clear: () => { stored = null; } },
  });
  const blocking: boolean[] = [];
  const auto = mod.createAutoUpdate({
    controller, now: () => clock, setBlocking: (b: boolean) => { blocking.push(b); }, timers: { set: () => 0, clear: () => undefined },
    safety: async () => ({ unsentOutbox: await safe.hasUnsentOutbox(db), composing: flags.composing, requestInFlight: false, pairing: false }),
  });
  return { auto, controller, container, reg, blocking, reloads: () => reloads, advance: (ms: number) => { clock += ms; }, flags };
}

describe("an update never loses queued work", () => {
  it("an unsent command keeps the automatic update away, and the outbox is byte for byte what it was", async () => {
    const db = memDb(); const seals: string[] = []; const before = page(db, offline, seals);
    expect((await before.enqueue(confirm)).ok).toBe(true);
    const saved = await before.list(); expect(saved[0]?.state).toBe("queued");
    const w = await wire(db);
    expect(await w.auto.check("resume")).toBe("hold");
    expect((w.reg.waiting as FakeWorker).posted).toEqual([]);
    expect(w.reloads()).toBe(0);
    expect(await page(db, offline, seals).list()).toEqual(saved);
  });

  it("the forced path (stale + unsent): the stronger prompt, the seller taps Update, and the queued command survives the reload and is sent ONCE with the same sealed text", async () => {
    const db = memDb(); const seals: string[] = []; const before = page(db, offline, seals);
    expect((await before.enqueue(confirm)).ok).toBe(true); expect((await before.enqueue(reply)).ok).toBe(true);
    const queued = await before.list(); expect(queued.map((r) => r.state)).toEqual(["queued", "queued"]);
    const w = await wire(db, { since: T0 - 25 * HOUR });
    expect(await w.auto.check("launch")).toBe("block");
    expect(w.blocking.at(-1)).toBe(true);
    expect(w.reloads()).toBe(0);
    w.controller.apply(); w.container.change(); // the tap on the prompt
    expect(w.reloads()).toBe(1);
    // --- reload: a new page on the same database ---
    const posted: string[] = [];
    const after = page(db, async (json) => { posted.push(json); return { status: 202, body: { relaySequence: posted.length } }; }, seals);
    const restored = await after.list();
    expect(restored).toEqual(queued);
    await after.flush();
    expect(posted).toEqual(queued.map((r) => r.sealedEnvelopeJson));
    expect(seals).toHaveLength(2); // nothing was sealed again
    expect((await after.list()).map((r) => r.state)).toEqual(["sent", "sent"]);
    await after.flush();
    expect(posted).toHaveLength(2); // and nothing was sent twice
  });

  it("the race: a command written after the 'safe' decision but before the new worker takes over holds the reload; nothing is lost; the reload comes once it is sent", async () => {
    const db = memDb(); const seals: string[] = [];
    const w = await wire(db);
    expect(await w.auto.check("resume")).toBe("apply");
    expect((w.reg.waiting as FakeWorker).posted).toEqual([{ type: "SKIP_WAITING" }]);
    const during = page(db, offline, seals);
    expect((await during.enqueue(reply)).ok).toBe(true); // the seller taps Send in the milliseconds before controllerchange
    w.container.change(); await flush();
    expect(w.reloads()).toBe(0);
    expect(w.controller.state()).toBe("reload");
    const saved = await during.list(); expect(saved).toHaveLength(1); expect(saved[0]?.state).toBe("queued");
    // the command goes out; the next safe moment finishes the update
    const posted: string[] = [];
    const sender = page(db, async (json) => { posted.push(json); return { status: 202, body: { relaySequence: 1 } }; }, seals);
    await sender.flush();
    expect(await w.auto.check("resume")).toBe("apply"); await flush();
    expect(w.reloads()).toBe(1);
    const reloaded = await page(db, offline, seals).list();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]).toMatchObject({ commandId: saved[0]?.commandId, state: "sent" });
    expect(posted).toEqual([saved[0]?.sealedEnvelopeJson]);
  });

  it("a page killed in the middle of a send: the record is still queued, and the new page re-sends the SAME sealed text", async () => {
    const db = memDb(); const seals: string[] = []; const first: string[] = [];
    const dying = page(db, (json) => { first.push(json); return new Promise(() => undefined); }, seals);
    expect((await dying.enqueue(confirm)).ok).toBe(true);
    void dying.flush(); await flush(); // the request is in flight and never answers: the page is about to be reloaded
    const survivors = await page(db, offline, seals).list();
    expect(survivors).toHaveLength(1); expect(survivors[0]?.state).toBe("queued");
    const second: string[] = [];
    await page(db, async (json) => { second.push(json); return { status: 202, body: { relaySequence: 9 } }; }, seals).flush();
    expect(second).toEqual(first);
    expect(seals).toHaveLength(1);
  });

  it("an open draft (a reply or note being typed) is kept on the phone, so even a forced reload only costs the screen, not the text", async () => {
    const db = memDb(); let at = T0;
    const typing = createDraftStore(db, () => at);
    await typing.set("reply:conv_0001", "Bonjour, je confirme pour demain");
    at += 2 * HOUR;
    expect(await createDraftStore(db, () => at).get("reply:conv_0001")).toBe("Bonjour, je confirme pour demain");
  });

  it("an open compose also holds the automatic update (the draft is kept either way)", async () => {
    const db = memDb(); const w = await wire(db, { composing: true });
    expect(await w.auto.check("resume")).toBe("hold");
    expect((w.reg.waiting as FakeWorker).posted).toEqual([]);
  });
});

describe("the outbox store is what the check reads", () => {
  it("a record that was sent, or finished, never blocks an update", async () => {
    const db = memDb(); const s = await safetyMod();
    const sent: Partial<OutboxRecord> = { commandId: "cmd_1", state: "sent" };
    await db.put("outbox", "cmd_1", sent); await db.put("outbox", "cmd_2", { commandId: "cmd_2", state: "committed" });
    expect(await s.hasUnsentOutbox(db)).toBe(false);
    await db.put("outbox", "cmd_3", { commandId: "cmd_3", state: "queued" });
    expect(await s.hasUnsentOutbox(db)).toBe(true);
  });
});
