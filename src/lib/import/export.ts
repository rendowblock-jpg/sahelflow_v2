/**
 * CSV export helper — converts rows to a CSV string with proper escaping.
 * RFC 4180 compliant (quotes fields containing commas, quotes, or newlines).
 */

export interface ExportColumn<T> {
  /** Property name on the row object. */
  key: keyof T;
  /** Column header in the CSV. */
  label: string;
  /** Optional formatter (e.g., format dates, numbers). */
  format?: (value: T[keyof T], row: T) => string;
}

/** Escape a CSV field value (quote if it contains commas/quotes/newlines). */
function escapeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Convert rows to a CSV string. */
export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map((c) => escapeField(c.label)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key];
        const formatted = col.format ? col.format(value, row) : String(value ?? "");
        return escapeField(formatted);
      })
      .join(","),
  );
  return [header, ...lines].join("\r\n");
}

/** Common export columns for orders, customers, products. */
export const ORDER_EXPORT_COLUMNS = [
  { key: "orderNumber", label: "N° Commande" },
  { key: "status", label: "Statut" },
  { key: "customerName", label: "Client" },
  { key: "phone", label: "Téléphone" },
  { key: "wilaya", label: "Wilaya" },
  { key: "commune", label: "Commune" },
  { key: "totalPrice", label: "Total (DA)" },
  { key: "deliveryCost", label: "Livraison (DA)" },
  { key: "source", label: "Source" },
  { key: "createdAt", label: "Date" },
] as const;

export const CUSTOMER_EXPORT_COLUMNS = [
  { key: "name", label: "Nom" },
  { key: "phone", label: "Téléphone" },
  { key: "phone2", label: "Téléphone 2" },
  { key: "wilaya", label: "Wilaya" },
  { key: "commune", label: "Commune" },
  { key: "address", label: "Adresse" },
  { key: "orderCount", label: "Nb Commandes" },
  { key: "totalSpent", label: "Total Dépensé (DA)" },
] as const;

export const PRODUCT_EXPORT_COLUMNS = [
  { key: "name", label: "Nom" },
  { key: "sku", label: "SKU" },
  { key: "price", label: "Prix (DA)" },
  { key: "cost", label: "Coût (DA)" },
  { key: "stock", label: "Stock" },
  { key: "category", label: "Catégorie" },
  { key: "isActive", label: "Actif" },
] as const;
