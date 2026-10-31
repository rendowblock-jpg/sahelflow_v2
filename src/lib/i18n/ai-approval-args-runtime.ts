import type { Locale } from "@/lib/i18n";

/**
 * Runtime copy for the AI approval card's "exact order details" block: the
 * labelled rows a seller reads before approving create_order. {{stored}} is the
 * total saved with the proposal when it differs from the sum of the items.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "ai.approvalArgs.title": "Exact order details you are approving",
    "ai.approvalArgs.customer": "Customer",
    "ai.approvalArgs.phone": "Phone",
    "ai.approvalArgs.wilayaCommune": "Wilaya / commune",
    "ai.approvalArgs.address": "Address",
    "ai.approvalArgs.notes": "Notes",
    "ai.approvalArgs.items": "Items",
    "ai.approvalArgs.quantity": "Quantity",
    "ai.approvalArgs.unitPrice": "Unit price",
    "ai.approvalArgs.lineTotal": "Line total",
    "ai.approvalArgs.total": "Total (added up from the items)",
    "ai.approvalArgs.totalMismatch": "The total saved with this proposal ({{stored}}) does not match the items. Check the lines before you approve.",
  },
  fr: {
    "ai.approvalArgs.title": "Détails exacts de la commande que vous approuvez",
    "ai.approvalArgs.customer": "Client",
    "ai.approvalArgs.phone": "Téléphone",
    "ai.approvalArgs.wilayaCommune": "Wilaya / commune",
    "ai.approvalArgs.address": "Adresse",
    "ai.approvalArgs.notes": "Notes",
    "ai.approvalArgs.items": "Articles",
    "ai.approvalArgs.quantity": "Quantité",
    "ai.approvalArgs.unitPrice": "Prix unitaire",
    "ai.approvalArgs.lineTotal": "Total de la ligne",
    "ai.approvalArgs.total": "Total (additionné d’après les articles)",
    "ai.approvalArgs.totalMismatch": "Le total enregistré avec cette proposition ({{stored}}) ne correspond pas aux articles. Vérifiez les lignes avant d’approuver.",
  },
  ar: {
    "ai.approvalArgs.title": "تفاصيل الطلب بالضبط التي توافق عليها",
    "ai.approvalArgs.customer": "العميل",
    "ai.approvalArgs.phone": "الهاتف",
    "ai.approvalArgs.wilayaCommune": "الولاية / البلدية",
    "ai.approvalArgs.address": "العنوان",
    "ai.approvalArgs.notes": "ملاحظات",
    "ai.approvalArgs.items": "المنتجات",
    "ai.approvalArgs.quantity": "الكمية",
    "ai.approvalArgs.unitPrice": "سعر الوحدة",
    "ai.approvalArgs.lineTotal": "مجموع السطر",
    "ai.approvalArgs.total": "المجموع (محسوب من المنتجات)",
    "ai.approvalArgs.totalMismatch": "المجموع المحفوظ مع هذا الاقتراح ({{stored}}) لا يطابق المنتجات. راجع السطور قبل الموافقة.",
  },
};

export function getAiApprovalArgsRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale][key];
}
