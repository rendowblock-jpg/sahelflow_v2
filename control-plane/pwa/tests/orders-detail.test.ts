// W3-F4 step 2/4: the order detail, the confirm sheet and the honest outcome texts. Written BEFORE the code.
import { describe, expect, it } from "vitest";
import { STALE_MS } from "../../../src/lib/connected-platform/contracts";
import { formatDzd, t } from "../src/i18n";
import { renderOrderDetail } from "../src/views/orders/detail";
import { NOW, mk, proj, rec, row } from "./orders-fixtures";

const open = (o: Parameters<typeof mk>[0] = {}) => mk({ openId: "o1", openedVersion: 3, ...o });

describe("detail", () => {
  it("shows who, phone (tap to call, LTR mono), address, wilaya, items, source, total, note count", () => {
    const html = renderOrderDetail(open());
    expect(html.match(/<h1[ >]/g)?.length).toBe(1);
    expect(html).toContain("Amina B.");
    expect(html).toMatch(/<a href="tel:0550123456" class="num" dir="ltr">0550123456<\/a>/);
    expect(html).toContain("12 rue Didouche");
    expect(html).toContain("Alger");
    expect(html).toContain("Robe");
    expect(html).toContain("Echarpe");
    expect(html).toContain("+1");
    expect(html).toContain("whatsapp");
    expect(html).toContain(formatDzd(5400, "en"));
    expect(html).toContain(t("en", "orders.detail.notes", { n: 2 }));
    expect(html).toContain('data-version="7"');
  });
  it("a field the role may not see says so, per field: never a dash, an empty value, or null", () => {
    const html = renderOrderDetail(open({ data: proj([row({ customerName: undefined, phone: undefined, address: undefined, wilaya: undefined, totalPrice: undefined })]) }));
    expect(html.match(new RegExp(t("en", "orders.detail.hidden"), "g"))?.length).toBe(5);
    expect(html).not.toMatch(/tel:|—|>-<|null|undefined/);
  });
  it("loading is a skeleton block; error names itself and offers Retry; a missing order says it is not in the list", () => {
    expect(renderOrderDetail(open({ read: "loading", data: null, asOf: null }))).toContain('aria-busy="true"');
    const err = renderOrderDetail(open({ read: "error", data: null, asOf: null }));
    expect(err).toContain(t("en", "orders.detail.error")); expect(err).toContain('data-act="orders-retry"');
    const gone = renderOrderDetail(open({ openId: "zzz" }));
    expect(gone).toContain(t("en", "orders.detail.gone")); expect(gone).not.toContain('data-act="confirm-open"');
  });
  it("the version changed since it was opened: banner, and no decision until the seller has looked", () => {
    const html = renderOrderDetail(open({ openedVersion: 2 }));
    expect(html).toContain(t("en", "orders.detail.changed"));
    expect(html).toContain('data-act="ack-change"');
    expect(html).toMatch(/data-act="confirm-open"[^>]*disabled/);
    expect(renderOrderDetail(open())).not.toContain(t("en", "orders.detail.changed"));
  });
});

describe("buttons", () => {
  const enabled = (html: string, act: string): boolean => { const m = html.match(new RegExp(`<button[^>]*data-act="${act}"[^>]*>`)); expect(m, act).not.toBeNull(); return !/\sdisabled/.test(m?.[0] ?? ""); };
  it("Confirm and Reject are enabled for a pending order", () => { const html = renderOrderDetail(open()); expect(enabled(html, "confirm-open")).toBe(true); expect(enabled(html, "reject-open")).toBe(true); });
  it("both are disabled while a command is open on this order, with its chip", () => {
    for (const state of ["queued", "sent", "unknown"] as const) {
      const html = renderOrderDetail(open({ commands: [rec({ state })] }));
      expect(enabled(html, "confirm-open"), state).toBe(false); expect(enabled(html, "reject-open"), state).toBe(false);
      expect(html).toContain(`data-state="${state}"`);
    }
  });
  it("a command on ANOTHER order does not block this one", () => expect(enabled(renderOrderDetail(open({ commands: [rec({ target: { type: "order", id: "other", expectedVersion: 1 } })] })), "confirm-open")).toBe(true));
  it("no buttons for an order that is not waiting for a decision", () => expect(renderOrderDetail(open({ data: proj([row({ status: "confirmed" })]) }))).not.toContain('data-act="confirm-open"'));
  it("expired data (over 24 h): no actions at all and the sentence that says why", () => {
    const html = renderOrderDetail(open({ asOf: NOW - STALE_MS - 1 }));
    expect(html).not.toContain('data-act="confirm-open"'); expect(html).not.toContain('data-act="reject-open"');
    expect(html).toContain(t("en", "orders.state.expired"));
  });
  it("offline: read-only copy, the actions stay (they only save for later), the banner is there", () => {
    const html = renderOrderDetail(open({ online: false }));
    expect(enabled(html, "confirm-open")).toBe(true); expect(html).toContain(t("en", "common.offline"));
  });
});

describe("the confirm sheet: one decision", () => {
  it("confirm sheet: number, customer, total, then Confirm", () => {
    const html = renderOrderDetail(open({ sheet: "confirm" }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-act="confirm-yes"');
    expect(html.match(/class="total num"/)).not.toBeNull();
  });
  it("the sheet leaves out a total the role may not see", () => expect(renderOrderDetail(open({ sheet: "confirm", data: proj([row({ totalPrice: undefined })]) }))).not.toContain('class="total num"'));
  it("reject sheet: exactly the four reasons, no free text", () => {
    const html = renderOrderDetail(open({ sheet: "reject" }));
    expect(html.match(/data-act="reject-yes"/g)?.length).toBe(4);
    for (const k of ["customerCancelled", "fakeOrder", "unreachable", "postponed"]) expect(html).toContain(`data-reason="${k}"`);
    expect(html).not.toMatch(/<input|<textarea[^>]*name="reason"/);
  });
});

describe("outcome texts (F2 result codes)", () => {
  const failed = (resultCode: string) => renderOrderDetail(open({ commands: [rec({ state: "failed", resultCode })], data: proj([row({ status: "confirmed", version: 4 })]), openedVersion: 4 }));
  it("ORDER_ALREADY_*: neutral, nothing more to do", () => { for (const c of ["ORDER_ALREADY_CONFIRMED", "ORDER_ALREADY_CANCELLED"]) expect(failed(c)).toContain(t("en", "orders.outcome.done")); });
  it("ORDER_CHANGED: names the status now, says the tap was NOT applied, offers Review and NEVER a retry", () => {
    const html = failed("ORDER_CHANGED");
    expect(html).toContain(t("en", "orders.outcome.changed", { status: t("en", "orders.status.confirmed") }));
    expect(html).toContain('data-act="order-review"');
    expect(html).not.toContain('data-act="cmd-retry"');
  });
  it("EXPIRED is 'too late', never 'failed'", () => {
    const html = failed("EXPIRED");
    expect(html).toContain(t("en", "orders.outcome.expired")); expect(html).not.toContain(t("en", "cmd.failed"));
  });
  it("an expired COMMAND (state expired) reads the same way", () => expect(renderOrderDetail(open({ commands: [rec({ state: "expired" })] }))).toContain(t("en", "cmd.expired")));
  it("PERMISSION_DENIED, NOT_FOUND, ORDER_NOT_CONFIRMABLE_HERE have their own sentence", () => {
    expect(failed("PERMISSION_DENIED")).toContain(t("en", "orders.outcome.denied"));
    expect(failed("NOT_FOUND")).toContain(t("en", "orders.outcome.notfound"));
    expect(failed("ORDER_NOT_CONFIRMABLE_HERE")).toContain(t("en", "orders.outcome.notconfirmable"));
  });
  it("any other code is a plain 'not done'", () => expect(failed("REMOTE_COMMAND_REJECTED")).toContain(t("en", "cmd.failed")));
});
