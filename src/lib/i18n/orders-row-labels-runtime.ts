import type { Locale } from "@/lib/i18n";

/**
 * Names of the two buttons at the end of every row of the orders list. They carry the order number so that a screen
 * reader can tell one row from the next. The WhatsApp name starts with the label that is already shown in the tooltip.
 */
export const ORDERS_ROW_LABELS_RUNTIME: Record<Locale, Record<string, string>> = {
  ar: {
    "orders.workspace.actionsFor": "إجراءات الطلب {{number}}",
    "orders.workspace.whatsappFor": "إرسال التأكيد عبر واتساب للطلب {{number}}",
  },
  fr: {
    "orders.workspace.actionsFor": "Actions pour la commande {{number}}",
    "orders.workspace.whatsappFor": "Envoyer la confirmation sur WhatsApp pour la commande {{number}}",
  },
  en: {
    "orders.workspace.actionsFor": "Actions for order {{number}}",
    "orders.workspace.whatsappFor": "Send WhatsApp confirmation for order {{number}}",
  },
};

export function getOrdersRowLabelsRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return ORDERS_ROW_LABELS_RUNTIME[locale]?.[key];
}
