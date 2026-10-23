/**
 * STORE-WILAYA69, step A: a shipping fee for the eleven wilayas created by Loi 26-06 (59..69).
 *
 * A published release carries one fee row per (wilaya, delivery mode) that the seller priced. A release published
 * before the reform has rows for the old wilayas only, so a buyer in Aflou (59, formerly in Laghouat, 03) would be
 * told "delivery unavailable" the day the commune list starts offering 59. Until the mother wilaya hands over its
 * administration (31 Dec 2026, art. 54) the new wilaya is served on the mother's terms, so: no rule for the new
 * wilaya -> use the mother's rule for the same delivery mode. A rule the seller wrote for the new wilaya always wins.
 *
 * Source of the pairs: Loi 26-06, JO n.25 of 5 Apr 2026 (art. 52 bis 10-20 for the new wilayas, art. 7..36 for the
 * communes each mother keeps) and the arrete of 5 May 2026, JO n.58 (annex: code 59 Aflou ... 69 El Abiodh Sidi Cheikh).
 * Until the 69-wilaya data ships (STORE-WILAYA69 step B) no page offers a code above 58, so this changes nothing today.
 */
export const MOTHER_OF_NEW_WILAYA: Readonly<Record<string, string>> = {
  "59": "03", // Aflou
  "60": "05", // Barika
  "61": "07", // El Kantara
  "62": "12", // Bir El Ater
  "63": "13", // El Aricha
  "64": "14", // Ksar Chellala
  "65": "17", // Ain Ouessara
  "66": "17", // Messaad
  "67": "26", // Ksar El Boukhari
  "68": "28", // Bou Saada
  "69": "32", // El Abiodh Sidi Cheikh
};

/** The mother wilaya of a new wilaya code, or null when the code is not one of 59..69. */
export function motherWilaya(wilayaCode: string): string | null {
  return Object.prototype.hasOwnProperty.call(MOTHER_OF_NEW_WILAYA, wilayaCode) ? (MOTHER_OF_NEW_WILAYA[wilayaCode] as string) : null;
}

type Rule = { wilayaCode: string; mode: "home" | "desk"; feeDzd: number };

/** The rules plus, for each new wilaya without its own rule for a mode, a copy of the mother's rule. */
export function withMotherFeeFallback<T extends Rule>(rules: readonly T[]): T[] {
  const have = new Set(rules.map((rule) => `${rule.wilayaCode}:${rule.mode}`));
  const out = [...rules];
  for (const rule of rules) {
    for (const [child, mother] of Object.entries(MOTHER_OF_NEW_WILAYA)) {
      if (rule.wilayaCode !== mother || have.has(`${child}:${rule.mode}`)) continue;
      have.add(`${child}:${rule.mode}`);
      out.push({ ...rule, wilayaCode: child });
    }
  }
  return out;
}
