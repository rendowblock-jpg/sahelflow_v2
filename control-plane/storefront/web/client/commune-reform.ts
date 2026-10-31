/**
 * Builds the reform data (see Reform in communes.ts) from the repo's own sources: the alias list (commune-aliases.ts), the pairs
 * "new wilaya -> mother wilaya" the fee fallback already uses (wilaya-fallback.ts) and the wilaya names (data/wilayas.json).
 * Used by scripts/storefront-public-build.ts (writes c.<hash>/reform.json) and by the local order form. NOT part of the page script.
 */
import { MOTHER_OF_NEW_WILAYA } from "../../wilaya-fallback";
import { COMMUNE_ALIAS_ROWS } from "./commune-aliases";
import type { Reform } from "./communes";

export type WilayaName = { code: number; name: string; nameAr: string };

export function buildReform(wilayas: readonly WilayaName[]): Reform {
  const moved: Record<string, [string, string, string]> = {};
  for (const [child, mother] of Object.entries(MOTHER_OF_NEW_WILAYA)) {
    const real = wilayas.find((wilaya) => String(wilaya.code).padStart(2, "0") === mother);
    if (!real) throw new Error(`wilaya ${mother}, the mother of ${child}, is missing from data/wilayas.json`);
    moved[child] = [mother, real.name, real.nameAr];
  }
  return { aliases: COMMUNE_ALIAS_ROWS, moved };
}
