// W3b SEC check 1: every phone renderer is fed hostile text in every field a customer or the seller can type.
import { describe, expect, it } from "vitest";
import { renderChip } from "../src/kit/command-chip";
import { renderConfirmSheet } from "../src/kit/confirm-sheet";
import { renderInboxList } from "../src/views/inbox/list";
import { renderThread } from "../src/views/inbox/thread";
import { renderNotes } from "../src/views/notes";
import { renderOrderDetail } from "../src/views/orders/detail";
import { renderOrdersList } from "../src/views/orders/list";
import { conv, mk as mkInbox, msg, proj as cproj, reply } from "./inbox-fixtures";
import { mk as mkOrders, proj as oproj, rec, row } from "./orders-fixtures";
import { violations } from "./sec-html-check";

const CORPUS: readonly string[] = [
  "<img src=x onerror=1>", '"><script>alert(1)</script>', `'"><svg onload=1>`, '" onmouseover="alert(1)', "javascript:alert(1)", "</textarea><b>x</b>",
  "\u202Eevil", "${1+1}", "`${1+1}`", "</bdi></p><script>1</script>", "A".repeat(100_000),
];
const seen = (html: string, h: string): boolean => h.length > 1000 || html.includes(h.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")) || h.startsWith("\u202E");

describe.each(CORPUS)("hostile text %#", (h) => {
  const bad = (html: string): string[] => violations(html).map((v) => v.slice(0, 120));
  const failed = rec({ state: "failed", lastError: h, labelForUi: h, draftText: h, target: { type: "order", id: h, expectedVersion: 3 } });
  it("orders list and detail (customer, phone, address, wilaya, items, number, source, status, id)", () => {
    const o = row({ id: h, orderNumber: h, customerName: h, phone: h, address: h, wilaya: h, source: h, status: h, items: [{ name: h, qty: 1 }] });
    const list = renderOrdersList(mkOrders({ filter: "all", data: oproj([o]), commands: [failed] }));
    const det = renderOrderDetail(mkOrders({ filter: "all", openId: h, openedVersion: 3, data: oproj([o]), commands: [failed], sheet: "confirm" }));
    expect(bad(list)).toEqual([]); expect(bad(det)).toEqual([]);
    expect(seen(list, h) && seen(det, h)).toBe(true);
  });
  it("inbox list and thread (name, phone, message text, id, delivery status, type, notes, drafts)", () => {
    const c = conv({ id: h, contactName: h, phone: h, messages: [msg({ id: h, text: h, deliveryStatus: h as never, type: h as never }), msg({ id: "m2", direction: "out", text: h, deliveryStatus: h as never, held: true })] });
    const r = reply({ state: "failed", lastError: h, labelForUi: h, draftText: h, target: { type: "conversation", id: h, lastSeenMessageId: "m2" } });
    const m = mkInbox({ data: cproj([c]), openId: h, draft: h, noteDraft: h, commands: [r] });
    const list = renderInboxList(m); const thread = renderThread(m);
    expect(bad(list)).toEqual([]); expect(bad(thread)).toEqual([]);
    expect(seen(thread, h)).toBe(true);
  });
  it("notes, command chip, confirm sheet", () => {
    const n = renderNotes({ entityType: "order", entityId: h, noteVersion: 1, locale: "en", now: 0, online: true, readOnly: false, notes: [rec({ kind: "command.comments.write", draftText: h, labelForUi: h, lastError: h, state: "failed" })], draft: h, error: null });
    const chip = renderChip({ record: failed, locale: "fr", now: 0 });
    const sheet = renderConfirmSheet({ mode: "confirm", number: h, customer: h, total: h, locale: "ar" });
    expect(bad(n)).toEqual([]); expect(bad(chip)).toEqual([]); expect(bad(sheet)).toEqual([]);
  });
});

describe("numbers that arrive inside a sealed payload are drawn as numbers or not at all", () => {
  it("a string where a count belongs does not become markup", () => {
    const h = "<img src=x onerror=1>";
    const o = row({ items: [{ name: "Robe", qty: h as never }], moreCount: h as never, noteCount: h as never, noteVersion: h as never });
    const html = renderOrderDetail(mkOrders({ filter: "all", openId: "o1", openedVersion: 3, data: oproj([o]) })) + renderOrdersList(mkOrders({ filter: "all", data: oproj([o]) }));
    expect(violations(html)).toEqual([]);
  });
});
