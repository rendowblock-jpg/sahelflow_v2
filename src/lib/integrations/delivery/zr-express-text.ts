/**
 * ZR Express (new platform) text normalization helpers — pure module.
 *
 * Verbatim from the live-proven CodFlow integration
 * (cod-server/src/endpoints/delivery-companies/providers/zr_express/text.ts
 * @ 00f18fa, Apache-2.0).
 *
 * ZR's territory DB and workflow states store accent-free text ("Bechar",
 * "Setif", "MSila", "livre") while our reference data and ZR's display text
 * use accented French ("Béchar", "Sétif", "Livré"). ZR's keyword search is
 * ACCENT-SENSITIVE (live-verified 2026-09-10: "Béchar" → 0 results, "Bechar"
 * → wilaya 8), so every comparison/search must run on the stripped form.
 */
export function stripAccents(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "");
}
