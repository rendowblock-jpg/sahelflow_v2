/**
 * Import field configs — expected fields + aliases for auto-detecting column
 * mappings. Aliases cover French, English, and Arabic common column names.
 */

export interface FieldConfig {
  key: string;
  label: string;
  aliases: string[];
  required: boolean;
}

export const PRODUCT_FIELDS: FieldConfig[] = [
  { key: "name", label: "Nom du produit", aliases: ["nom", "produit", "product", "designation", "title"], required: true },
  { key: "sku", label: "SKU / Référence", aliases: ["ref", "reference", "code", "barcode", "ean"], required: false },
  { key: "price", label: "Prix (DA)", aliases: ["prix", "price", "montant", "amount", "cout"], required: true },
  { key: "cost", label: "Coût (DA)", aliases: ["cout_achat", "cost", "achat", "wholesale"], required: false },
  { key: "stock", label: "Stock", aliases: ["quantite", "qty", "quantity", "inventory"], required: false },
  { key: "category", label: "Catégorie", aliases: ["categorie", "category", "type"], required: false },
  { key: "lowStockThreshold", label: "Seuil stock bas", aliases: ["seuil", "min_stock", "reorder"], required: false },
];

export const CUSTOMER_FIELDS: FieldConfig[] = [
  { key: "name", label: "Nom du client", aliases: ["nom", "client", "customer", "name", "fullname", "client_name"], required: true },
  { key: "phone", label: "Téléphone", aliases: ["tel", "telephone", "phone", "mobile", "gsm", "numero"], required: true },
  { key: "phone2", label: "Téléphone 2", aliases: ["tel2", "phone2", "mobile2", "gsm2"], required: false },
  { key: "wilaya", label: "Wilaya", aliases: ["wilaya", "state", "province", "region"], required: false },
  { key: "commune", label: "Commune", aliases: ["commune", "city", "ville"], required: false },
  { key: "address", label: "Adresse", aliases: ["adresse", "address", "rue", "street"], required: false },
  { key: "notes", label: "Notes", aliases: ["note", "notes", "commentaire", "comment"], required: false },
];

/** Convert a string to a number, stripping non-digit chars (for prices, stock). */
export function parseNumber(value: string): number {
  const cleaned = value.replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Clean a phone number to 0XXXXXXXXX format. */
export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  // Strip leading country codes
  if (digits.startsWith("213")) digits = "0" + digits.slice(3);
  if (digits.startsWith("00")) digits = "0" + digits.slice(2);
  return digits;
}
