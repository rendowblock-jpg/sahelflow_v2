/**
 * CSV export helper — converts rows to a CSV string with proper escaping.
 * RFC 4180 compliant (quotes fields containing commas, quotes, or newlines).
 *
 * NOTE: column definitions export `i18nKey` (NOT translated labels). Callers
 * must pass the key through `t()` (from getI18n() on the server) to render
 * the localized header text in the resulting CSV.
 */
export interface ExportColumn<T> {
  /** Property name on the row object. */
  key: keyof T;
  /** i18n key for the column header (e.g. "export.orders.orderNumber"). */
  i18nKey: string;
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

/** Convert rows to a CSV string. Column labels must already be translated. */
export function toCsv<T>(rows: T[], columns: { key: keyof T; label: string; format?: (value: T[keyof T], row: T) => string }[]): string {
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

/**
 * Common export column definitions — callers translate the i18nKey via t()
 * before passing to toCsv(). Defined as i18n keys (NOT hardcoded labels) so
 * the resulting CSV respects the active locale.
 *
 * Usage:
 *   const { t } = await getI18n();
 *   const csv = toCsv(rows, ORDER_EXPORT_COLUMNS.map(c => ({ key: c.key, label: t(c.i18nKey) })));
 */
export const ORDER_EXPORT_COLUMNS: Array<{ key: string; i18nKey: string }> = [
  { key: "orderNumber", i18nKey: "export.orders.orderNumber" },
  { key: "status", i18nKey: "export.orders.status" },
  { key: "customerName", i18nKey: "export.orders.customer" },
  { key: "phone", i18nKey: "export.orders.phone" },
  { key: "wilaya", i18nKey: "export.orders.wilaya" },
  { key: "commune", i18nKey: "export.orders.commune" },
  { key: "totalPrice", i18nKey: "export.orders.total" },
  { key: "deliveryCost", i18nKey: "export.orders.deliveryCost" },
  { key: "source", i18nKey: "export.orders.source" },
  { key: "createdAt", i18nKey: "export.orders.date" },
];

export const CUSTOMER_EXPORT_COLUMNS: Array<{ key: string; i18nKey: string }> = [
  { key: "name", i18nKey: "export.customers.name" },
  { key: "phone", i18nKey: "export.customers.phone" },
  { key: "phone2", i18nKey: "export.customers.phone2" },
  { key: "wilaya", i18nKey: "export.customers.wilaya" },
  { key: "commune", i18nKey: "export.customers.commune" },
  { key: "address", i18nKey: "export.customers.address" },
  { key: "orderCount", i18nKey: "export.customers.orderCount" },
  { key: "totalSpent", i18nKey: "export.customers.totalSpent" },
];

export const PRODUCT_EXPORT_COLUMNS: Array<{ key: string; i18nKey: string }> = [
  { key: "name", i18nKey: "export.products.name" },
  { key: "sku", i18nKey: "export.products.sku" },
  { key: "price", i18nKey: "export.products.price" },
  { key: "cost", i18nKey: "export.products.cost" },
  { key: "stock", i18nKey: "export.products.stock" },
  { key: "category", i18nKey: "export.products.category" },
  { key: "isActive", i18nKey: "export.products.isActive" },
];
