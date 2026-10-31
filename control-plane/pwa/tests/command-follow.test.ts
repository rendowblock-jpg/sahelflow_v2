// W3b W196: the phone tells the seller what happened to her tap. One small module (src/app/command-follow.ts) joins the
// outbox, the screens and the status poll: after an accepted tap -> flush, tell the screens, arm the status poll; after every
// status poll -> tell the screens only when a record really changed. Fakes only here; the chain test has the real outbox.
import { describe, expect, it } from "vitest";
import { createCommandFollow } from "../src/app/command-follow";
import type { EnqueueInput, EnqueueResult } from "../src/outbox/outbox";
import type { OutboxRecord } from "../src/outbox/state";
import { createSync } from "../src/sync/engine";

const rec = (id: string, state: string, resultCode?: string): OutboxRecord =>
  ({ commandId: id, state, ...(resultCode === undefined ? {} : { resultCode }) }) as unknown as OutboxRecord;
const input = { kind: "confirm_order" } as unknown as EnqueueInput;
const flushWait = async (): Promise<void> => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

function rig(opts: { ok?: boolean; flush?: () => Promise<unknown>; rows?: OutboxRecord[]; listFails?: boolean } = {}) {
  const calls: string[] = []; const st = { rows: opts.rows ?? [rec("c1", "queued")], listFails: opts.listFails === true };
  const follow = createCommandFollow({ commandSent: () => { calls.push("commandSent"); } });
  follow.subscribe(() => { calls.push("notify"); });
  const outbox = {
    list: async (): Promise<readonly OutboxRecord[]> => { if (st.listFails) throw new Error("idb"); return st.rows; },
    flush: async (): Promise<unknown> => { calls.push("flush"); return opts.flush ? opts.flush() : undefined; },
    enqueue: async (_i: EnqueueInput): Promise<EnqueueResult> => { calls.push("enqueue"); return (opts.ok === false ? { ok: false, reason: "blocked" } : { ok: true, record: st.rows[0] }) as unknown as EnqueueResult; },
  };
  return { calls, st, follow, outbox, wrapped: follow.wrap(outbox) };
}

describe("after an accepted tap: flush, tell the screens, arm the status poll (in that order)", () => {
  it("notify comes only AFTER the flush has finished, commandSent after notify, each once", async () => {
    let done: () => void = () => undefined; const gate = new Promise<void>((r) => { done = r; });
    const w = rig({ flush: () => gate });
    const r = await w.wrapped.enqueue(input);
    expect((r as { ok: boolean }).ok).toBe(true);
    await flushWait(); expect(w.calls).toEqual(["enqueue", "flush"]); // the tap returned at once; nothing is told while the flush runs
    done(); await flushWait();
    expect(w.calls).toEqual(["enqueue", "flush", "notify", "commandSent"]);
  });
  it("a refused enqueue calls nothing: no flush, no notify, no status poll", async () => {
    const w = rig({ ok: false });
    const r = await w.wrapped.enqueue(input); await flushWait();
    expect((r as { ok: boolean }).ok).toBe(false); expect(w.calls).toEqual(["enqueue"]);
  });
  it("a flush that THROWS still tells the screens and arms the poll (the record stays queued; the next poll retries)", async () => {
    const w = rig({ flush: async () => { throw new Error("offline"); } });
    await w.wrapped.enqueue(input); await flushWait();
    expect(w.calls).toEqual(["enqueue", "flush", "notify", "commandSent"]);
  });
  it("two taps in a row: commandSent twice, but the engine keeps ONE status timer at 2 s", async () => {
    const timers: Array<{ ms: number; live: boolean }> = [];
    const sync = createSync({
      now: () => 0, visible: () => true, online: () => true, screen: () => "orders",
      fetchKind: async () => ({ kind: "unchanged" }), pollCommands: async () => false, loadBudget: async () => null, saveBudget: async () => undefined, onPoll: () => undefined,
      timers: { set: (_fn, ms) => { const t = { ms, live: true }; timers.push(t); return t; }, clear: (h) => { (h as { live: boolean }).live = false; } },
    });
    let sent = 0; const follow = createCommandFollow({ commandSent: () => { sent += 1; sync.commandSent(); } });
    const o = { list: async () => [] as readonly OutboxRecord[], flush: async () => undefined, enqueue: async () => ({ ok: true }) as unknown as EnqueueResult };
    const w = follow.wrap(o); await w.enqueue(input); await w.enqueue(input); await flushWait();
    expect(sent).toBe(2); expect(timers.filter((t) => t.live)).toHaveLength(1); expect(timers.filter((t) => t.live)[0]?.ms).toBe(2000);
  });
});

describe("after every status poll: tell the screens only when a record changed", () => {
  it("queued -> sent during the poll: notify once, and the poll's own answer is passed on", async () => {
    const w = rig();
    const open = await w.follow.polled(w.outbox, async () => { w.st.rows = [rec("c1", "committed")]; return false; });
    expect(open).toBe(false); expect(w.calls).toEqual(["notify"]);
  });
  it("nothing changed: no notify, and a still-open answer is passed on", async () => {
    const w = rig();
    expect(await w.follow.polled(w.outbox, async () => true)).toBe(true); expect(w.calls).toEqual([]);
  });
  it("a changed result code on the same state is a change; a record that vanished is a change", async () => {
    const a = rig({ rows: [rec("c1", "rejected")] });
    await a.follow.polled(a.outbox, async () => { a.st.rows = [rec("c1", "rejected", "ALREADY_ANSWERED")]; return false; }); expect(a.calls).toEqual(["notify"]);
    const b = rig({ rows: [rec("c1", "queued"), rec("c2", "queued")] });
    await b.follow.polled(b.outbox, async () => { b.st.rows = [rec("c1", "queued")]; return false; }); expect(b.calls).toEqual(["notify"]);
  });
  it("a poll that throws after a record changed still tells the screens, then rethrows", async () => {
    const w = rig();
    await expect(w.follow.polled(w.outbox, async () => { w.st.rows = [rec("c1", "committed")]; throw new Error("net"); })).rejects.toThrow("net");
    expect(w.calls).toEqual(["notify"]);
  });
  it("a list that cannot be read tells nobody (no guess)", async () => {
    const w = rig({ listFails: true });
    expect(await w.follow.polled(w.outbox, async () => true)).toBe(true); expect(w.calls).toEqual([]);
  });
});

describe("one emitter for every screen", () => {
  it("every subscriber is told, an unsubscribed one is not, and one throwing screen does not stop the others", () => {
    const f = createCommandFollow({ commandSent: () => undefined }); const seen: string[] = [];
    f.subscribe(() => { throw new Error("screen broke"); });
    const offB = f.subscribe(() => { seen.push("b"); }); f.subscribe(() => { seen.push("c"); });
    f.notify(); offB(); f.notify();
    expect(seen).toEqual(["b", "c", "c"]);
  });
});
