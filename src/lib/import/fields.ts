/**
 * Import field configs — expected fields + aliases for auto-detecting column
 * mappings. Aliases cover French, English, and Arabic common column names.
 *
 * Each field's `i18nKey` references a key in src/lib/i18n/locales/*.json so
 * any future UI that surfaces these labels respects the active locale.
 */

export interface FieldConfig {
  key: string;
  /** i18n key for the field label (e.g. "import.field.productName"). */
  i18nKey: string;
  aliases: string[];
  required: boolean;
}

export const PRODUCT_FIELDS: FieldConfig[] = [
  { key: "name", i18nKey: "products.name", aliases: ["nom", "produit", "product", "designation", "title"], required: true },
  { key: "sku", i18nKey: "products.sku", aliases: ["ref", "reference", "code", "barcode", "ean"], required: false },
  { key: "price", i18nKey: "products.price", aliases: ["prix", "price", "montant", "amount", "cout"], required: true },
  { key: "cost", i18nKey: "products.cost", aliases: ["cout_achat", "cost", "achat", "wholesale"], required: false },
  { key: "stock", i18nKey: "products.stock", aliases: ["quantite", "qty", "quantity", "inventory"], required: false },
  { key: "category", i18nKey: "products.category", aliases: ["categorie", "category", "type"], required: false },
  { key: "lowStockThreshold", i18nKey: "products.lowStockThreshold", aliases: ["seuil", "min_stock", "reorder"], required: false },
];

export const CUSTOMER_FIELDS: FieldConfig[] = [
  { key: "name", i18nKey: "customers.name", aliases: ["nom", "client", "customer", "name", "fullname", "client_name"], required: true },
  { key: "phone", i18nKey: "customers.phone", aliases: ["tel", "telephone", "phone", "mobile", "gsm", "numero"], required: true },
  { key: "phone2", i18nKey: "customers.phone2", aliases: ["tel2", "phone2", "mobile2", "gsm2"], required: false },
  { key: "wilaya", i18nKey: "customers.wilaya", aliases: ["wilaya", "state", "province", "region"], required: false },
  { key: "commune", i18nKey: "customers.commune", aliases: ["commune", "city", "ville"], required: false },
  { key: "address", i18nKey: "customers.address", aliases: ["adresse", "address", "rue", "street"], required: false },
  { key: "notes", i18nKey: "customers.notes", aliases: ["note", "notes", "commentaire", "comment"], required: false },
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
