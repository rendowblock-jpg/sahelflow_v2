// W4SEC-07: a waiting new service worker is applied by itself at a SAFE moment (launch or return from background, nothing unsent,
// nothing being typed, nothing in flight), the explicit tap still works, and a stale update that cannot be applied silently
// gets a stronger prompt that has no way to dismiss it.
import { describe, expect, it } from "vitest";
import { LOCALES, catalogs } from "../src/i18n";
import { createUpdateController, type ContainerLike, type RegistrationLike, type WorkerLike } from "../src/sw/update";
import { renderApp, type View } from "../src/views/view";

const HOUR = 3_600_000; const MINUTE = 60_000; const T0 = Date.UTC(2026, 10, 5, 8, 0, 0);
const policy = () => import("../src/sw/update-policy");
const autoUpdate = () => import("../src/sw/auto-update");
const safetyMod = () => import("../src/sw/update-safety");

class FakeWorker implements WorkerLike {
  state = "installing"; posted: unknown[] = []; private ls: Array<() => void> = [];
  postMessage(m: unknown): void { this.posted.push(m); }
  addEventListener(_t: "statechange", l: () => void): void { this.ls.push(l); }
  go(state: string): void { this.state = state; for (const l of this.ls) l(); }
}
class FakeReg implements RegistrationLike {
  waiting: WorkerLike | null = null; installing: WorkerLike | null = null; active: WorkerLike | null = null; updates = 0; updateFails = false;
  private ls: Array<() => void> = [];
  addEventListener(_t: "updatefound", l: () => void): void { this.ls.push(l); }
  found(w: FakeWorker): void { this.installing = w; for (const l of this.ls) l(); }
  async update(): Promise<void> { this.updates += 1; if (this.updateFails) throw new Error("offline"); }
}
class FakeContainer implements ContainerLike {
  controller: unknown = {}; private ls: Array<() => void> = [];
  addEventListener(_t: "controllerchange", l: () => void): void { this.ls.push(l); }
  change(): void { for (const l of this.ls) l(); }
}
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

type Flags = { unsentOutbox: boolean; composing: boolean; requestInFlight: boolean; pairing: boolean };
const SAFE: Flags = { unsentOutbox: false, composing: false, requestInFlight: false, pairing: false };

function fakeTimers() {
  const live = new Map<number, { fn: () => void; ms: number }>(); let n = 0;
  return {
    set: (fn: () => void, ms: number) => { n += 1; live.set(n, { fn, ms }); return n; },
    clear: (h: unknown) => { live.delete(h as number); },
    delays: () => [...live.values()].map((t) => t.ms),
    fireAll: () => { const all = [...live.entries()]; for (const [id, t] of all) { live.delete(id); t.fn(); } },
  };
}

/** A phone with a waiting update, wired the way app.ts wires it. */
async function rig(o: { waiting?: boolean; flags?: Partial<Flags>; since?: number | null; canReload?: boolean } = {}) {
  const mod = await autoUpdate();
  const reg = new FakeReg(); const container = new FakeContainer(); const worker = new FakeWorker();
  if (o.waiting !== false) reg.waiting = worker;
  let clock = T0; let stored: number | null = o.since === undefined ? null : o.since; let reloads = 0; let flags: Flags = { ...SAFE, ...o.flags }; let canReload = o.canReload ?? true;
  const blocking: boolean[] = []; const timers = fakeTimers();
  const controller = createUpdateController(reg, container, () => { reloads += 1; }, {
    now: () => clock, canReload: async () => canReload, since: { read: () => stored, write: (n: number) => { stored = n; }, clear: () => { stored = null; } },
  });
  const auto = mod.createAutoUpdate({ controller, safety: async () => ({ ...flags }), now: () => clock, setBlocking: (b: boolean) => { blocking.push(b); }, timers });
  return {
    reg, container, worker, controller, auto, timers, blocking,
    reloads: () => reloads, stored: () => stored, setFlags: (f: Partial<Flags>) => { flags = { ...flags, ...f }; }, setCanReload: (v: boolean) => { canReload = v; },
    advance: (ms: number) => { clock += ms; }, now: () => clock,
  };
}

describe("the numbers", () => {
  it("a waiting update is overdue after 24 hours, the browser is asked for a newer worker at most hourly, a blocked prompt re-checks every 5 minutes", async () => {
    const p = await policy();
    expect(p.UPDATE_MAX_WAIT_MS).toBe(24 * HOUR);
    expect(p.UPDATE_CHECK_MIN_GAP_MS).toBe(HOUR);
    expect(p.UPDATE_RECHECK_MS).toBe(5 * MINUTE);
  });
});

describe("the decision (pure)", () => {
  const rows: ReadonlyArray<readonly [string, string, string, Partial<Flags>, boolean, string]> = [
    ["safe launch", "waiting", "launch", {}, false, "apply"],
    ["safe resume", "waiting", "resume", {}, false, "apply"],
    ["a held reload is retried on a safe resume", "reload", "resume", {}, false, "apply"],
    ["not overdue, timer: wait for a real launch or resume", "waiting", "timer", {}, false, "hold"],
    ["overdue, safe, timer: apply silently", "waiting", "timer", {}, true, "apply"],
    ["unsent outbox, resume", "waiting", "resume", { unsentOutbox: true }, false, "hold"],
    ["open compose, launch", "waiting", "launch", { composing: true }, false, "hold"],
    ["request in flight, resume", "waiting", "resume", { requestInFlight: true }, false, "hold"],
    ["pairing in progress, launch", "waiting", "launch", { pairing: true }, false, "hold"],
    ["overdue + unsent outbox: stronger prompt, no reload", "waiting", "resume", { unsentOutbox: true }, true, "block"],
    ["overdue + compose open", "waiting", "timer", { composing: true }, true, "block"],
    ["overdue + in flight", "reload", "launch", { requestInFlight: true }, true, "block"],
    ["overdue + pairing", "waiting", "resume", { pairing: true }, true, "block"],
    ["nothing waiting", "idle", "resume", {}, true, "none"],
    ["already applying", "applying", "resume", {}, true, "none"],
  ];
  it.each(rows)("%s", async (_name, state, trigger, flags, overdue, expected) => {
    const p = await policy();
    const since = overdue ? T0 - p.UPDATE_MAX_WAIT_MS : T0;
    expect(p.decideUpdate({ state: state as never, trigger: trigger as never, safety: { ...SAFE, ...flags }, since, now: T0 })).toBe(expected);
  });
  it("overdue means 24 hours or more since first seen; never seen is not overdue", async () => {
    const p = await policy();
    expect(p.isOverdue(T0, T0 + 24 * HOUR - 1)).toBe(false);
    expect(p.isOverdue(T0, T0 + 24 * HOUR)).toBe(true);
    expect(p.isOverdue(null, T0)).toBe(false);
  });
  it("safe means all four flags are off", async () => {
    const p = await policy();
    expect(p.isSafe(SAFE)).toBe(true);
    for (const key of Object.keys(SAFE) as (keyof Flags)[]) expect(p.isSafe({ ...SAFE, [key]: true })).toBe(false);
  });
});

describe("the update controller (the tap path keeps working)", () => {
  it("remembers when a waiting update was first seen, across launches, and starts again after the reload", async () => {
    const found = await rig({ waiting: false });
    const w = new FakeWorker(); found.reg.found(w); w.go("installed");
    expect(found.controller.waitingSince()).toBe(T0);
    expect(found.stored()).toBe(T0);
    const relaunch = await rig({ since: T0 - 5 * HOUR });
    expect(relaunch.controller.state()).toBe("waiting");
    expect(relaunch.controller.waitingSince()).toBe(T0 - 5 * HOUR);
    const fresh = await rig({ waiting: false, since: T0 - 5 * HOUR });
    expect(fresh.controller.state()).toBe("idle");
    expect(fresh.controller.waitingSince()).toBeNull();
    expect(fresh.stored()).toBeNull();
  });
  it("applyAutomatically posts SKIP_WAITING once and reloads once after controllerchange", async () => {
    const r = await rig();
    expect(r.controller.applyAutomatically()).toBe(true);
    expect(r.controller.applyAutomatically()).toBe(false);
    expect(r.worker.posted).toEqual([{ type: "SKIP_WAITING" }]);
    expect(r.controller.state()).toBe("applying");
    r.container.change(); r.container.change(); await flush();
    expect(r.reloads()).toBe(1);
  });
  it("if something became unsafe between the decision and controllerchange the reload is HELD (state 'reload'), then done on the next safe try", async () => {
    const r = await rig(); const seen: string[] = []; r.controller.subscribe((s) => seen.push(s));
    r.setCanReload(false);
    r.controller.applyAutomatically(); r.container.change(); await flush();
    expect(r.reloads()).toBe(0);
    expect(r.controller.state()).toBe("reload");
    expect(r.controller.applyAutomatically()).toBe(true); await flush(); // still unsafe
    expect(r.reloads()).toBe(0);
    r.setCanReload(true);
    expect(r.controller.applyAutomatically()).toBe(true); await flush();
    expect(r.reloads()).toBe(1);
    expect(seen).toEqual(["applying", "reload"]);
  });
  it("the seller's tap is never held back: it reloads at once even when automatic reloads are held, also from the 'reload' state", async () => {
    const tapped = await rig(); tapped.setCanReload(false);
    tapped.controller.apply(); tapped.container.change();
    expect(tapped.reloads()).toBe(1);
    const held = await rig(); held.setCanReload(false);
    held.controller.applyAutomatically(); held.container.change(); await flush();
    expect(held.controller.state()).toBe("reload");
    held.controller.apply();
    expect(held.reloads()).toBe(1);
  });
  it("checkForUpdate asks the browser for a newer worker and swallows a failure", async () => {
    const r = await rig(); await r.controller.checkForUpdate(); expect(r.reg.updates).toBe(1);
    r.reg.updateFails = true; await expect(r.controller.checkForUpdate()).resolves.toBeUndefined(); expect(r.reg.updates).toBe(2);
  });
});

describe("automatic apply at a safe moment", () => {
  it.each(["launch", "resume"] as const)("a waiting update is applied on %s when it is safe, and the reload follows", async (trigger) => {
    const r = await rig();
    expect(await r.auto.check(trigger)).toBe("apply");
    expect(r.worker.posted).toEqual([{ type: "SKIP_WAITING" }]);
    r.container.change(); await flush();
    expect(r.reloads()).toBe(1);
    expect(r.blocking.every((b) => b === false)).toBe(true);
  });
  it.each(["unsentOutbox", "composing", "requestInFlight", "pairing"] as const)("is held while %s, and the small banner (the tap) stays the only way", async (flag) => {
    const r = await rig({ flags: { [flag]: true } });
    expect(await r.auto.check("resume")).toBe("hold");
    expect(r.worker.posted).toEqual([]);
    expect(r.reloads()).toBe(0);
    expect(r.controller.state()).toBe("waiting");
    r.controller.apply(); // the tap
    expect(r.worker.posted).toEqual([{ type: "SKIP_WAITING" }]);
  });
  it("an update found WHILE the seller is using the app is not applied under their hands; the next return from background applies it", async () => {
    const r = await rig({ waiting: false });
    const w = new FakeWorker(); r.reg.found(w); w.go("installed"); r.reg.waiting = w; await flush();
    expect(r.controller.state()).toBe("waiting");
    expect(w.posted).toEqual([]);
    expect(await r.auto.check("resume")).toBe("apply");
    expect(w.posted).toEqual([{ type: "SKIP_WAITING" }]);
  });
  it("nothing waiting: nothing happens", async () => {
    const r = await rig({ waiting: false });
    expect(await r.auto.check("launch")).toBe("none");
    expect(r.worker.posted).toEqual([]);
  });
});

describe("a stale update that is unsafe to apply silently", () => {
  it("after 24 hours the stronger prompt is requested instead of a reload, nothing is applied, then it applies silently once it is safe", async () => {
    const r = await rig({ since: T0, flags: { unsentOutbox: true } });
    r.advance(24 * HOUR);
    expect(await r.auto.check("resume")).toBe("block");
    expect(r.blocking.at(-1)).toBe(true);
    expect(r.worker.posted).toEqual([]);
    expect(r.reloads()).toBe(0);
    expect(r.timers.delays()).toContain(5 * MINUTE); // it looks again by itself
    r.setFlags({ unsentOutbox: false });
    r.timers.fireAll(); await flush();
    expect(r.worker.posted).toEqual([{ type: "SKIP_WAITING" }]);
    expect(r.blocking.at(-1)).toBe(false);
  });
  it("before 24 hours an unsafe moment only holds (no stronger prompt)", async () => {
    const r = await rig({ since: T0, flags: { composing: true } });
    r.advance(24 * HOUR - 1);
    expect(await r.auto.check("resume")).toBe("hold");
    expect(r.blocking.every((b) => b === false)).toBe(true);
  });
  it("overdue but safe: applied silently, the stronger prompt never shows", async () => {
    const r = await rig({ since: T0 });
    r.advance(30 * HOUR);
    expect(await r.auto.check("launch")).toBe("apply");
    expect(r.blocking.every((b) => b === false)).toBe(true);
  });
  it("a timer is armed for the moment the update turns overdue", async () => {
    const held = await rig({ since: T0, flags: { composing: true } });
    held.advance(3 * HOUR);
    await held.auto.check("resume");
    expect(held.timers.delays()).toContain(21 * HOUR);
  });
});

describe("the browser is asked for a newer worker when the seller comes back", () => {
  it("on launch and resume, at most once an hour", async () => {
    const r = await rig({ waiting: false });
    await r.auto.check("launch"); await flush(); expect(r.reg.updates).toBe(1);
    r.advance(HOUR - 1); await r.auto.check("resume"); await flush(); expect(r.reg.updates).toBe(1);
    r.advance(1); await r.auto.check("resume"); await flush(); expect(r.reg.updates).toBe(2);
  });
});

describe("what counts as unsafe", () => {
  it("an open compose: a text field or textarea with text, or an open sheet; mere focus, empty fields and a PIN box do not", async () => {
    const s = await safetyMod();
    const field = (value: string) => ({ value });
    const root = (fields: { value: string }[], sheets = 0) => ({
      querySelectorAll: (selector: string) => (selector.includes("sheet") ? Array.from({ length: sheets }, () => ({})) : fields),
    });
    expect(s.isComposing(root([field("")]))).toBe(false);
    expect(s.isComposing(root([field("  ")]))).toBe(false);
    expect(s.isComposing(root([field("Salam, votre commande")]))).toBe(true);
    expect(s.isComposing(root([], 1))).toBe(true);
    expect(s.isComposing(root([]))).toBe(false);
  });
  it("an unsent outbox: any record still 'queued'; sent or finished ones do not block; an unreadable store counts as unsafe", async () => {
    const s = await safetyMod();
    const dbWith = (records: Record<string, unknown>) => ({ keys: async () => Object.keys(records), get: async (_s: string, k: string) => records[k] });
    expect(await s.hasUnsentOutbox(dbWith({}) as never)).toBe(false);
    expect(await s.hasUnsentOutbox(dbWith({ a: { state: "sent" }, b: { state: "committed" }, c: { state: "failed" }, d: { state: "unknown" } }) as never)).toBe(false);
    expect(await s.hasUnsentOutbox(dbWith({ a: { state: "sent" }, b: { state: "queued" } }) as never)).toBe(true);
    expect(await s.hasUnsentOutbox({ keys: async () => { throw new Error("idb"); }, get: async () => undefined } as never)).toBe(true);
  });
  it("a request in flight is counted until it settles, whether it succeeds or fails", async () => {
    const s = await safetyMod(); const inflight = s.createInflight();
    let finish: (r: Response) => void = () => undefined; let fail: (e: Error) => void = () => undefined;
    const slow = inflight.track((() => new Promise<Response>((resolve) => { finish = resolve; })) as unknown as typeof fetch);
    const broken = inflight.track((() => new Promise<Response>((_r, reject) => { fail = reject; })) as unknown as typeof fetch);
    const a = slow("https://x.test/a"); const b = broken("https://x.test/b");
    expect(inflight.count()).toBe(2);
    finish(new Response("ok")); expect((await a).status).toBe(200); expect(inflight.count()).toBe(1);
    fail(new Error("net")); await expect(b).rejects.toThrow("net"); expect(inflight.count()).toBe(0);
  });
});

describe("the stronger prompt in the page", () => {
  const view = (locale: "ar" | "fr" | "en", over: Partial<View>): View => ({
    locale, theme: "system", screen: "settings", state: "empty", now: T0, online: true, updateReady: true, canInstall: false, installed: false, ios: false,
    projection: null, step: null, fingerprint: null, failure: null, lockMode: "enter", lockNotice: null, hasLock: false,
    version: "0.1.0", confirmRemove: false, removeError: null, removed: false, ...over,
  });
  it.each(LOCALES)("%s: one modal dialog with the Update button and no way to dismiss it; the small banner is not drawn beside it", (locale) => {
    const html = renderApp(view(locale, { updateBlocking: true } as Partial<View>));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html.match(/data-act="update"/g)).toHaveLength(1);
    expect(html).toContain(catalogs[locale]["common.update.required"]);
    expect(html).not.toContain(catalogs[locale]["common.update.ready"]);
    expect(html).not.toMatch(/data-act="(dismiss|close|later|cancel)"/);
    expect(html).not.toMatch(/\sstyle=|<script|\son[a-z]+=/i);
  });
  it("without the flag the small dismiss-free banner is unchanged", () => {
    const html = renderApp(view("en", {}));
    expect(html).toContain(catalogs.en["common.update.ready"]);
    expect(html).not.toContain("alertdialog");
  });
});
