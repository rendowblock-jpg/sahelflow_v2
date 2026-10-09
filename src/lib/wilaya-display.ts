/**
 * Wilaya names in the interface language.
 *
 * Orders and customers keep the wilaya exactly as it was written (the seed's
 * French name, an Arabic spelling, or a code). Display maps that value onto
 * data/wilayas.json so an Arabic seller reads "الجزائر" and a French or
 * English seller reads "Alger", whichever way the record stored it. Values
 * that match no wilaya are shown unchanged.
 */
import wilayas from "../../data/wilayas.json";

interface WilayaRow {
  code: number;
  name: string;
  nameAr?: string;
}

function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/^ال/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

const BY_KEY = new Map<string, WilayaRow>();
for (const row of wilayas as WilayaRow[]) {
  BY_KEY.set(String(row.code), row);
  BY_KEY.set(String(row.code).padStart(2, "0"), row);
  BY_KEY.set(fold(row.name), row);
  if (row.nameAr) BY_KEY.set(fold(row.nameAr), row);
}

export function displayWilaya(
  value: string | null | undefined,
  locale: string,
): string {
  if (!value) return "";
  const row = BY_KEY.get(value.trim()) ?? BY_KEY.get(fold(value));
  if (!row) return value;
  return locale === "ar" ? row.nameAr || row.name : row.name;
}
