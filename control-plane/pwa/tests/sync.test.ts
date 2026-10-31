// W3-F3 step 3: the polling budget. Fake clock and fake timers; nothing waits for real time.
import { describe, expect, it } from "vitest";
import { createSync, type SyncDeps } from "../src/sync/engine";
import { DAILY_CAP, dayKey, intervalFor, kindsFor, nextDelay, spend, statusDelay, type Budget } from "../src/sync/schedule";
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
    expect(intervalFor("settings")).toBe(60_000); expect(intervalFor("welcome")).toBeNull(); expect(intervalFor("pair")).toBeNull(); expect(intervalFor("lock")).toBeNull();
  });
  it("kinds: only what the visible screen shows", () => {
    expect(kindsFor("orders")).toEqual(["orders"]); expect(kindsFor("order")).toEqual(["orders"]); expect(kindsFor("inbox")).toEqual(["conversations"]);
    expect(kindsFor("today")).toEqual(["dashboard"]); expect(kindsFor("welcome")).toEqual([]);
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
});
