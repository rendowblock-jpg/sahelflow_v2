// W3-F4 step 4: what a tap does. The controller talks to a FAKE outbox; nothing is sent anywhere.
import { describe, expect, it } from "vitest";
import { STALE_MS } from "../../../src/lib/connected-platform/contracts";
import { t } from "../src/i18n";
import { createOrdersController } from "../src/views/orders/controller";
import { NOW, fakeHost, proj, rec, row } from "./orders-fixtures";

const opened = async (o: Parameters<typeof fakeHost>[0] = {}) => { const x = fakeHost(o); const c = createOrdersController(x.host); await c.refresh(); await c.act("open-order", { id: "o1" }); return { ...x, c }; };

describe("Confirm", () => {
  it("sends ONE confirm for this order with the version on screen, closes the sheet, and does not flip the status", async () => {
    const x = await opened(); await x.c.act("confirm-open", {}); expect(x.c.html()).toContain('role="dialog"');
    await x.c.act("confirm-yes", {});
    expect(x.outbox.calls).toHaveLength(1);
    expect(x.outbox.calls[0]).toMatchObject({ kind: "command.orders.confirm", target: { type: "order", id: "o1", expectedVersion: 3 } });
    const html = x.c.html();
    expect(html).not.toContain('role="dialog"'); expect(html).toContain('data-state="queued"');
    expect(html).toContain(t("en", "orders.status.pending")); expect(html).not.toContain(t("en", "cmd.committed"));
    expect(html).toMatch(/data-act="confirm-open"[^>]*disabled/);
  });
  it("uses the version of the row, not a stale one (the row is v9 now)", async () => {
    const x = fakeHost({ data: proj([row({ version: 9 })]) }); const c = createOrdersController(x.host); await c.refresh(); await c.act("open-order", { id: "o1" });
    await c.act("confirm-open", {}); await c.act("confirm-yes", {});
    expect(x.outbox.calls[0]?.target.expectedVersion).toBe(9);
  });
  it("a second tap while one is open sends nothing", async () => {
    const x = await opened(); await x.c.act("confirm-open", {}); await x.c.act("confirm-yes", {});
    await x.c.act("confirm-open", {}); await x.c.act("confirm-yes", {}); await x.c.act("reject-open", {}); await x.c.act("reject-yes", { reason: "fakeOrder" });
    expect(x.outbox.calls).toHaveLength(1);
  });
  it("the busy answer from the outbox is shown, not swallowed", async () => {
    const x = await opened(); x.outbox.next = { ok: false, reason: "target_busy" }; await x.c.act("confirm-open", {}); await x.c.act("confirm-yes", {});
    expect(x.c.html()).toContain(t("en", "orders.busy"));
  });
  it("nothing is sent for expired data (over 24 h), or while the changed banner is unanswered", async () => {
    const old = await opened({ asOf: NOW - STALE_MS - 1 }); await old.c.act("confirm-open", {}); await old.c.act("confirm-yes", {}); expect(old.outbox.calls).toHaveLength(0);
    const x = await opened(); x.state.data = proj([row({ version: 4 })]); await x.c.act("confirm-open", {}); await x.c.act("confirm-yes", {});
    expect(x.outbox.calls).toHaveLength(0);
    await x.c.act("ack-change", {}); await x.c.act("confirm-open", {}); await x.c.act("confirm-yes", {});
    expect(x.outbox.calls[0]?.target.expectedVersion).toBe(4);
  });
  it("offline it is saved for later: queued chip, never done", async () => {
    const x = await opened({ online: false }); await x.c.act("confirm-open", {}); await x.c.act("confirm-yes", {});
    expect(x.outbox.calls).toHaveLength(1); const html = x.c.html();
    expect(html).toContain(t("en", "cmd.queued")); expect(html).not.toContain(t("en", "cmd.committed"));
  });
  it("sends nothing for an order that is not pending", async () => {
    const x = await opened({ data: proj([row({ status: "confirmed" })]) }); await x.c.act("confirm-open", {}); await x.c.act("confirm-yes", {}); expect(x.outbox.calls).toHaveLength(0);
  });
});

describe("Reject", () => {
  it("needs one of the four reason keys: none, unknown, or free text sends nothing", async () => {
    const x = await opened(); await x.c.act("reject-open", {});
    await x.c.act("reject-yes", {}); await x.c.act("reject-yes", { reason: "" }); await x.c.act("reject-yes", { reason: "because I said so" });
    expect(x.outbox.calls).toHaveLength(0); expect(x.c.html()).toContain('role="dialog"');
  });
  it("sends the reason KEY with the version on screen", async () => {
    const x = await opened(); await x.c.act("reject-open", {}); await x.c.act("reject-yes", { reason: "fakeOrder" });
    expect(x.outbox.calls[0]).toMatchObject({ kind: "command.orders.reject", draftText: "fakeOrder", target: { id: "o1", expectedVersion: 3 } });
  });
  it("cancel closes the sheet and sends nothing", async () => { const x = await opened(); await x.c.act("reject-open", {}); await x.c.act("sheet-cancel", {}); expect(x.c.html()).not.toContain('role="dialog"'); expect(x.outbox.calls).toHaveLength(0); });
});

describe("after a refusal", () => {
  it("ORDER_CHANGED is never retried by itself or by a stray tap; Review opens the order again", async () => {
    const x = await opened(); x.outbox.records.push(rec({ state: "failed", resultCode: "ORDER_CHANGED" })); await x.c.refresh();
    await x.c.act("cmd-retry", { id: "o1" }); expect(x.outbox.calls).toHaveLength(0); expect(x.c.html()).not.toContain('role="dialog"');
    await x.c.refresh(); expect(x.outbox.calls).toHaveLength(0);
    await x.c.act("order-review", { id: "o1" }); expect(x.outbox.calls).toHaveLength(0);
  });
  it("an expired command: Try again only re-opens the sheet (one deliberate decision), it does not resend", async () => {
    const x = await opened(); x.outbox.records.push(rec({ state: "expired" })); await x.c.refresh();
    await x.c.act("cmd-retry", { id: "o1" }); expect(x.outbox.calls).toHaveLength(0); expect(x.c.html()).toContain('role="dialog"');
  });
});

describe("the list and the notes through the same controller", () => {
  it("filter, open and back", async () => {
    const x = fakeHost(); const c = createOrdersController(x.host); await c.refresh();
    await c.act("filter", { filter: "all" }); expect(c.html()).toMatch(/data-filter="all"[^>]*aria-pressed="true"/);
    await c.act("filter", { filter: "nonsense" }); expect(c.html()).toMatch(/data-filter="all"[^>]*aria-pressed="true"/);
    await c.act("open-order", { id: "o1" }); expect(x.state.went).toEqual(["order"]); expect(c.html()).toContain('<h1');
    await c.act("back", {}); expect(x.state.went).toEqual(["order", "orders"]);
  });
  it("Retry asks the host to read again and keeps what was on screen", async () => {
    const x = fakeHost({ read: "error" }); const c = createOrdersController(x.host); await c.refresh(); await c.act("orders-retry", {});
    expect(x.state.reloads).toBe(1); expect(c.html()).toContain("SF-1042");
  });
  it("a note typed on the detail is kept as a draft, then sent with the note version of the row", async () => {
    const x = await opened(); await x.c.act("note-draft", { text: "ring twice" });
    const again = createOrdersController(x.host); await again.refresh(); await again.act("open-order", { id: "o1" });
    expect(again.html()).toContain("ring twice");
    await again.act("note-send", { text: "ring twice" });
    expect(x.outbox.calls[0]).toMatchObject({ kind: "command.comments.write", target: { type: "order", id: "o1", expectedVersion: 7 }, draftText: "ring twice" });
    expect(again.html()).not.toContain(">ring twice</textarea>");
  });
});
