/**
 * The pure core of the phone card layout: which column goes to which part of a card. No DOM.
 */
import type { ColumnDef } from "@tanstack/react-table";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { MAX_CARD_FIELDS, columnId, mapColumnsToCard, reactNodeText } from "../card-layout";

type Row = Record<string, unknown>;
type Col = ColumnDef<Row, unknown>;

const col = (id: string, mobile?: { slot: string; label?: string }, extra: Partial<Col> = {}): Col =>
  ({ id, header: () => id, cell: () => id, ...(mobile ? { meta: { mobile } } : {}), ...extra }) as Col;

describe("columnId", () => {
  it("prefers the explicit id, then the accessor key (dots become underscores like TanStack), then a string header", () => {
    expect(columnId({ id: "x", accessorKey: "a.b" } as Col)).toBe("x");
    expect(columnId({ accessorKey: "order.orderNumber" } as Col)).toBe("order_orderNumber");
    expect(columnId({ header: "Name" } as Col)).toBe("Name");
  });
});

describe("mapColumnsToCard: defaults (no metadata at all)", () => {
  it("nothing in, an empty plan out", () => {
    expect(mapColumnsToCard([])).toEqual({
      select: null,
      actions: null,
      title: [],
      subtitle: [],
      status: [],
      fields: [],
      amount: [],
      time: [],
      hidden: [],
      labels: {},
    });
  });

  it("the first column becomes the title and the rest are fields", () => {
    const plan = mapColumnsToCard([col("name"), col("phone"), col("city")]);
    expect(plan.title).toEqual(["name"]);
    expect(plan.fields).toEqual(["phone", "city"]);
    expect(plan.status).toEqual([]);
    expect(plan.amount).toEqual([]);
    expect(plan.time).toEqual([]);
  });

  it("the select column and the actions column are recognised by id and never become the title", () => {
    const plan = mapColumnsToCard([col("select"), col("number"), col("city"), col("actions")]);
    expect(plan.select).toBe("select");
    expect(plan.actions).toBe("actions");
    expect(plan.title).toEqual(["number"]);
    expect(plan.fields).toEqual(["city"]);
  });

  it("hideOn is a table-width rule and does not hide a column on a card", () => {
    const plan = mapColumnsToCard([col("a"), col("b", undefined, { meta: { hideOn: "2xl" } } as Partial<Col>)]);
    expect(plan.fields).toEqual(["b"]);
    expect(plan.hidden).toEqual([]);
  });

  it("keeps column order and does not touch the input", () => {
    const input = [col("a"), col("b"), col("c")];
    const copy = [...input];
    mapColumnsToCard(input);
    expect(input).toEqual(copy);
  });
});

describe("mapColumnsToCard: explicit slots", () => {
  it("honours every slot", () => {
    const plan = mapColumnsToCard([
      col("select"),
      col("n", { slot: "title" }),
      col("c", { slot: "subtitle" }),
      col("s", { slot: "status" }),
      col("w", { slot: "field", label: "City" }),
      col("t", { slot: "amount" }),
      col("d", { slot: "time" }),
      col("h", { slot: "hidden" }),
      col("actions"),
    ]);
    expect(plan).toMatchObject({
      select: "select",
      actions: "actions",
      title: ["n"],
      subtitle: ["c"],
      status: ["s"],
      fields: ["w"],
      amount: ["t"],
      time: ["d"],
      hidden: ["h"],
    });
    expect(plan.labels).toEqual({ w: "City" });
  });

  it("an explicit title stops the first column from being promoted", () => {
    const plan = mapColumnsToCard([col("a"), col("b", { slot: "title" }), col("c")]);
    expect(plan.title).toEqual(["b"]);
    expect(plan.fields).toEqual(["a", "c"]);
  });

  it("the first column is promoted even when a later one is explicit about something else", () => {
    const plan = mapColumnsToCard([col("a"), col("b", { slot: "status" })]);
    expect(plan.title).toEqual(["a"]);
    expect(plan.status).toEqual(["b"]);
  });

  it("an explicit slot on a select or actions column wins over the id", () => {
    const plan = mapColumnsToCard([col("select", { slot: "hidden" }), col("a"), col("actions", { slot: "field" })]);
    expect(plan.select).toBeNull();
    expect(plan.actions).toBeNull();
    expect(plan.hidden).toEqual(["select"]);
    expect(plan.fields).toEqual(["actions"]);
  });

  it("a second select column is kept out of the way, not lost", () => {
    const plan = mapColumnsToCard([col("select"), col("a"), col("pick", { slot: "select" })]);
    expect(plan.select).toBe("select");
    expect(plan.hidden).toEqual(["pick"]);
  });

  it("a second actions column is kept out of the way, not lost", () => {
    const plan = mapColumnsToCard([col("a"), col("actions"), col("more", { slot: "actions" })]);
    expect(plan.actions).toBe("actions");
    expect(plan.hidden).toEqual(["more"]);
  });

  it("several columns can share title, subtitle, status, amount and time; they keep their order", () => {
    const plan = mapColumnsToCard([
      col("a", { slot: "status" }),
      col("b", { slot: "status" }),
      col("c", { slot: "amount" }),
      col("d", { slot: "amount" }),
    ]);
    expect(plan.status).toEqual(["a", "b"]);
    expect(plan.amount).toEqual(["c", "d"]);
  });

  it("an unknown slot string falls back to a field instead of dropping the column", () => {
    const plan = mapColumnsToCard([col("a"), col("b", { slot: "banana" })]);
    expect(plan.fields).toEqual(["b"]);
  });
});

describe("mapColumnsToCard: the field cap", () => {
  it("shows at most four fields and moves the rest to hidden, in column order", () => {
    expect(MAX_CARD_FIELDS).toBe(4);
    const plan = mapColumnsToCard([col("t"), col("f1"), col("f2"), col("f3"), col("f4"), col("f5"), col("f6")]);
    expect(plan.fields).toEqual(["f1", "f2", "f3", "f4"]);
    expect(plan.hidden).toEqual(["f5", "f6"]);
  });

  it("exactly four fields are all kept", () => {
    const plan = mapColumnsToCard([col("t"), col("f1"), col("f2"), col("f3"), col("f4")]);
    expect(plan.fields).toHaveLength(4);
    expect(plan.hidden).toEqual([]);
  });

  it("explicitly hidden columns do not use up the cap", () => {
    const plan = mapColumnsToCard([col("t"), col("x", { slot: "hidden" }), col("f1"), col("f2"), col("f3"), col("f4")]);
    expect(plan.fields).toEqual(["f1", "f2", "f3", "f4"]);
    expect(plan.hidden).toEqual(["x"]);
  });
});

describe("reactNodeText", () => {
  it("reads strings, numbers, arrays and nested elements; skips components, null and booleans", () => {
    const Icon = () => null;
    expect(reactNodeText("Order")).toBe("Order");
    expect(reactNodeText(12)).toBe("12");
    expect(reactNodeText(null)).toBe("");
    expect(reactNodeText(false)).toBe("");
    expect(reactNodeText(createElement("span", null, "Order ", createElement(Icon)))).toBe("Order");
    expect(reactNodeText(["a ", createElement("b", null, "b"), " ", 3])).toBe("a b 3");
    expect(reactNodeText(createElement("span", null, "  Order\n  number "))).toBe("Order number");
  });
});
