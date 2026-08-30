import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for the order-create form pickers (R2-c).
 *
 * The customer/product comboboxes are the highest-frequency data-entry surface
 * in the manual-order flow; their search, loading, empty, stock and
 * create-customer affordances ship here so they resolve immediately in
 * ar/fr/en. Keys are candidates for promotion into
 * src/lib/i18n/locales/*.json during the central locale pass.
 *
 * Reused static keys (NOT duplicated here): orders.form.selectCustomerPlaceholder,
 * orders.form.addProductPlaceholder, customers.searchPlaceholder.
 *
 * Plural agreement: stock counts expose explicit _zero/_one/_two/_few/_many/
 * _other variants for Arabic (audit d6 #5) and _one/_other for en/fr; the
 * shared useI18n resolver appends the Intl.PluralRules suffix automatically.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "orders.form.combobox.searching": "Searching…",
    "orders.form.combobox.searchFailed":
      "Search unavailable — showing matches from the loaded list only.",
    "orders.form.combobox.noCustomerMatch": "No customer found.",
    "orders.form.combobox.noProductMatch": "No product found.",
    "orders.form.combobox.createCustomer": "Create new customer “{{query}}”",
    "orders.form.combobox.searchProductPlaceholder": "Search by name or SKU...",
    "orders.form.combobox.allVariantsSelected": "All variants already added",
    "orders.form.combobox.stockIn": "{{count}} in stock",
    "orders.form.combobox.stockIn_one": "{{count}} in stock",
    "orders.form.combobox.stockIn_other": "{{count}} in stock",
    "orders.form.combobox.stockLow": "Low stock: {{count}}",
    "orders.form.combobox.stockLow_one": "Low stock: {{count}}",
    "orders.form.combobox.stockLow_other": "Low stock: {{count}}",
    "orders.form.combobox.stockOut": "Out of stock",
  },
  fr: {
    "orders.form.combobox.searching": "Recherche…",
    "orders.form.combobox.searchFailed":
      "Recherche indisponible — seuls les résultats de la liste chargée sont affichés.",
    "orders.form.combobox.noCustomerMatch": "Aucun client trouvé.",
    "orders.form.combobox.noProductMatch": "Aucun produit trouvé.",
    "orders.form.combobox.createCustomer": "Créer le nouveau client « {{query}} »",
    "orders.form.combobox.searchProductPlaceholder": "Rechercher par nom ou SKU...",
    "orders.form.combobox.allVariantsSelected": "Toutes les variantes sont déjà ajoutées",
    "orders.form.combobox.stockIn": "{{count}} en stock",
    "orders.form.combobox.stockIn_one": "{{count}} en stock",
    "orders.form.combobox.stockIn_other": "{{count}} en stock",
    "orders.form.combobox.stockLow": "Stock faible : {{count}}",
    "orders.form.combobox.stockLow_one": "Stock faible : {{count}}",
    "orders.form.combobox.stockLow_other": "Stock faible : {{count}}",
    "orders.form.combobox.stockOut": "Rupture de stock",
  },
  ar: {
    "orders.form.combobox.searching": "جارٍ البحث…",
    "orders.form.combobox.searchFailed":
      "البحث غير متاح — تُعرض المطابقات من القائمة المحمّلة فقط.",
    "orders.form.combobox.noCustomerMatch": "لا يوجد عميل مطابق.",
    "orders.form.combobox.noProductMatch": "لا يوجد منتج مطابق.",
    "orders.form.combobox.createCustomer": "إنشاء عميل جديد «{{query}}»",
    "orders.form.combobox.searchProductPlaceholder": "ابحث بالاسم أو رمز SKU…",
    "orders.form.combobox.allVariantsSelected": "تمت إضافة كل الخيارات",
    "orders.form.combobox.stockIn": "{{count}} في المخزون",
    "orders.form.combobox.stockIn_zero": "لا مخزون",
    "orders.form.combobox.stockIn_one": "واحد في المخزون",
    "orders.form.combobox.stockIn_two": "اثنان في المخزون",
    "orders.form.combobox.stockIn_few": "{{count}} في المخزون",
    "orders.form.combobox.stockIn_many": "{{count}} في المخزون",
    "orders.form.combobox.stockIn_other": "{{count}} في المخزون",
    "orders.form.combobox.stockLow": "مخزون منخفض: {{count}}",
    "orders.form.combobox.stockLow_one": "متبقٍ قطعة واحدة",
    "orders.form.combobox.stockLow_two": "متبقٍ قطعتان",
    "orders.form.combobox.stockLow_few": "مخزون منخفض: {{count}}",
    "orders.form.combobox.stockLow_many": "مخزون منخفض: {{count}}",
    "orders.form.combobox.stockLow_other": "مخزون منخفض: {{count}}",
    "orders.form.combobox.stockOut": "نفد المخزون",
  },
};

export function getOrderFormRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
