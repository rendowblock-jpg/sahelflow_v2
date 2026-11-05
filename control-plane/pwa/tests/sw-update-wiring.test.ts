// W4SEC-07 in the app: the safety flags come from real state (the outbox store, the page, the request counter, the screen), and the
// moments (launch, resume, online) reach the update logic. app.ts has no DOM test, so the join is built here from the same module app.ts calls.
import { describe, expect, it } from "vitest";
import { UPDATE_SINCE_KEY, createUpdateWiring, sinceStore, type KeyValue } from "../src/app/update-wiring";
import type { Db } from "../src/storage/idb";
import { createUpdateController, type ContainerLike, type RegistrationLike, type WorkerLike } from "../src/sw/update";
import { INFLIGHT_SETTLE_TRIES, createInflight } from "../src/sw/update-safety";

const T0 = Date.UTC(2026, 10, 5, 8, 0, 0);
class Worker implements WorkerLike { state = "installed"; posted: unknown[] = []; postMessage(m: unknown): void { this.posted.push(m); } addEventListener(): void { /* already waiting */ } }
class Reg implements RegistrationLike { waiting: WorkerLike | null = new Worker(); installing = null; active = null; addEventListener(): void { /* none */ } async update(): Promise<void> { /* none */ } }
class Container implements ContainerLike { controller: unknown = {}; private ls: Array<() => void> = []; addEventListener(_t: "controllerchange", l: () => void): void { this.ls.push(l); } change(): void { for (const l of this.ls) l(); } }
const later = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });
const kv = (init: Record<string, string> = {}): KeyValue & { map: Map<string, string> } => {
  const map = new Map(Object.entries(init));
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => { map.set(k, v); }, remove: (k) => { map.delete(k); } };
};

function rig(o: { records?: Record<string, unknown>; composing?: boolean; pairing?: boolean; sleep?: (ms: number) => Promise<void>; storage?: ReturnType<typeof kv>; dbFails?: boolean } = {}) {
  const records = o.records ?? {}; const state = { composing: o.composing ?? false, pairing: o.pairing ?? false };
  const db = { keys: async () => { if (o.dbFails) throw new Error("idb"); return Object.keys(records); }, get: async (_s: string, k: string) => records[k] } as unknown as Db;
  const inflight = createInflight(); const storage = o.storage ?? kv(); const blocking: boolean[] = [];
  const live = new Map<number, () => void>(); let n = 0;
  const timers = { set: (fn: () => void) => { n += 1; live.set(n, fn); return n; }, clear: (h: unknown) => { live.delete(h as number); } };
  const root = { querySelectorAll: (sel: string) => (sel.includes("sheet") ? [] : state.composing ? [{ value: "Bonjour" }] : []) };
  const wiring = createUpdateWiring({ root, getDb: async () => db, inflight, pairing: () => state.pairing, setBlocking: (b) => { blocking.push(b); }, storage, now: () => T0, sleep: o.sleep ?? (async () => undefined), timers });
  const reg = new Reg(); const container = new Container(); let reloads = 0;
  const controller = createUpdateController(reg, container, () => { reloads += 1; }, wiring.options);
  return { wiring, controller, reg, container, state, inflight, storage, blocking, reloads: () => reloads, posted: () => (reg.waiting as Worker).posted, fireTimers: () => { for (const [id, fn] of [...live]) { live.delete(id); fn(); } } };
}

describe("where the 'first seen' time is kept", () => {
  it("reads only a plausible number, writes whole milliseconds, clears", () => {
    const s = kv(); const store = sinceStore(s);
    expect(store.read()).toBeNull();
    store.write(T0 + 0.7); expect(s.map.get(UPDATE_SINCE_KEY)).toBe(String(T0)); expect(store.read()).toBe(T0);
    for (const junk of ["", "abc", "-5", "0", "Infinity"]) { s.map.set(UPDATE_SINCE_KEY, junk); expect(store.read()).toBeNull(); }
    store.clear(); expect(s.map.has(UPDATE_SINCE_KEY)).toBe(false);
  });
  it("a waiting update is dated the first time it is seen, and the date survives a restart", () => {
    const storage = kv(); rig({ storage });
    expect(storage.map.get(UPDATE_SINCE_KEY)).toBe(String(T0));
    const old = kv({ [UPDATE_SINCE_KEY]: String(T0 - 5 * 3_600_000) }); const r = rig({ storage: old });
    expect(r.controller.waitingSince()).toBe(T0 - 5 * 3_600_000);
  });
});

describe("the launch look reads the real state", () => {
  it("nothing open, nothing unsent: the waiting update is applied at launch", async () => {
    const r = rig({ records: { a: { state: "sent" }, b: { state: "committed" } } }); r.wiring.attach(r.controller); await later();
    expect(r.posted()).toEqual([{ type: "SKIP_WAITING" }]);
  });
  it("a queued command, an open composer, the pairing screen, an unreadable outbox: each one holds it", async () => {
    for (const o of [{ records: { a: { state: "queued" } } }, { composing: true }, { pairing: true }, { dbFails: true }]) {
      const r = rig(o); r.wiring.attach(r.controller); await later();
      expect(r.posted(), JSON.stringify(Object.keys(o))).toEqual([]);
      expect(r.controller.state()).toBe("waiting");
    }
  });
  it("a request that started a moment ago is waited for, then the update goes ahead", async () => {
    let finish: (r: Response) => void = () => undefined; const sleeps: number[] = [];
    const r = rig({ sleep: async (ms) => { sleeps.push(ms); finish(new Response("ok")); await later(); } });
    void r.inflight.track((() => new Promise<Response>((resolve) => { finish = resolve; })) as unknown as typeof fetch)("https://x.test/poll");
    r.wiring.attach(r.controller); await later();
    expect(sleeps.length).toBeGreaterThan(0);
    expect(r.posted()).toEqual([{ type: "SKIP_WAITING" }]);
  });
  it("a request that never settles holds it after a few seconds, not for ever", async () => {
    let sleeps = 0; const r = rig({ sleep: async () => { sleeps += 1; } });
    void r.inflight.track((() => new Promise<Response>(() => undefined)) as unknown as typeof fetch)("https://x.test/slow");
    r.wiring.attach(r.controller); await later();
    expect(sleeps).toBe(INFLIGHT_SETTLE_TRIES);
    expect(r.posted()).toEqual([]);
  });
});

describe("the other moments", () => {
  it("coming back online does not take a young update; returning to the app does", async () => {
    const r = rig({ composing: true }); r.wiring.attach(r.controller); await later();
    r.state.composing = false;
    r.wiring.check("online"); await later(); expect(r.posted()).toEqual([]);
    r.wiring.check("resume"); await later(); expect(r.posted()).toEqual([{ type: "SKIP_WAITING" }]);
  });
  it("check before a controller is attached does nothing and does not throw", () => {
    const r = rig(); expect(() => r.wiring.check("resume")).not.toThrow(); expect(r.posted()).toEqual([]);
  });
  it("a reload held because something turned unsafe is finished by itself once it is safe", async () => {
    const r = rig(); r.wiring.attach(r.controller); await later();
    expect(r.posted()).toEqual([{ type: "SKIP_WAITING" }]);
    r.state.composing = true; r.container.change(); await later();
    expect(r.controller.state()).toBe("reload"); expect(r.reloads()).toBe(0);
    r.state.composing = false; r.fireTimers(); await later();
    expect(r.reloads()).toBe(1);
  });
  it("the tap still reloads at once, whatever is open", async () => {
    const r = rig({ composing: true, records: { a: { state: "queued" } } }); r.wiring.attach(r.controller); await later();
    r.controller.apply(); r.container.change();
    expect(r.reloads()).toBe(1);
  });
});
