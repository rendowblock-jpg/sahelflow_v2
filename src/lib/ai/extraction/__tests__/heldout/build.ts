/**
 * Held-out set builders. LABEL RULES (written before the extractor was run on
 * this set; nothing here is copied from a real customer):
 * - `expected` carries only what the message states. A field that is absent
 *   means "the message does not say"; a reader that produces it anyway is
 *   counted as "spurious".
 * - phone: the customer's own number, normalised 0XXXXXXXXX. All numbers are
 *   fake: 0550/0661/0770/0555 + "00" + 4 digits (see `ph`).
 * - wilaya: the canonical name of data/wilayas.json; a commune alone does not
 *   state a wilaya, and a question about delivery to a wilaya states nothing.
 * - items: product as the customer wrote it, without greeting or filler;
 *   a unit of count ("paires de") is not part of the name; quantity defaults
 *   to 1 when the message asks for "a/one/wahed/une".
 * - total: only a figure the customer calls the total (total, le tout,
 *   المجموع, ensemble, kamlin). A unit price is not a total.
 */
import type { HeldoutEntry } from "./scorer";

export interface Spec {
  p?: string;
  w?: string;
  c?: string;
  i?: [string, number][];
  t?: number;
}

/** Fake mobile number: prefix + "00" + 4 digits, e.g. ph(7) = 0550000007. */
export function ph(n: number, prefix = "0550"): string {
  return `${prefix}00${String(n).padStart(4, "0")}`;
}

function expectedOf(isOrder: boolean, s: Spec): HeldoutEntry["expected"] {
  return {
    isOrder,
    ...(s.p !== undefined ? { phone: s.p } : {}),
    ...(s.w !== undefined ? { wilaya: s.w } : {}),
    ...(s.c !== undefined ? { commune: s.c } : {}),
    ...(s.i ? { items: s.i.map(([productName, quantity]) => ({ productName, quantity })) } : {}),
    ...(s.t !== undefined ? { totalPrice: s.t } : {}),
  };
}

/** A message that is an order. */
export function ord(id: string, group: string, text: string, s: Spec): HeldoutEntry {
  return { id, group, text, expected: expectedOf(true, s) };
}

/** A message that is NOT an order (it may still state a phone). */
export function none(id: string, group: string, text: string, s: Spec = {}): HeldoutEntry {
  return { id, group, text, expected: expectedOf(false, s) };
}

/** The same number written eight ways, for the phone-format group. */
export function phoneStyles(n: number, prefix = "0550"): string[] {
  const d = ph(n, prefix);
  const arabic = d.replace(/\d/g, (c) => String.fromCharCode(0x0660 + Number(c)));
  return [
    d,
    `${d.slice(0, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)} ${d.slice(8)}`,
    `${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)} ${d.slice(8)}`,
    `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}.${d.slice(8)}`,
    `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}-${d.slice(8)}`,
    `+213 ${d.slice(1, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)} ${d.slice(8)}`,
    `+213${d.slice(1)}`,
    `00213 ${d.slice(1, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)} ${d.slice(8)}`,
    `0 ${d.slice(1, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)} ${d.slice(8)}`,
    arabic,
  ];
}
