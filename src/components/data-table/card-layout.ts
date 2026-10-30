import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";

/**
 * Where a column goes on a phone card.
 *  - title / subtitle: the identity line (order number, then customer).
 *  - status: the chip row. field: a label + value pair in the two-column grid (at most MAX_CARD_FIELDS).
 *  - amount / time: the footer (money on the start side, date on the end side).
 *  - hidden: not shown on a card. select / actions: the row checkbox and the row menu (found by id when not declared).
 */
export type CardSlot =
  | "title"
  | "subtitle"
  | "status"
  | "field"
  | "amount"
  | "time"
  | "hidden"
  | "select"
  | "actions";

export interface CardColumnMeta {
  slot: CardSlot;
  /** The text above a field value. Without it the column header's text is used. */
  label?: string;
}

/** A card with more than four key/value pairs stops being a glance. */
export const MAX_CARD_FIELDS = 4;

export interface CardPlan {
  select: string | null;
  actions: string | null;
  title: string[];
  subtitle: string[];
  status: string[];
  fields: string[];
  amount: string[];
  time: string[];
  /** Columns a card does not show: declared hidden, a duplicate select/actions, or fields past the cap. */
  hidden: string[];
  labels: Record<string, string>;
}

const SLOTS: ReadonlySet<string> = new Set<CardSlot>([
  "title",
  "subtitle",
  "status",
  "field",
  "amount",
  "time",
  "hidden",
  "select",
  "actions",
]);

/** The id TanStack gives a column: explicit id, else the accessor key (dots become underscores), else a string header. */
export function columnId<T>(def: ColumnDef<T, unknown>): string {
  if (def.id) return def.id;
  const key = (def as { accessorKey?: unknown }).accessorKey;
  if (typeof key === "string" && key) return key.replace(/\./g, "_");
  return typeof def.header === "string" ? def.header : "";
}

/**
 * Sorts a table's columns into card slots. A column with no `meta.mobile` is a field, except the column with id
 * `select` (the row checkbox) and the column with id `actions` (the row menu); when nothing declares a title, the first
 * of the undeclared columns becomes it. `hideOn` is a table-width rule and is ignored here: a card has the room.
 */
export function mapColumnsToCard<T>(columns: ReadonlyArray<ColumnDef<T, unknown>>): CardPlan {
  const plan: CardPlan = {
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
  };

  const resolved = columns.map((def) => {
    const id = columnId(def);
    const declared = def.meta?.mobile;
    if (declared?.label) plan.labels[id] = declared.label;
    if (declared && SLOTS.has(declared.slot)) return { id, slot: declared.slot, implicit: false };
    const slot: CardSlot = id === "select" ? "select" : id === "actions" ? "actions" : "field";
    return { id, slot, implicit: slot === "field" };
  });

  if (!resolved.some((column) => column.slot === "title")) {
    const first = resolved.find((column) => column.implicit);
    if (first) first.slot = "title";
  }

  for (const { id, slot } of resolved) {
    switch (slot) {
      case "select":
        if (plan.select === null) plan.select = id;
        else plan.hidden.push(id);
        break;
      case "actions":
        if (plan.actions === null) plan.actions = id;
        else plan.hidden.push(id);
        break;
      case "field":
        if (plan.fields.length < MAX_CARD_FIELDS) plan.fields.push(id);
        else plan.hidden.push(id);
        break;
      default:
        plan[slot].push(id);
    }
  }
  return plan;
}

function collect(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collect).join("");
  if (React.isValidElement(node)) {
    // Components are not called: their output is unknown here, and an icon component must not add text.
    if (typeof node.type === "string" || node.type === React.Fragment) {
      return collect((node.props as { children?: React.ReactNode }).children);
    }
  }
  return "";
}

/** The plain text a header or cell node spells out (string children of plain elements), for labels and options. */
export function reactNodeText(node: React.ReactNode): string {
  return collect(node).replace(/\s+/g, " ").trim();
}
