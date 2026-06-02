/**
 * All 58 Algerian wilayas — single source of truth
 * Used by: shipping rates, onboarding, order creation, risk engine
 */

export type WilayaZone =
  | "north"
  | "east"
  | "west"
  | "center"
  | "highPlateaux"
  | "south";

export interface Wilaya {
  code: number;
  name: string;
  zone: WilayaZone;
}

export const WILAYAS: Wilaya[] = [
  { code: 1, name: "Adrar", zone: "south" },
  { code: 2, name: "Chlef", zone: "west" },
  { code: 3, name: "Laghouat", zone: "highPlateaux" },
  { code: 4, name: "Oum El Bouaghi", zone: "east" },
  { code: 5, name: "Batna", zone: "east" },
  { code: 6, name: "Béjaïa", zone: "east" },
  { code: 7, name: "Biskra", zone: "south" },
  { code: 8, name: "Béchar", zone: "south" },
  { code: 9, name: "Blida", zone: "north" },
  { code: 10, name: "Bouira", zone: "north" },
  { code: 11, name: "Tamanrasset", zone: "south" },
  { code: 12, name: "Tébessa", zone: "east" },
  { code: 13, name: "Tlemcen", zone: "west" },
  { code: 14, name: "Tiaret", zone: "highPlateaux" },
  { code: 15, name: "Tizi Ouzou", zone: "north" },
  { code: 16, name: "Alger", zone: "north" },
  { code: 17, name: "Djelfa", zone: "highPlateaux" },
  { code: 18, name: "Jijel", zone: "east" },
  { code: 19, name: "Sétif", zone: "east" },
  { code: 20, name: "Saïda", zone: "highPlateaux" },
  { code: 21, name: "Skikda", zone: "east" },
  { code: 22, name: "Sidi Bel Abbès", zone: "west" },
  { code: 23, name: "Annaba", zone: "east" },
  { code: 24, name: "Guelma", zone: "east" },
  { code: 25, name: "Constantine", zone: "east" },
  { code: 26, name: "Médéa", zone: "north" },
  { code: 27, name: "Mostaganem", zone: "west" },
  { code: 28, name: "M'Sila", zone: "highPlateaux" },
  { code: 29, name: "Mascara", zone: "west" },
  { code: 30, name: "Ouargla", zone: "south" },
  { code: 31, name: "Oran", zone: "west" },
  { code: 32, name: "El Bayadh", zone: "highPlateaux" },
  { code: 33, name: "Illizi", zone: "south" },
  { code: 34, name: "Bordj Bou Arréridj", zone: "east" },
  { code: 35, name: "Boumerdès", zone: "north" },
  { code: 36, name: "El Tarf", zone: "east" },
  { code: 37, name: "Tindouf", zone: "south" },
  { code: 38, name: "Tissemsilt", zone: "highPlateaux" },
  { code: 39, name: "El Oued", zone: "south" },
  { code: 40, name: "Khenchela", zone: "east" },
  { code: 41, name: "Souk Ahras", zone: "east" },
  { code: 42, name: "Tipaza", zone: "north" },
  { code: 43, name: "Mila", zone: "east" },
  { code: 44, name: "Aïn Defla", zone: "north" },
  { code: 45, name: "Naâma", zone: "west" },
  { code: 46, name: "Aïn Témouchent", zone: "west" },
  { code: 47, name: "Ghardaïa", zone: "south" },
  { code: 48, name: "Relizane", zone: "west" },
  { code: 49, name: "El M'Ghair", zone: "south" },
  { code: 50, name: "El Meniaa", zone: "south" },
  { code: 51, name: "Ouled Djellal", zone: "south" },
  { code: 52, name: "Bordj Baji Mokhtar", zone: "south" },
  { code: 53, name: "Béni Abbès", zone: "south" },
  { code: 54, name: "Timimoun", zone: "south" },
  { code: 55, name: "Touggourt", zone: "south" },
  { code: 56, name: "Djanet", zone: "south" },
  { code: 57, name: "In Salah", zone: "south" },
  { code: 58, name: "In Guezzam", zone: "south" },
];

/** Sorted wilaya names for dropdown lists */
export const WILAYA_NAMES: string[] = WILAYAS.map((w: Wilaya) => w.name).sort();

/** Zone-based default delivery prices (DA) */
export const ZONE_PRICES: Record<WilayaZone, { home: number; desk: number }> = {
  north: { home: 400, desk: 300 },
  east: { home: 500, desk: 380 },
  west: { home: 500, desk: 380 },
  center: { home: 400, desk: 300 },
  highPlateaux: { home: 600, desk: 450 },
  south: { home: 750, desk: 600 },
};

export const WILAYA_ALIASES: Record<string, string> = {
  // French aliases
  alger: "Alger",
  algiers: "Alger",
  algers: "Alger",
  oran: "Oran",
  wahran: "Oran",
  constantine: "Constantine",
  qacentina: "Constantine",
  qsantina: "Constantine",
  annaba: "Annaba",
  "3annaba": "Annaba",
  blida: "Blida",
  "el blida": "Blida",
  setif: "Sétif",
  stif: "Sétif",
  setiff: "Sétif",
  batna: "Batna",
  djelfa: "Djelfa",
  jilfa: "Djelfa",
  "sidi bel abbes": "Sidi Bel Abbès",
  sba: "Sidi Bel Abbès",
  biskra: "Biskra",
  tebessa: "Tébessa",
  tbessa: "Tébessa",
  tiaret: "Tiaret",
  "tizi ouzou": "Tizi Ouzou",
  tizi: "Tizi Ouzou",
  to: "Tizi Ouzou",
  bejaia: "Béjaïa",
  bgayet: "Béjaïa",
  bjaia: "Béjaïa",
  bouira: "Bouira",
  tlemcen: "Tlemcen",
  tilimsen: "Tlemcen",
  jijel: "Jijel",
  skikda: "Skikda",
  mostaganem: "Mostaganem",
  mostaghanem: "Mostaganem",
  msila: "M'Sila",
  "m'sila": "M'Sila",
  chlef: "Chlef",
  chelef: "Chlef",
  medea: "Médéa",
  mascara: "Mascara",
  ouargla: "Ouargla",
  wargla: "Ouargla",
  bechar: "Béchar",
  ghardaia: "Ghardaïa",
  ghardaya: "Ghardaïa",
  "el oued": "El Oued",
  "oued souf": "El Oued",
  boumerdes: "Boumerdès",
  tipaza: "Tipaza",
  tipasa: "Tipaza",
  "ain temouchent": "Aïn Témouchent",
  "ain defla": "Aïn Defla",
  relizane: "Relizane",
  "bordj bou arreridj": "Bordj Bou Arréridj",
  bba: "Bordj Bou Arréridj",
  khenchela: "Khenchela",
  "souk ahras": "Souk Ahras",
  mila: "Mila",
  naama: "Naâma",
  saida: "Saïda",
  adrar: "Adrar",
  tamanrasset: "Tamanrasset",
  tam: "Tamanrasset",
  laghouat: "Laghouat",
  "oum el bouaghi": "Oum El Bouaghi",
  "el bayadh": "El Bayadh",
  illizi: "Illizi",
  tindouf: "Tindouf",
  tissemsilt: "Tissemsilt",
  "el tarf": "El Tarf",
  "el m'ghair": "El M'Ghair",
  "el meniaa": "El Meniaa",
  "ouled djellal": "Ouled Djellal",
  "bordj baji mokhtar": "Bordj Baji Mokhtar",
  "beni abbes": "Béni Abbès",
  timimoun: "Timimoun",
  touggourt: "Touggourt",
  djanet: "Djanet",
  "in salah": "In Salah",
  "in guezzam": "In Guezzam",

  // Arabic aliases
  "أدرار": "Adrar",
  "الشلف": "Chlef",
  "شلف": "Chlef",
  "الأغواط": "Laghouat",
  "أغواط": "Laghouat",
  "اغواط": "Laghouat",
  "أم البواقي": "Oum El Bouaghi",
  "ام البواقي": "Oum El Bouaghi",
  "باتنة": "Batna",
  "بجاية": "Béjaïa",
  "بسكرة": "Biskra",
  "بشار": "Béchar",
  "البليدة": "Blida",
  "بليدة": "Blida",
  "البويرة": "Bouira",
  "بويرة": "Bouira",
  "تمنراست": "Tamanrasset",
  "تبسة": "Tébessa",
  "تلمسان": "Tlemcen",
  "تيارت": "Tiaret",
  "تيزي وزو": "Tizi Ouzou",
  "تيزي": "Tizi Ouzou",
  "الجزائر": "Alger",
  "العاصمة": "Alger",
  "دزاير": "Alger",
  "الجلفة": "Djelfa",
  "جلفة": "Djelfa",
  "جيجل": "Jijel",
  "سطيف": "Sétif",
  "سعيدة": "Saïda",
  "سكيكدة": "Skikda",
  "سيدي بلعباس": "Sidi Bel Abbès",
  "عنابة": "Annaba",
  "قالمة": "Guelma",
  "قسنطينة": "Constantine",
  "المدية": "Médéa",
  "مدية": "Médéa",
  "مستغانم": "Mostaganem",
  "المسيلة": "M'Sila",
  "مسيلة": "M'Sila",
  "معسكر": "Mascara",
  "ورقلة": "Ouargla",
  "وهران": "Oran",
  "البيض": "El Bayadh",
  "إليزي": "Illizi",
  "اليـزي": "Illizi",
  "اليزي": "Illizi",
  "برج بوعريريج": "Bordj Bou Arréridj",
  "برج": "Bordj Bou Arréridj",
  "بومرداس": "Boumerdès",
  "الطارف": "El Tarf",
  "طارف": "El Tarf",
  "تندوف": "Tindouf",
  "تيسمسيلت": "Tissemsilt",
  "الوادي": "El Oued",
  "وادي سوف": "El Oued",
  "خنشلة": "Khenchela",
  "سوق أهراس": "Souk Ahras",
  "سوق اهراس": "Souk Ahras",
  "تيبازة": "Tipaza",
  "ميلة": "Mila",
  "عين الدفلى": "Aïn Defla",
  "عين الدفله": "Aïn Defla",
  "النعامة": "Naâma",
  "نعامة": "Naâma",
  "عين تموشنت": "Aïn Témouchent",
  "غرداية": "Ghardaïa",
  "غليزان": "Relizane",
  "المغير": "El M'Ghair",
  "المنيعة": "El Meniaa",
  "أولاد جلال": "Ouled Djellal",
  "اولاد جلال": "Ouled Djellal",
  "برج باجي مختار": "Bordj Baji Mokhtar",
  "بني عباس": "Béni Abbès",
  "تيميمون": "Timimoun",
  "تقرت": "Touggourt",
  "جانت": "Djanet",
  "عين صالح": "In Salah",
  "عين قزام": "In Guezzam",
};

export function normalizeWilayaName(name: string): string | undefined {
  if (!name) return undefined;
  const clean = name.trim().toLowerCase();

  // Try direct alias match
  if (WILAYA_ALIASES[clean]) {
    return WILAYA_ALIASES[clean];
  }

  // Try case-insensitive lookup in WILAYAS list or by matching code
  const found = WILAYAS.find(
    (w) =>
      w.name.toLowerCase() === clean ||
      String(w.code) === clean ||
      w.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === clean
  );
  if (found) return found.name;

  // Try substring matching (e.g. if name is "wilaya of alger" or "الجزائر العاصمة")
  for (const [alias, official] of Object.entries(WILAYA_ALIASES)) {
    if (clean.includes(alias) || alias.includes(clean)) {
      return official;
    }
  }

  return undefined;
}

export const WILAYA_ARABIC_NAMES: Record<string, string> = {
  "Adrar": "أدرار",
  "Chlef": "الشلف",
  "Laghouat": "الأغواط",
  "Oum El Bouaghi": "أم البواقي",
  "Batna": "باتنة",
  "Béjaïa": "بجاية",
  "Biskra": "بسكرة",
  "Béchar": "بشار",
  "Blida": "البليدة",
  "Bouira": "البويرة",
  "Tamanrasset": "تمنراست",
  "Tébessa": "تبسة",
  "Tlemcen": "تلمسان",
  "Tiaret": "تيارت",
  "Tizi Ouzou": "تيزي وزو",
  "Alger": "الجزائر",
  "Djelfa": "الجلفة",
  "Jijel": "جيجل",
  "Sétif": "سطيف",
  "Saïda": "سعيدة",
  "Skikda": "سكيكدة",
  "Sidi Bel Abbès": "سيدي بلعباس",
  "Annaba": "عنابة",
  "Guelma": "قالمة",
  "Constantine": "قسنطينة",
  "Médéa": "المدية",
  "Mostaganem": "مستغانم",
  "M'Sila": "المسيلة",
  "Mascara": "معسكر",
  "Ouargla": "ورقلة",
  "Oran": "وهران",
  "El Bayadh": "البيض",
  "Illizi": "إليزي",
  "Bordj Bou Arréridj": "برج بوعريريج",
  "Boumerdès": "بومرداس",
  "El Tarf": "الطارف",
  "Tindouf": "تندوف",
  "Tissemsilt": "تيسمسيلت",
  "El Oued": "الوادي",
  "Khenchela": "خنشلة",
  "Souk Ahras": "سوق أهراس",
  "Tipaza": "تيبازة",
  "Mila": "ميلة",
  "Aïn Defla": "عين الدفلى",
  "Naâma": "النعامة",
  "Aïn Témouchent": "عين تموشنت",
  "Ghardaïa": "غرداية",
  "Relizane": "غليزان",
  "El M'Ghair": "المغير",
  "El Meniaa": "المنيعة",
  "Ouled Djellal": "أولاد جلال",
  "Bordj Baji Mokhtar": "برج باجي مختار",
  "Béni Abbès": "بني عباس",
  "Timimoun": "تيميمون",
  "Touggourt": "تقرت",
  "Djanet": "جانت",
  "In Salah": "عين صالح",
  "In Guezzam": "عين قزام",
};

export function getWilayaName(name: string | null | undefined, locale: string): string {
  if (!name) return "";
  const normalized = normalizeWilayaName(name) || name;
  if (locale === "ar" && WILAYA_ARABIC_NAMES[normalized]) {
    return WILAYA_ARABIC_NAMES[normalized];
  }
  return normalized;
}
