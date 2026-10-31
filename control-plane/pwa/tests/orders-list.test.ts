// W3-F4 step 1: the orders list (string renderer + model rules). Written BEFORE the code.
import { describe, expect, it } from "vitest";
import { FRESH_MS, STALE_MS } from "../../../src/lib/connected-platform/contracts";
import { formatDzd, t } from "../src/i18n";
import { filterOrders, freshnessOf } from "../src/views/orders/model";
import { renderOrdersList } from "../src/views/orders/list";
import { NOW, mk, proj, rec, row } from "./orders-fixtures";

const rows = [
  row({ id: "a", orderNumber: "SF-1", status: "pending" }),
  row({ id: "b", orderNumber: "SF-2", status: "confirmed", createdAt: new Date(NOW - 3 * 86_400_000).toISOString() }),
  row({ id: "c", orderNumber: "SF-3", status: "cancelled", createdAt: new Date(NOW - 30 * 3_600_000).toISOString() }),
  row({ id: "d", orderNumber: "SF-4", status: "confirmed", createdAt: new Date(NOW - 3_600_000).toISOString() }),
];
const ids = (html: string): string[] => [...html.matchAll(/<li class="row"[^>]*data-id="([^"]+)"/g)].map((m) => m[1] ?? "");

describe("filters over the sealed projection", () => {
  it("To confirm (default) shows ONLY pending orders", () => expect(ids(renderOrdersList(mk({ data: proj(rows), filter: "confirm" })))).toEqual(["a"]));
  it("Today shows the orders created today (device day), All shows everything", () => {
    expect(ids(renderOrdersList(mk({ data: proj(rows), filter: "today" }))).sort()).toEqual(["a", "d"]);
    expect(ids(renderOrdersList(mk({ data: proj(rows), filter: "all" })))).toEqual(["a", "b", "c", "d"]);
    expect(filterOrders(mk({ data: proj(rows), filter: "all" })).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("the active filter is marked by state, not by colour alone", () => {
    const html = renderOrdersList(mk({ filter: "today" }));
    expect(html).toMatch(/data-filter="today"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-filter="confirm"[^>]*aria-pressed="false"/);
  });
});

describe("a row", () => {
  it("number in mono LTR, status word, first item and +N, total, age", () => {
    const html = renderOrdersList(mk());
    expect(html).toMatch(/<span class="num ord" dir="ltr">SF-1042<\/span>/);
    expect(html).toContain(t("en", "orders.status.pending"));
    expect(html).toContain("Robe");
    expect(html).toContain("+2"); // second item + moreCount 1
    expect(html).toContain(formatDzd(5400, "en"));
    expect(html).toContain("2 h");
  });
  it("a total the role may not see is simply not drawn: no dash, no empty value, no null", () => {
    const html = renderOrdersList(mk({ data: proj([row({ totalPrice: undefined })]) }));
    expect(html).not.toContain("DZD");
    expect(html).not.toMatch(/—|>-<|null|undefined/);
  });
  it("the status always comes from the projection: a queued confirm does NOT flip it", () => {
    const html = renderOrdersList(mk({ commands: [rec({ state: "queued" })] }));
    expect(html).toContain(t("en", "orders.status.pending"));
    expect(html).not.toContain(t("en", "orders.status.confirmed"));
    expect(html).toContain('data-state="queued"');
    expect(html).toContain(t("en", "cmd.queued"));
    expect(html).not.toContain(t("en", "cmd.committed"));
  });
  it("a committed result with a projection that still says pending: chip says done, status stays pending (row keeps To confirm)", () => {
    const html = renderOrdersList(mk({ commands: [rec({ state: "committed" })] }));
    expect(ids(html)).toEqual(["o1"]);
    expect(html).toContain(t("en", "cmd.committed"));
    expect(html).toContain(t("en", "orders.status.pending"));
  });
  it("the row is a 44 px target, labelled, and escapes names", () => {
    const html = renderOrdersList(mk({ data: proj([row({ items: [{ name: "<b>x</b>", qty: 1 }] })]) }));
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toMatch(/aria-label="[^"]*SF-1042/);
    expect(html).not.toMatch(/\sstyle=|<script|\son[a-z]+=/);
  });
  it("Arabic: order number and total stay left-to-right", () => {
    const html = renderOrdersList(mk({ locale: "ar" }));
    expect(html).toMatch(/dir="ltr">SF-1042</);
    // The total mixes digits and an Arabic unit: the whole string is NOT forced left-to-right (dir=auto), the digits keep their own LTR run.
    expect(html).toMatch(/class="total num" dir="auto"/);
    expect(html).not.toMatch(/class="total num" dir="ltr"/);
  });
});

describe("states", () => {
  it("loading = 6 skeleton rows and no spinner", () => {
    const html = renderOrdersList(mk({ read: "loading", data: null, asOf: null }));
    expect(html.match(/<i><\/i>/g)?.length).toBe(6);
    expect(html).not.toMatch(/spinner/i);
  });
  it("empty: the right sentence per filter", () => {
    expect(renderOrdersList(mk({ data: proj([row({ status: "confirmed" })]) }))).toContain(t("en", "orders.empty.confirm"));
    expect(renderOrdersList(mk({ data: proj([]), filter: "all" }))).toContain(t("en", "orders.empty.all"));
    expect(renderOrdersList(mk({ data: proj([row({ createdAt: new Date(NOW - 5 * 86_400_000).toISOString() })]), filter: "today" }))).toContain(t("en", "orders.empty.today"));
  });
  it("error keeps the last copy, with a Retry", () => {
    const html = renderOrdersList(mk({ read: "error" }));
    expect(html).toContain(t("en", "orders.error.read"));
    expect(html).toContain('data-act="orders-retry"');
    expect(ids(html)).toEqual(["o1"]);
    const bare = renderOrdersList(mk({ read: "error", data: null, asOf: null }));
    expect(bare).toContain('data-act="orders-retry"');
  });
  it("truncated: the To confirm window note names shown and the real pending total", () => {
    const html = renderOrdersList(mk({ data: proj([row(), row({ id: "p2", orderNumber: "SF-2" })], { pendingTotal: 61, truncated: true, shown: 50 }) }));
    expect(html).toContain(t("en", "orders.window", { shown: 2, total: 61 }));
    expect(renderOrdersList(mk({ data: proj([row()], { truncated: false }) }))).not.toContain(t("en", "orders.window", { shown: 1, total: 1 }));
  });
  it("truncated in All: says the older orders are on the PC", () => {
    const html = renderOrdersList(mk({ filter: "all", data: proj(rows, { shown: 50, truncated: true }) }));
    expect(html).toContain(t("en", "orders.window.all", { shown: 50 }));
  });
  it("offline: the saved copy plus the offline banner, no 'done'", () => {
    const html = renderOrdersList(mk({ online: false, commands: [rec({ state: "queued" })] }));
    expect(html).toContain(t("en", "common.offline"));
    expect(html).toContain('data-state="offline"');
    expect(html).not.toContain(t("en", "cmd.committed"));
  });
  it("expired (over 24 h): the strip says so", () => {
    const html = renderOrdersList(mk({ asOf: NOW - STALE_MS - 1 }));
    expect(html).toContain('data-state="expired"');
    expect(html).toContain(t("en", "orders.state.expired"));
  });
  it("pc off names the time of the copy", () => expect(renderOrdersList(mk({ pcOff: true }))).toContain('data-state="pcoff"'));
});

describe("how old is the copy (thresholds)", () => {
  const f = (age: number, online = true, pcOff = false) => freshnessOf({ now: NOW, asOf: NOW - age, online, pcOff });
  it("exactly 15 min is fresh, one ms more is stale", () => { expect(f(FRESH_MS)).toBe("fresh"); expect(f(FRESH_MS + 1)).toBe("stale"); });
  it("exactly 24 h is stale, one ms more is expired", () => { expect(f(STALE_MS)).toBe("stale"); expect(f(STALE_MS + 1)).toBe("expired"); });
  it("offline and pc-off win over stale; expired wins over everything; no copy = none", () => {
    expect(f(FRESH_MS + 1, false)).toBe("offline"); expect(f(1000, true, true)).toBe("pcoff"); expect(f(STALE_MS + 1, false, true)).toBe("expired");
    expect(freshnessOf({ now: NOW, asOf: null, online: true, pcOff: false })).toBe("none");
  });
});
