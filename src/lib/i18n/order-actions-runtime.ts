import { interpolateTranslation, type Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for order-level seller actions (R3-b): delivery-slip
 * (bon de livraison) printing and WhatsApp deep-link confirmations.
 *
 * Both are daily COD rituals the product was missing entirely (audit d4:
 * "No bon de livraison / packing-slip printing", "ZERO wa.me links despite
 * being WhatsApp-first"). Keys ship here so they resolve immediately in
 * ar/fr/en; they are candidates for promotion into
 * src/lib/i18n/locales/*.json during the central locale pass.
 *
 * Reused static keys (NOT duplicated here): orders.orderNumber, orders.date,
 * orders.customer, orders.phone, orders.address, orders.wilaya, orders.commune,
 * orders.quantity, orders.total, orders.items, orders.notes,
 * orders.detail.subtotal, orders.detail.shipping, orders.detail.tracking,
 * products.variant.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "orders.slip.title": "Delivery slip",
    "orders.slip.print": "Print delivery slip",
    "orders.slip.printSelected": "Print slips",
    "orders.slip.item": "Item",
    "orders.slip.unitPrice": "Unit price",
    "orders.slip.codTotal": "Total to collect (COD)",
    "orders.slip.signature": "Customer signature",
    "orders.slip.courier": "Courier",
    "orders.slip.trackingNumber": "Tracking no.",
    "orders.slip.printFailed":
      "Could not load the order details for printing.",
    "orders.slip.partialLoad":
      "{{ok}} of {{total}} slips loaded — some orders could not be fetched.",
    "orders.whatsapp.action": "WhatsApp",
    "orders.whatsapp.confirm": "Send WhatsApp confirmation",
    "orders.templates.whatsappConfirm":
      "Hello {{name}}, we confirm your order {{number}} ({{total}}). Please reply to confirm.",
    "orders.templates.whatsappConfirmNoTotal":
      "Hello {{name}}, we confirm your order {{number}}. Please reply to confirm.",
    "orders.templates.whatsappGreeting":
      "Hello {{name}}, thank you for your trust. Feel free to message us about any of your orders.",
  },
  fr: {
    "orders.slip.title": "Bon de livraison",
    "orders.slip.print": "Imprimer le bon de livraison",
    "orders.slip.printSelected": "Imprimer les bons de livraison",
    "orders.slip.item": "Produit",
    "orders.slip.unitPrice": "Prix unitaire",
    "orders.slip.codTotal": "Total à encaisser (COD)",
    "orders.slip.signature": "Signature du client",
    "orders.slip.courier": "Transporteur",
    "orders.slip.trackingNumber": "N° de suivi",
    "orders.slip.printFailed":
      "Impossible de charger les détails de la commande pour l’impression.",
    "orders.slip.partialLoad":
      "{{ok}} bons sur {{total}} chargés — certaines commandes n’ont pas pu être récupérées.",
    "orders.whatsapp.action": "WhatsApp",
    "orders.whatsapp.confirm": "Envoyer la confirmation sur WhatsApp",
    "orders.templates.whatsappConfirm":
      "Bonjour {{name}}, nous confirmons votre commande {{number}} ({{total}}). Merci de répondre pour confirmer.",
    "orders.templates.whatsappConfirmNoTotal":
      "Bonjour {{name}}, nous confirmons votre commande {{number}}. Merci de répondre pour confirmer.",
    "orders.templates.whatsappGreeting":
      "Bonjour {{name}}, merci pour votre confiance. N’hésitez pas à nous écrire au sujet de vos commandes.",
  },
  ar: {
    "orders.slip.title": "وصل التسليم",
    "orders.slip.print": "طباعة وصل التسليم",
    "orders.slip.printSelected": "طباعة وصول التسليم",
    "orders.slip.item": "المنتج",
    "orders.slip.unitPrice": "سعر الوحدة",
    "orders.slip.codTotal": "المجموع المطلوب عند الاستلام",
    "orders.slip.signature": "توقيع الزبون",
    "orders.slip.courier": "شركة التوصيل",
    "orders.slip.trackingNumber": "رقم التتبع",
    "orders.slip.printFailed": "تعذّر تحميل بيانات الطلبيات للطباعة.",
    "orders.slip.partialLoad":
      "تم تحميل {{ok}} من {{total}} وصل — تعذّر جلب بعض الطلبيات.",
    "orders.whatsapp.action": "واتساب",
    "orders.whatsapp.confirm": "إرسال التأكيد عبر واتساب",
    "orders.templates.whatsappConfirm":
      "مرحباً {{name}}، نؤكد استلام طلبكم {{number}} ({{total}}). يرجى الرد للتأكيد.",
    "orders.templates.whatsappConfirmNoTotal":
      "مرحباً {{name}}، نؤكد استلام طلبكم {{number}}. يرجى الرد للتأكيد.",
    "orders.templates.whatsappGreeting":
      "مرحباً {{name}}، شكراً لثقتكم بنا. لا تترددوا في مراسلتنا بشأن طلباتكم.",
  },
};

export function getOrderActionsRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}

/** Strict-index-safe template lookup; a missing key renders as itself. */
function template(locale: Locale, key: string): string {
  return translations[locale][key] ?? key;
}

/** All keys owned by this dictionary (used by contract tests). */
export const ORDER_ACTIONS_RUNTIME_KEYS = Object.keys(
  translations.en,
) as readonly string[];

export interface OrderWhatsAppMessageInput {
  /** Customer display name; falls back to the neutral “customer” salutation. */
  name: string | null;
  /** Neutral customer label used when no name is available. */
  fallbackName: string;
  orderNumber?: string | null;
  /** Locale-formatted COD total (e.g. “3 600 DA”); omitted → no-total template. */
  totalLabel?: string | null;
}

/**
 * Compose the prefilled WhatsApp message WITHOUT the display-layer bidi
 * stabilization: invisible LRI/PDI marks would otherwise be URL-encoded into
 * the wa.me text and pasted into the customer’s chat. WhatsApp renders
 * mixed-direction runs natively.
 */
export function buildOrderWhatsAppMessage(
  locale: Locale,
  input: OrderWhatsAppMessageInput,
): string {
  const name = input.name?.trim() || input.fallbackName;
  if (input.orderNumber && input.totalLabel) {
    return interpolateTranslation(
      template(locale, "orders.templates.whatsappConfirm"),
      { name, number: input.orderNumber, total: input.totalLabel },
    );
  }
  if (input.orderNumber) {
    return interpolateTranslation(
      template(locale, "orders.templates.whatsappConfirmNoTotal"),
      { name, number: input.orderNumber },
    );
  }
  return interpolateTranslation(
    template(locale, "orders.templates.whatsappGreeting"),
    { name },
  );
}
