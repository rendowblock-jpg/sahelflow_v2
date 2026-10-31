// W3-F3 step C(1): the host the orders screen runs on. Fakes for the relay, the opener and the outbox; the REAL vault and controller.
import { describe, expect, it } from "vitest";
import { createOrdersHost, type OpenedOrders, type OrdersHostDeps } from "../src/app/orders-host";
import { createVault } from "../src/storage/sealed";
import { createDraftStore } from "../src/views/notes";
import { createOrdersController } from "../src/views/orders/controller";
import { NOW, fakeOutbox, memDb, proj, row } from "./orders-fixtures";

function setup(o: { opened?: OpenedOrders | null; online?: boolean; fetchThrows?: boolean } = {}) {
  const log: string[] = []; const vault = createVault(); const outbox = fakeOutbox();
  const state = { opened: o.opened === undefined ? { data: proj([row()]), asOf: NOW - 60_000 } : o.opened, online: o.online ?? true };
  const deps: OrdersHostDeps = {
    now: () => NOW, locale: () => "en", online: () => state.online, pcOff: () => false,
    fetchOrders: async () => { log.push("fetch"); if (o.fetchThrows) throw new Error("net"); },
    openOrders: async () => { log.push("open"); return state.opened; },
    vault, outbox, drafts: createDraftStore(memDb(), () => NOW), authorityExpiresAt: () => undefined, go: (s) => { log.push(`go:${s}`); },
  };
  return { host: createOrdersHost(deps), log, vault, outbox, state };
}

describe("orders host: reading", () => {
  it("before the first load it says loading with NO data (never an invented empty list)", () => {
    expect(setup().host.read()).toEqual({ status: "loading", data: null, asOf: null });
  });
  it("reload asks the relay first, then opens the stored copy, and tells the subscribers", async () => {
    const x = setup(); let seen = 0; x.host.subscribe(() => { seen += 1; });
    await x.host.reload();
    expect(x.log).toEqual(["fetch", "open"]);
    const r = x.host.read(); expect(r.status).toBe("ready"); expect(r.data?.orders[0]?.id).toBe("o1"); expect(r.asOf).toBe(NOW - 60_000);
    expect(seen).toBeGreaterThanOrEqual(1);
  });
  it("offline: no relay call, the stored copy is still opened", async () => {
    const x = setup({ online: false }); await x.host.reload();
    expect(x.log).toEqual(["open"]); expect(x.host.read().status).toBe("ready");
  });
  it("a relay that throws does not hide the stored copy", async () => {
    const x = setup({ fetchThrows: true }); await x.host.reload();
    expect(x.log).toEqual(["fetch", "open"]); expect(x.host.read().status).toBe("ready");
  });
  it("nothing readable and nothing in memory: error, then ready after a retry that finds a copy", async () => {
    const x = setup({ opened: null }); await x.host.reload();
    expect(x.host.read()).toEqual({ status: "error", data: null, asOf: null });
    x.state.opened = { data: proj([row()]), asOf: NOW }; await x.host.reload();
    expect(x.host.read().status).toBe("ready");
  });
  it("two reloads at once ask the relay once", async () => {
    const x = setup(); await Promise.all([x.host.reload(), x.host.reload()]);
    expect(x.log.filter((l) => l === "fetch")).toHaveLength(1);
  });
  it("a locked vault empties the screen's data: loading again, and storage is not read until reload", async () => {
    const x = setup(); await x.host.reload(); x.log.length = 0;
    x.vault.lock(); x.host.notify();
    expect(x.host.read()).toEqual({ status: "loading", data: null, asOf: null }); expect(x.log).toEqual([]);
    await x.host.reload(); expect(x.host.read().status).toBe("ready");
  });
  it("unsubscribe stops the calls", async () => {
    const x = setup(); let n = 0; const off = x.host.subscribe(() => { n += 1; }); off(); await x.host.reload(); x.host.notify();
    expect(n).toBe(0);
  });
});

describe("orders host: commands", () => {
  it("enqueue hands the input to the outbox unchanged (the version stays in target.expectedVersion) and returns its answer", async () => {
    const x = setup(); const input = { kind: "command.comments.write" as const, target: { type: "order" as const, id: "o1", expectedVersion: 7 }, labelForUi: "#1", draftText: "hi" };
    const r = await x.host.enqueue(input);
    expect(x.outbox.calls).toEqual([input]); expect(r.ok).toBe(true);
    x.outbox.next = { ok: false, reason: "target_busy" }; expect(await x.host.enqueue(input)).toEqual({ ok: false, reason: "target_busy" });
  });
  it("commands() is the outbox list", async () => {
    const x = setup(); await x.host.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: "o1", expectedVersion: 3 }, labelForUi: "#1", draftText: "" });
    expect((await x.host.commands()).length).toBe(x.outbox.records.length);
  });
  it("the real controller on this host: Confirm sends ONE confirm with the version of the row on screen", async () => {
    const x = setup(); await x.host.reload(); const c = createOrdersController(x.host);
    await c.refresh(); await c.act("open-order", { id: "o1" }); await c.act("confirm-open", {}); await c.act("confirm-yes", {});
    expect(x.outbox.calls).toHaveLength(1);
    expect(x.outbox.calls[0]).toMatchObject({ kind: "command.orders.confirm", target: { type: "order", id: "o1", expectedVersion: 3 } });
    expect(x.log).toContain("go:order");
  });
  it("the real controller: a note carries the thread's note version in target.expectedVersion", async () => {
    const x = setup({ opened: { data: proj([row({ noteVersion: 4 })]), asOf: NOW } }); await x.host.reload(); const c = createOrdersController(x.host);
    await c.refresh(); await c.act("open-order", { id: "o1" }); await c.act("note-send", { text: "call back" });
    expect(x.outbox.calls[0]).toMatchObject({ kind: "command.comments.write", target: { type: "order", id: "o1", expectedVersion: 4 } });
  });
});
