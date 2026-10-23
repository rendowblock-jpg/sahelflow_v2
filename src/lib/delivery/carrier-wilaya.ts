import wilayas from "../../../data/wilayas.json";
import { motherWilaya } from "../../../control-plane/storefront/wilaya-fallback";

/**
 * NEW-CARRIER-WILAYA-CODE: the wilaya a courier adapter receives in a booking request.
 *
 * An order keeps the wilaya as it came in. A hosted-storefront order stores the 2-digit code ("05"); a manual order
 * stores a name. EcoTrack and ZR match `String(code) === value` (so "05" never matches 5) and Yalidine sends the value
 * as a wilaya NAME, so a code must become the wilaya's French name before it reaches any carrier. A wilaya created by
 * Loi 26-06 (59..69) is unknown to every carrier, so it is booked under its mother wilaya (its communes are still in
 * the mother's list on the carrier side until the carriers re-map them).
 *
 * Deliberately conservative so nothing that works today changes:
 *  - a name (French or Arabic) of an OLD wilaya is returned exactly as it was typed;
 *  - text that is not a wilaya, and codes that do not exist, are returned unchanged.
 */
type WilayaRow = { code: number; name: string; nameAr: string };

const ROWS = wilayas as WilayaRow[];
const BY_CODE = new Map<number, WilayaRow>(ROWS.map((row) => [row.code, row]));

function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const BY_NAME = new Map<string, WilayaRow>();
for (const row of ROWS) {
  for (const label of [row.name, row.nameAr]) {
    const key = fold(label ?? "");
    if (key) BY_NAME.set(key, row);
  }
}

/** The row of the mother wilaya when `code` is one of 59..69, else undefined. */
function motherRow(code: number): WilayaRow | undefined {
  const mother = motherWilaya(String(code));
  return mother === null ? undefined : BY_CODE.get(Number(mother));
}

export function carrierWilayaName(value: string): string {
  const text = value.trim();
  if (/^\d{1,2}$/.test(text)) {
    const code = Number(text);
    return motherRow(code)?.name ?? BY_CODE.get(code)?.name ?? value;
  }
  const row = BY_NAME.get(fold(text));
  return (row && motherRow(row.code)?.name) ?? value;
}
