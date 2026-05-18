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
export const WILAYA_NAMES = WILAYAS.map((w) => w.name).sort();

/** Zone-based default delivery prices (DA) */
export const ZONE_PRICES: Record<WilayaZone, { home: number; desk: number }> = {
  north: { home: 400, desk: 300 },
  east: { home: 500, desk: 380 },
  west: { home: 500, desk: 380 },
  center: { home: 400, desk: 300 },
  highPlateaux: { home: 600, desk: 450 },
  south: { home: 750, desk: 600 },
};
