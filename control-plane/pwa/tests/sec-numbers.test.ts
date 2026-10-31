// W3b SEC2 fix 3: a count that arrives as a string (a bug or a compromised PC) is never drawn, and never becomes markup.
import { describe, expect, it } from "vitest";
import { storedLabel } from "../src/outbox/outbox";
import { renderNotes } from "../src/views/notes";
import { renderOrderDetail } from "../src/views/orders/detail";
import { renderOrdersList } from "../src/views/orders/list";
import { numText } from "../src/views/view";
import { mk, proj, rec, row } from "./orders-fixtures";

const detail = (o: ReturnType<typeof row>): string => renderOrderDetail(mk({ filter: "all", openId: "o1", openedVersion: 3, data: proj([o]) }));
const list = (o: ReturnType<typeof row>): string => renderOrdersList(mk({ filter: "all", data: proj([o]) }));

describe("numText", () => {
  it("draws a finite number and nothing else", () => {
    expect(numText(3)).toBe("3"); expect(numText(0)).toBe("0"); expect(numText(-2)).toBe("-2");
    for (const bad of ["5", "<img src=x onerror=1>", NaN, Infinity, -Infinity, null, undefined, {}, [3], true]) expect(numText(bad)).toBe("");
  });
});

describe("counts in the order screens", () => {
  it("real numbers are drawn as before", () => {
    const o = row({ id: "o1", items: [{ name: "Robe", qty: 3 }, { name: "Sac", qty: 1 }], moreCount: 2 });
    expect(detail(o)).toContain('dir="ltr">\u00d73</span>'); expect(detail(o)).toContain('dir="ltr">+2</li>');
    expect(list(o)).toContain('dir="ltr">\u00d73</span>'); expect(list(o)).toContain('dir="ltr">+3</span>'); // 1 more item + moreCount 2
  });
  it("a numeric string or a NaN is not drawn as a count", () => {
    const o = row({ id: "o1", items: [{ name: "Robe", qty: "7" as never }], moreCount: "9" as never });
    for (const html of [detail(o), list(o)]) { expect(html).not.toContain("\u00d77"); expect(html).not.toMatch(/\+0?9/); expect(html).not.toContain('class="more'); }
    const n = row({ id: "o1", items: [{ name: "Robe", qty: NaN }], moreCount: Infinity });
    for (const html of [detail(n), list(n)]) { expect(html).not.toContain("NaN"); expect(html).not.toContain("Infinity"); expect(html).not.toContain('class="more'); }
  });
  it("a hostile string for the note version is not written into data-version", () => {
    const h = "<img src=x onerror=1>";
    const html = renderNotes({ entityType: "order", entityId: "o1", noteVersion: h as never, locale: "en", now: 0, online: true, readOnly: false, notes: [rec({ kind: "command.comments.write" })], draft: "", error: null });
    expect(html).not.toContain("<img"); expect(html).toContain('data-version=""');
    expect(renderNotes({ entityType: "order", entityId: "o1", noteVersion: 4, locale: "en", now: 0, online: true, readOnly: false, notes: [], draft: "", error: null })).toContain('data-version="4"');
  });
});

describe("storedLabel keeps a label for an order decision only", () => {
  it("confirm and reject keep it (80 characters at most), every other kind stores an empty string", () => {
    expect(storedLabel("command.orders.confirm", "SF-1042")).toBe("SF-1042");
    expect(storedLabel("command.orders.reject", "SF-1042")).toBe("SF-1042");
    expect(storedLabel("command.orders.confirm", "x".repeat(200))).toBe("x".repeat(80));
    expect(storedLabel("command.messages.reply", "Amina Benali")).toBe("");
    expect(storedLabel("command.comments.write", "a note")).toBe("");
  });
});
