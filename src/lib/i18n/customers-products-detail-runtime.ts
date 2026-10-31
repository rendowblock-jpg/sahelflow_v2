import type { Locale } from "@/lib/i18n";

/** Offline copy for the customer and product pages (detail and lists). Same keys in ar, fr and en. */
const translations: Record<Locale, Record<string, string>> = {
  ar: {
    "cpDetail.offline.customerBanner": "التفاصيل المحفوظة تبقى مقروءة. حظر العميل ورفع الحظر متوقفان إلى أن يعود الاتصال.",
    "cpDetail.offline.productBanner": "التفاصيل المحفوظة تبقى مقروءة. تعديل المنتج وسعره ومخزونه وصورته وحذفه متوقف إلى أن يعود الاتصال.",
    "cpDetail.offline.listBanner": "الصفوف المحفوظة تبقى مقروءة. الإضافة والتعديل والحذف متوقفة إلى أن يعود الاتصال.",
  },
  fr: {
    "cpDetail.offline.customerBanner":
      "Les détails enregistrés restent lisibles. Bloquer et débloquer le client sont en pause jusqu'au retour de la connexion.",
    "cpDetail.offline.productBanner":
      "Les détails enregistrés restent lisibles. Modifier le produit, son prix, son stock, son image et le supprimer sont en pause jusqu'au retour de la connexion.",
    "cpDetail.offline.listBanner":
      "Les lignes enregistrées restent lisibles. Ajouter, modifier et supprimer sont en pause jusqu'au retour de la connexion.",
  },
  en: {
    "cpDetail.offline.customerBanner": "Saved details stay readable. Blocking and unblocking the customer are paused until you are back online.",
    "cpDetail.offline.productBanner":
      "Saved details stay readable. Editing the product, its price, stock and image, and deleting it, are paused until you are back online.",
    "cpDetail.offline.listBanner": "Saved rows stay readable. Adding, editing and deleting are paused until you are back online.",
  },
};

export const CUSTOMERS_PRODUCTS_DETAIL_RUNTIME_KEYS: readonly string[] = Object.keys(translations.en);

export function getCustomersProductsDetailRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale]?.[key];
}
