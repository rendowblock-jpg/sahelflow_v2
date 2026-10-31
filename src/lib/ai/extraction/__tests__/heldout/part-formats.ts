import { ord, ph, phoneStyles } from "./build";

/** The same order, the phone written ten ways (10 messages). */
const styles = phoneStyles(200);
export const HELDOUT_PHONE_FORMATS = styles.map((style, n) =>
  ord(`HO-PH-${String(n + 1).padStart(2, "0")}`, "phone-format", `Commande: 1 sac, Alger, ${style}`, { p: ph(200), w: "Alger", i: [["sac", 1]] }),
);

/** [how the customer writes the wilaya, canonical name]. Aliases and Arabic spellings. */
const WILAYA_WRITINGS: [string, string][] = [
  ["Dzayer", "Alger"],
  ["Algiers", "Alger"],
  ["Béjaia", "Béjaïa"],
  ["Setif", "Sétif"],
  ["Qacentina", "Constantine"],
  ["Tamanghasset", "Tamanrasset"],
  ["Wargla", "Ouargla"],
  ["Bordj Bou Arreridj", "Bordj Bou Arréridj"],
  ["Sidi bel abbes", "Sidi Bel Abbès"],
  ["Ain Temouchent", "Aïn Témouchent"],
  ["Eloued", "El Oued"],
  ["Souk Ahras", "Souk Ahras"],
  ["Tbessa", "Tébessa"],
  ["Khenchela", "Khenchela"],
  ["Touggourt", "Touggourt"],
  ["Timimoun", "Timimoun"],
  ["Bou Saada", "Bou Saada"],
  ["Ouled Djellal", "Ouled Djellal"],
  ["Djanet", "Djanet"],
  ["El Meniaa", "El Meniaa"],
  ["Aflou", "Aflou"],
  ["In Salah", "In Salah"],
  ["أدرار", "Adrar"],
  ["الشلف", "Chlef"],
  ["الأغواط", "Laghouat"],
  ["أم البواقي", "Oum El Bouaghi"],
  ["بشار", "Béchar"],
  ["البويرة", "Bouira"],
  ["جيجل", "Jijel"],
  ["سعيدة", "Saïda"],
  ["قالمة", "Guelma"],
  ["المدية", "Médéa"],
  ["المسيلة", "M'Sila"],
  ["معسكر", "Mascara"],
  ["البيض", "El Bayadh"],
  ["تندوف", "Tindouf"],
  ["الطارف", "El Tarf"],
  ["تيسمسيلت", "Tissemsilt"],
  ["خنشلة", "Khenchela"],
  ["ميلة", "Mila"],
  ["عين الدفلى", "Aïn Defla"],
  ["النعامة", "Naâma"],
  ["عين تموشنت", "Aïn Témouchent"],
  ["غليزان", "Relizane"],
  ["تيميمون", "Timimoun"],
  ["أولاد جلال", "Ouled Djellal"],
  ["جانت", "Djanet"],
  ["بوسعادة", "Bou Saada"],
];

export const HELDOUT_WILAYAS = WILAYA_WRITINGS.map(([written, canonical], n) =>
  ord(
    `HO-WI-${String(n + 1).padStart(2, "0")}`,
    "wilaya-alias",
    /[\u0600-\u06FF]/.test(written) ? `نحب 1 سروال، ${written}، ${ph(300 + n, "0661")}` : `Commande: 1 pantalon, ${written}, ${ph(300 + n, "0661")}`,
    { p: ph(300 + n, "0661"), w: canonical, i: [[/[\u0600-\u06FF]/.test(written) ? "سروال" : "pantalon", 1]] },
  ),
);
