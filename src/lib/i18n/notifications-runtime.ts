import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for the notification-center typed taxonomy.
 *
 * The static locale JSON catalog is sequenced centrally; these keys ship in the
 * runtime resolver so the typed taxonomy and its accessible labels resolve in
 * ar/fr/en immediately. Keys are candidates for promotion into
 * src/lib/i18n/locales/*.json during the central locale pass.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "notifications.type.order": "Order",
    "notifications.type.delivery": "Delivery",
    "notifications.type.stock": "Stock",
    "notifications.type.return": "Return",
    "notifications.type.alert": "Alert",
    "notifications.type.info": "System",
  },
  fr: {
    "notifications.type.order": "Commande",
    "notifications.type.delivery": "Livraison",
    "notifications.type.stock": "Stock",
    "notifications.type.return": "Retour",
    "notifications.type.alert": "Alerte",
    "notifications.type.info": "Système",
  },
  ar: {
    "notifications.type.order": "طلب",
    "notifications.type.delivery": "توصيل",
    "notifications.type.stock": "المخزون",
    "notifications.type.return": "إرجاع",
    "notifications.type.alert": "تنبيه",
    "notifications.type.info": "النظام",
  },
};

export function getNotificationsRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
