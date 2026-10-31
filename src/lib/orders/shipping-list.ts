import type { Locale } from "@/lib/i18n";
import { formatDZD } from "@/lib/utils";

/**
 * Shipping list (liste d'expédition): the paper a seller hands the courier with the day's parcels.
 * Pure: order details in, printable rows out. No fetch, no DOM.
 */

/** Orders that never go on the courier's paper. */
export const SHIPPING_LIST_EXCLUDED_STATUSES: readonly string[] = ["cancelled", "draft"];
/** "Ready to ship": confirmed by the seller, not yet handed over (bulk "ship" moves confirmed -> shipped). */
export const SHIPPING_LIST_READY_STATUS = "confirmed";
/** Items shown in the items cell before "+N". */
export const SHIPPING_LIST_MAX_ITEMS = 3;
/** Shown where an amount is hidden from this role. */
export const SHIPPING_LIST_NO_AMOUNT = "—";

export interface ShippingListOrderInput {
  orderNumber: string;
  status: string;
  customerName: string | null;
  phone: string | null;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  items: Array<{ name: string; quantity: number }>;
  /** Order total = what the customer pays the courier. Null = hidden from this role. */
  total: number | null;
  provider: string | null;
  trackingNumber: string | null;
}

export interface ShippingListRow {
  number: string;
  customer: string;
  phone: string;
  wilaya: string;
  commune: string;
  address: string;
  /** True when the order has no delivery address: the sheet says so, the row is never dropped. */
  addressMissing: boolean;
  items: string;
  /** Whole dinars (null = hidden). */
  codDzd: number | null;
  /** codDzd through formatDZD. */
  cod: string;
  courier: string;
  tracking: string;
  /** Always empty: the courier signs here. */
  notes: string;
}

export interface ShippingListTotals {
  parcels: number;
  codDzd: number;
  /** Units over every item line, not only the ones shown. */
  items: number;
  /** Rows whose amount was hidden: not counted as 0 dinars. */
  codUnknown: number;
}

export interface ShippingListResult {
  rows: ShippingListRow[];
  totals: ShippingListTotals;
  generatedAt: string;
  locale: Locale;
}

// Control characters and bidi overrides/isolates: a customer name must not reorder the paper.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Plain text for the sheet. Markup is NOT escaped here: the view renders text nodes, which escape. */
function clean(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim();
}

function itemsCell(items: ShippingListOrderInput["items"]): string {
  const shown = items
    .slice(0, SHIPPING_LIST_MAX_ITEMS)
    .map((item) => `${clean(item.name)} x ${item.quantity}`);
  const hidden = items.length - SHIPPING_LIST_MAX_ITEMS;
  if (hidden > 0) shown.push(`+${hidden}`);
  return shown.join("; ");
}

/** Rows to print: the selection if there is one, else every row that is ready to ship. */
export function selectShippingListRows<T extends { id: string; status: string }>(
  rows: readonly T[],
  selectedIds: readonly string[],
): T[] {
  if (selectedIds.length > 0) return rows.filter((row) => selectedIds.includes(row.id));
  return rows.filter((row) => row.status === SHIPPING_LIST_READY_STATUS);
}

export function buildShippingList(
  orders: readonly ShippingListOrderInput[],
  opts: { locale: Locale; now?: Date },
): ShippingListResult {
  const { locale } = opts;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const kept = orders.filter((order) => !SHIPPING_LIST_EXCLUDED_STATUSES.includes(order.status));

  const rows = kept.map((order): { row: ShippingListRow; units: number } => {
    const total = order.total;
    const codDzd = total !== null && Number.isFinite(total) ? Math.round(total) : null;
    const address = clean(order.address);
    return {
      units: order.items.reduce((sum, item) => sum + item.quantity, 0),
      row: {
        number: clean(order.orderNumber),
        customer: clean(order.customerName),
        phone: clean(order.phone),
        wilaya: clean(order.wilaya),
        commune: clean(order.commune),
        address,
        addressMissing: address === "",
        items: itemsCell(order.items),
        codDzd,
        cod: codDzd === null ? SHIPPING_LIST_NO_AMOUNT : formatDZD(codDzd, locale),
        courier: clean(order.provider),
        tracking: clean(order.trackingNumber),
        notes: "",
      },
    };
  });

  rows.sort((a, b) => {
    const aNo = a.row.wilaya === "";
    const bNo = b.row.wilaya === "";
    if (aNo !== bNo) return aNo ? 1 : -1;
    return (
      collator.compare(a.row.wilaya, b.row.wilaya) ||
      collator.compare(a.row.commune, b.row.commune) ||
      collator.compare(a.row.number, b.row.number)
    );
  });

  return {
    rows: rows.map((entry) => entry.row),
    totals: {
      parcels: rows.length,
      codDzd: rows.reduce((sum, entry) => sum + (entry.row.codDzd ?? 0), 0),
      items: rows.reduce((sum, entry) => sum + entry.units, 0),
      codUnknown: rows.filter((entry) => entry.row.codDzd === null).length,
    },
    generatedAt: (opts.now ?? new Date()).toISOString(),
    locale,
  };
}
