// W3-F3 step 3: the polling budget. Fake clock and fake timers; nothing waits for real time.
import { describe, expect, it } from "vitest";
import { createSync, type SyncDeps } from "../src/sync/engine";
import { DAILY_CAP, dayKey, intervalFor, kindsFor, nextDelay, RECHECK_MS, spend, statusDelay, type Budget } from "../src/sync/schedule";
import type { RelayPoll } from "../src/today/relay-source";
import type { ScreenId } from "../src/views/view";

const T0 = Date.UTC(2026, 9, 31, 8, 0, 0);
const stored = (n = 1): RelayPoll => ({ kind: "stored", sequence: n });
async function settle(): Promise<void> { for (let i = 0; i < 60; i += 1) await Promise.resolve(); }
function world(over: Partial<{ screen: ScreenId; visible: boolean; online: boolean; budget: Budget | null; open: boolean }> = {}, script: RelayPoll[] = []) {
  let clock = T0; let nextId = 1; const timers: { at: number; fn: () => void; id: number }[] = [];
  const st = { screen: "orders" as ScreenId, visible: true, online: true, budget: null as Budget | null, open: true, ...over };
  const calls: { kind: string; at: number }[] = []; const status: number[] = []; const seen: string[] = []; const queue = [...script];
  const deps: SyncDeps = {
    now: () => clock, visible: () => st.visible, online: () => st.online, screen: () => st.screen,
    fetchKind: async (kind) => { calls.push({ kind, at: (clock - T0) / 1000 }); return queue.shift() ?? { kind: "unchanged" }; },
    pollCommands: async () => { status.push((clock - T0) / 1000); return st.open; },
    loadBudget: async () => st.budget, saveBudget: async (b) => { st.budget = b; },
    onPoll: (p) => { seen.push(p.kind); },
    timers: { set: (fn, ms) => { const t = { at: clock + ms, fn, id: nextId++ }; timers.push(t); return t.id; }, clear: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); } },
  };
  const advance = async (ms: number): Promise<void> => {
    const end = clock + ms;
    for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); clock = t.at; t.fn(); await settle(); }
    clock = end;
  };
  return { deps, st, calls, status, seen, advance, sync: createSync(deps), now: () => clock };
}
const times = (w: { calls: { at: number }[] }): number[] => w.calls.map((c) => c.at);

describe("schedule", () => {
  it("intervals: Orders and Inbox 30 s, Settings 60 s, nothing for the pairing screens", () => {
    expect(["orders", "order", "inbox", "conversation"].map((s) => intervalFor(s as ScreenId))).toEqual([30_000, 30_000, 30_000, 30_000]);
    expect(intervalFor("settings")).toBe(60_000); expect(intervalFor("welcome")).toBeNull(); expect(intervalFor("pair")).toBeNull();
    expect(intervalFor("lock")).toBe(60_000); // W198: a locked phone still checks, once a minute, whether the PC removed it
    expect(RECHECK_MS).toBe(60_000);
  });
  it("kinds: only what the visible screen shows", () => {
    expect(kindsFor("orders")).toEqual(["orders"]); expect(kindsFor("order")).toEqual(["orders"]); expect(kindsFor("inbox")).toEqual(["conversations"]);
    expect(kindsFor("today")).toEqual(["dashboard"]); expect(kindsFor("welcome")).toEqual([]);
    expect(kindsFor("lock")).toEqual(["dashboard"]); expect(kindsFor("pair")).toEqual([]); // the lock screen asks the same question Settings asks, nothing else
  });
  it("delay doubles with each miss up to 5 minutes; Retry-After can only lengthen it", () => {
    expect([0, 1, 2, 3, 4, 9].map((f) => nextDelay(30_000, f))).toEqual([30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
    expect(nextDelay(30_000, 0, 90_000)).toBe(90_000); expect(nextDelay(30_000, 2, 10_000)).toBe(120_000);
  });
  it("status poll: 2, 4, 8, 15 s, then 30 s", () => { expect([0, 1, 2, 3, 4, 5, 9].map(statusDelay)).toEqual([2000, 4000, 8000, 15_000, 30_000, 30_000, 30_000]); });
  it("daily cap: 600 per UTC day, a new day starts again", () => {
    expect(DAILY_CAP).toBe(600);
    expect(spend(null, T0)).toEqual({ allowed: true, budget: { day: dayKey(T0), count: 1 } });
    expect(spend({ day: dayKey(T0), count: 599 }, T0)).toMatchObject({ allowed: true, budget: { count: 600 } });
    expect(spend({ day: dayKey(T0), count: 600 }, T0).allowed).toBe(false);
    expect(spend({ day: "2026-10-30", count: 600 }, T0)).toEqual({ allowed: true, budget: { day: dayKey(T0), count: 1 } });
  });
});

describe("sync engine", () => {
  it("Orders: one 'orders' fetch per cycle every 30 s while visible; success keeps the rhythm", async () => {
    const w = world({}, [stored(1), stored(2), stored(3), stored(4), stored(5)]);
    w.sync.start(); await settle(); await w.advance(95_000);
    expect(times(w)).toEqual([0, 30, 60, 90]); expect(w.calls.every((c) => c.kind === "orders")).toBe(true);
  });
  it("a 304 (and network, 5xx) doubles the wait up to 5 min; a success resets it", async () => {
    const w = world({}, []);
    w.sync.start(); await settle(); await w.advance(800_000);
    expect(times(w)).toEqual([0, 60, 180, 420, 720]);
    const r = world({}, [{ kind: "unchanged" }, { kind: "network" }, stored(1)]);
    r.sync.start(); await settle(); await r.advance(250_000);
    expect(times(r)).toEqual([0, 60, 180, 210, 270].filter((x) => x <= 250));
  });
  it("429 Retry-After is honoured", async () => {
    const w = world({}, [{ kind: "rate_limited", retryAfterMs: 90_000 }, stored(1)]);
    w.sync.start(); await settle(); await w.advance(100_000);
    expect(times(w)).toEqual([0, 90]);
  });
  it("hidden or offline: no request and no timer; coming back fetches at once", async () => {
    const w = world({ visible: false }, [stored(1), stored(2)]);
    w.sync.start(); await settle(); await w.advance(600_000); expect(w.calls).toHaveLength(0);
    w.st.visible = true; w.sync.onVisible(); await settle(); expect(w.calls).toHaveLength(1);
    w.st.online = false; w.sync.onHidden(); await w.advance(300_000); expect(w.calls).toHaveLength(1);
    w.st.online = true; w.sync.onOnline(); await settle(); expect(w.calls).toHaveLength(2);
  });
  it("the screens without an interval fetch nothing; Inbox asks for conversations only", async () => {
    const a = world({ screen: "welcome" }); a.sync.start(); await settle(); await a.advance(120_000); expect(a.calls).toHaveLength(0);
    const b = world({ screen: "inbox" }); b.sync.start(); await settle(); expect(b.calls.map((c) => c.kind)).toEqual(["conversations"]);
  });
  it("the daily cap stops background requests (and survives a restart) but Refresh still works", async () => {
    const w = world({ budget: { day: dayKey(T0), count: DAILY_CAP } }, [stored(1), stored(2)]);
    w.sync.start(); await settle(); await w.advance(120_000); expect(w.calls).toHaveLength(0);
    await w.sync.refresh(); expect(w.calls).toHaveLength(1);
    const c = world({}, [stored(1), stored(2), stored(3)]); c.sync.start(); await settle(); await c.advance(65_000);
    expect(c.calls).toHaveLength(3); expect(c.st.budget).toEqual({ day: dayKey(T0), count: 3 });
  });
  it("after a command is sent: status polls at 2, 6, 14, 29, 59 s ... until nothing is open; never past 10 minutes", async () => {
    const w = world({}, []);
    w.sync.commandSent(); await w.advance(60_000); expect(w.status).toEqual([2, 6, 14, 29, 59]);
    w.st.open = false; await w.advance(60_000); expect(w.status).toEqual([2, 6, 14, 29, 59, 89]);
    const g = world({ screen: "settings" }); g.sync.commandSent(); await g.advance(1_200_000);
    expect(Math.max(...g.status)).toBeLessThanOrEqual(600); expect(g.status.length).toBeGreaterThan(10);
  });
  it("a revoked answer stops everything", async () => {
    const w = world({}, [{ kind: "revoked" }]);
    w.sync.start(); await settle(); await w.advance(600_000);
    expect(w.calls).toHaveLength(1); expect(w.seen).toEqual(["revoked"]);
  });
  it("W198 A the chain survives a tick on a screen with no interval: it re-checks every 60 s, fetches nothing, and polls again once the screen is back", async () => {
    const w = world({ screen: "settings" }, [stored(1), stored(2)]);
    w.sync.start(false); w.st.screen = "welcome";
    await w.advance(60_000); expect(w.calls).toHaveLength(0); // the tick on a screen with no interval fetched nothing ...
    w.st.screen = "settings"; await w.advance(59_000); expect(w.calls).toHaveLength(0);
    await w.advance(1_000); expect(times(w)).toEqual([120]); expect(w.calls[0]?.kind).toBe("dashboard"); // ... and the re-check exactly 60 s later polled
  });
  it("W198 A a screen change by set() is picked up by onScreen() at once, and stop() ends the re-check too", async () => {
    const w = world({ screen: "pair" }, [stored(1)]);
    w.sync.start(false); w.st.screen = "orders"; w.sync.onScreen(); await settle();
    expect(w.calls.map((c) => c.kind)).toEqual(["orders"]);
    const s = world({ screen: "settings" }, [stored(1)]);
    s.sync.start(false); s.st.screen = "pair"; await s.advance(60_000); s.sync.stop(); s.st.screen = "settings"; await s.advance(600_000);
    expect(s.calls).toHaveLength(0);
  });
  it("W198 A a manual Refresh on a screen with no interval does not move the running timer", async () => {
    const w = world({ screen: "settings" }, [stored(1)]);
    w.sync.start(false); await w.advance(30_000); w.st.screen = "welcome"; await w.sync.refresh(); w.st.screen = "settings";
    await w.advance(29_000); expect(w.calls).toHaveLength(0);
    await w.advance(1_000); expect(times(w)).toEqual([60]); // the timer armed at 0 still fires at 60, not 30 s after the Refresh
  });
  it("W198 B a locked phone checks too: one 'dashboard' fetch per cycle every 60 s, counted against the daily cap, nothing while hidden", async () => {
    const w = world({ screen: "lock" }, [stored(1), stored(2), stored(3), stored(4)]);
    w.sync.start(); await settle(); await w.advance(125_000);
    expect(times(w)).toEqual([0, 60, 120]); expect(w.calls.every((c) => c.kind === "dashboard")).toBe(true);
    expect(w.st.budget).toEqual({ day: dayKey(T0), count: 3 });
    const c = world({ screen: "lock", budget: { day: dayKey(T0), count: DAILY_CAP } }); c.sync.start(); await settle(); await c.advance(300_000);
    expect(c.calls).toHaveLength(0);
    const h = world({ screen: "lock", visible: false }); h.sync.start(); await settle(); await h.advance(300_000);
    expect(h.calls).toHaveLength(0);
  });
  it("W198 B a revoked answer on the lock screen stops the engine and reaches onPoll; an updated answer leaves the screen and the chain alone", async () => {
    const w = world({ screen: "lock" }, [{ kind: "revoked" }]);
    w.sync.start(); await settle(); await w.advance(600_000);
    expect(w.calls).toHaveLength(1); expect(w.seen).toEqual(["revoked"]);
    const updated = { kind: "updated", snapshot: {} } as unknown as RelayPoll;
    const u = world({ screen: "lock" }, [updated, updated]);
    u.sync.start(); await settle(); await u.advance(65_000);
    expect(u.seen).toEqual(["updated", "updated"]); expect(u.st.screen).toBe("lock"); expect(times(u)).toEqual([0, 60]);
  });
});
