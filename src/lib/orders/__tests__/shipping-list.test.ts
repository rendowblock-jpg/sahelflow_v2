import { describe, expect, it } from "vitest";

import {
  buildShippingList,
  selectShippingListRows,
  type ShippingListOrderInput,
} from "@/lib/orders/shipping-list";
import { formatDZD } from "@/lib/utils";

const NOW = new Date("2026-10-31T09:50:00.000Z");
const order = (o: Partial<ShippingListOrderInput> = {}): ShippingListOrderInput => ({
  orderNumber: "ORD-1",
  status: "confirmed",
  customerName: "Sara",
  phone: "0555123456",
  wilaya: "16",
  commune: "Bab Ezzouar",
  address: "12 rue des Oliviers",
  items: [{ name: "Robe", quantity: 1 }],
  total: 4500,
  provider: "Yalidine",
  trackingNumber: null,
  ...o,
});
const build = (orders: ShippingListOrderInput[], locale: "ar" | "fr" | "en" = "fr") =>
  buildShippingList(orders, { locale, now: NOW });

describe("buildShippingList", () => {
  it("leaves out cancelled and draft orders and keeps every other status", () => {
    const statuses = ["cancelled", "draft", "confirmed", "pending", "shipped"];
    const list = build(statuses.map((status, i) => order({ status, orderNumber: `N${i}` })));
    expect(list.rows.map((r) => r.number).sort()).toEqual(["N2", "N3", "N4"]);
    expect(list.totals.parcels).toBe(3);
  });

  it("keeps an order with no address and marks it, never hides it", () => {
    const list = build([order({ address: null }), order({ orderNumber: "B", address: "   " })]);
    expect(list.rows).toHaveLength(2);
    expect(list.rows.every((r) => r.addressMissing && r.address === "")).toBe(true);
    expect(build([order()]).rows[0]?.addressMissing).toBe(false);
  });

  it("sorts by wilaya (numeric), then commune, then number; no wilaya goes last", () => {
    const list = build([
      order({ orderNumber: "E", wilaya: null, commune: "Zeralda" }),
      order({ orderNumber: "D", wilaya: "31", commune: "Oran" }),
      order({ orderNumber: "A1", wilaya: "16", commune: "Hydra" }),
      order({ orderNumber: "B", wilaya: "16", commune: "Bab Ezzouar" }),
      order({ orderNumber: "A", wilaya: "9", commune: "Blida" }),
      order({ orderNumber: "B0", wilaya: "16", commune: "Bab Ezzouar" }),
    ]);
    expect(list.rows.map((r) => r.number)).toEqual(["A", "B", "B0", "A1", "D", "E"]);
  });

  it("shows at most 3 items as 'name x qty' then '+N'; totals.items counts every unit", () => {
    const items = [1, 2, 3, 4, 5].map((q) => ({ name: `P${q}`, quantity: q }));
    expect(build([order({ items })]).rows[0]?.items).toBe("P1 x 1; P2 x 2; P3 x 3; +2");
    expect(build([order({ items: items.slice(0, 3) })]).rows[0]?.items).toBe("P1 x 1; P2 x 2; P3 x 3");
    expect(build([order({ items: items.slice(0, 4) })]).rows[0]?.items).toBe("P1 x 1; P2 x 2; P3 x 3; +1");
    expect(build([order({ items })]).totals.items).toBe(15);
  });

  it("formats COD with formatDZD and the total is the sum of the rows to the dinar", () => {
    const list = build([order({ orderNumber: "A", total: 4500 }), order({ orderNumber: "B", total: 1999.5 }), order({ orderNumber: "C", total: 250 })]);
    expect(list.rows.map((r) => r.codDzd)).toEqual([4500, 2000, 250]);
    expect(list.rows[0]?.cod).toBe(formatDZD(4500, "fr"));
    expect(list.totals.codDzd).toBe(6750);
    expect(list.totals.codDzd).toBe(list.rows.reduce((s, r) => s + (r.codDzd ?? 0), 0));
    expect(build([order()], "ar").rows[0]?.cod).toBe(formatDZD(4500, "ar"));
  });

  it("counts an order without an amount instead of treating it as 0", () => {
    const list = build([order({ total: null }), order({ orderNumber: "B", total: 100 })]);
    expect(list.rows.find((r) => r.number === "ORD-1")?.cod).toBe("—");
    expect(list.totals.codDzd).toBe(100);
    expect(list.totals.codUnknown).toBe(1);
  });

  it("carries courier and tracking, and leaves the notes cell empty", () => {
    const row = build([order({ trackingNumber: "YAL-77" })]).rows[0];
    expect(row).toMatchObject({ courier: "Yalidine", tracking: "YAL-77", notes: "", phone: "0555123456" });
    expect(row?.wilaya).toBe("16");
    expect(row?.commune).toBe("Bab Ezzouar");
  });

  it("keeps markup characters as text and strips control and bidi-override characters", () => {
    const row = build([order({ customerName: "<script>alert(1)</script>", address: "\"><img src=x onerror=1> A\u202EB\u0007C\n D" })]).rows[0];
    expect(row?.customer).toBe("<script>alert(1)</script>");
    expect(row?.address).toBe("\"><img src=x onerror=1> ABC D");
  });

  it("keeps Arabic and Latin names as written", () => {
    const list = build([order({ customerName: "محمد بن علي" }), order({ orderNumber: "B", customerName: "Sara O'Brien" })]);
    expect(list.rows.map((r) => r.customer).sort()).toEqual(["Sara O'Brien", "محمد بن علي"]);
  });

  it("returns an honest empty list for 0 orders", () => {
    expect(build([], "en")).toEqual({
      rows: [],
      totals: { parcels: 0, codDzd: 0, items: 0, codUnknown: 0 },
      generatedAt: "2026-10-31T09:50:00.000Z",
      locale: "en",
    });
  });
});

describe("selectShippingListRows", () => {
  const rows = [
    { id: "a", status: "confirmed" },
    { id: "b", status: "pending" },
    { id: "c", status: "confirmed" },
  ];
  it("uses the selection when there is one", () => {
    expect(selectShippingListRows(rows, ["b", "zzz"]).map((r) => r.id)).toEqual(["b"]);
  });
  it("falls back to the rows ready to ship (confirmed) when nothing is selected", () => {
    expect(selectShippingListRows(rows, []).map((r) => r.id)).toEqual(["a", "c"]);
  });
});
