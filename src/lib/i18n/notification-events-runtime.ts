import type { Locale } from "@/lib/i18n";

/**
 * Words of the in-app notification centre (W3-G1): one title and one sentence
 * per kind, with plural forms for the kinds that show a live number. The shared
 * translator looks up `${key}_${Intl.PluralRules(locale).select(count)}` first,
 * then the bare key (used when no number is known). Arabic uses all six forms.
 * Arabic and French are DRAFTS until the Founder's native read.
 */
interface Forms {
  title: string;
  /** no number known */
  generic: string;
  one?: string;
  other?: string;
  zero?: string;
  two?: string;
  few?: string;
  many?: string;
}

type Dict = Record<string, string>;

function add(out: Dict, kind: string, f: Forms, arabic: boolean): void {
  const base = `notifications.events.${kind}`;
  out[`${base}.title`] = f.title;
  out[`${base}.body`] = f.generic;
  if (f.other === undefined) return;
  out[`${base}.body_one`] = f.one ?? f.generic;
  out[`${base}.body_other`] = f.other;
  if (arabic) {
    out[`${base}.body_zero`] = f.zero ?? f.generic;
    out[`${base}.body_two`] = f.two ?? f.other;
    out[`${base}.body_few`] = f.few ?? f.other;
    out[`${base}.body_many`] = f.many ?? f.other;
  }
}

function build(arabic: boolean, kinds: Record<string, Forms>, extra: Dict): Dict {
  const out: Dict = { ...extra };
  for (const [kind, forms] of Object.entries(kinds)) add(out, kind, forms, arabic);
  return out;
}

const en = build(false, {
  "order.new": { title: "New orders", generic: "New orders came in.", one: "A new order came in.", other: "{{count}} new orders came in." },
  "orders.toConfirm": { title: "Orders to confirm", generic: "Some orders are waiting to be confirmed.", one: "You have 1 order to confirm.", other: "You have {{count}} orders to confirm." },
  "delivery.failed": { title: "Delivery problem", generic: "A delivery could not be completed. Open SahelFlow to see which.", other: "{{count}} deliveries could not be completed. Open SahelFlow to see which." },
  "whatsapp.received": { title: "WhatsApp messages", generic: "New WhatsApp messages came in.", one: "You have 1 new WhatsApp message.", other: "You have {{count}} new WhatsApp messages." },
  "whatsapp.held": { title: "Message waiting for your OK", generic: "A WhatsApp message is waiting for your OK.", other: "{{count}} WhatsApp messages are waiting for your OK." },
  "backup.failed": { title: "Backup did not finish", generic: "Your last backup did not finish. Your data is still on this PC, but not copied. Open SahelFlow to try again." },
  "licence.ending": { title: "Access ending", generic: "Your access to SahelFlow has ended. Open Settings to renew.", one: "Your access to SahelFlow ends tomorrow.", other: "Your access to SahelFlow ends in {{count}} days." },
  "update.available": { title: "Update available", generic: "A new version of SahelFlow is ready." },
  "ai.quota": { title: "AI helper resting", generic: "The AI helper is resting for a while (free limit reached). Everything else works." },
  digest: { title: "While alerts were paused", generic: "Alerts came in while they were paused.", one: "1 alert came in while alerts were paused.", other: "{{count}} alerts came in while alerts were paused." },
}, {
  "notifications.phoneAlerts.title": "Phone alerts",
  "notifications.phoneAlerts.note": "Alerts only come while SahelFlow is open on your PC.",
  "notifications.phoneAlerts.empty": "No phone is linked yet.",
  "notifications.phoneAlerts.error": "We could not load your phone alerts.",
  "notifications.phoneAlerts.errorKeptData": "We could not refresh. Showing what we had.",
  "notifications.phoneAlerts.retry": "Try again",
  "notifications.phoneAlerts.stale": "Your PC has not been online since {{time}}. Alerts resume when it is on.",
  "notifications.phoneAlerts.loading": "Loading phone alerts",
  "notifications.phoneAlerts.phones_one": "1 phone linked",
  "notifications.phoneAlerts.phones_other": "{{count}} phones linked",
  "notifications.phoneAlerts.on": "On",
  "notifications.phoneAlerts.off": "Off",
});

const fr = build(false, {
  "order.new": { title: "Nouvelles commandes", generic: "De nouvelles commandes sont arrivées.", one: "Une nouvelle commande est arrivée.", other: "{{count}} nouvelles commandes sont arrivées." },
  "orders.toConfirm": { title: "Commandes à confirmer", generic: "Des commandes attendent votre confirmation.", one: "Vous avez 1 commande à confirmer.", other: "Vous avez {{count}} commandes à confirmer." },
  "delivery.failed": { title: "Problème de livraison", generic: "Une livraison n’a pas pu aboutir. Ouvrez SahelFlow pour voir laquelle.", other: "{{count}} livraisons n’ont pas pu aboutir. Ouvrez SahelFlow pour voir lesquelles." },
  "whatsapp.received": { title: "Messages WhatsApp", generic: "De nouveaux messages WhatsApp sont arrivés.", one: "Vous avez 1 nouveau message WhatsApp.", other: "Vous avez {{count}} nouveaux messages WhatsApp." },
  "whatsapp.held": { title: "Message en attente de votre accord", generic: "Un message WhatsApp attend votre accord.", other: "{{count}} messages WhatsApp attendent votre accord." },
  "backup.failed": { title: "La sauvegarde n’a pas abouti", generic: "Votre dernière sauvegarde n’a pas abouti. Vos données sont toujours sur ce PC, mais pas copiées. Ouvrez SahelFlow pour réessayer." },
  "licence.ending": { title: "Accès bientôt terminé", generic: "Votre accès à SahelFlow est terminé. Ouvrez les réglages pour le renouveler.", one: "Votre accès à SahelFlow se termine demain.", other: "Votre accès à SahelFlow se termine dans {{count}} jours." },
  "update.available": { title: "Mise à jour disponible", generic: "Une nouvelle version de SahelFlow est prête." },
  "ai.quota": { title: "L’assistant IA se repose", generic: "L’assistant IA se repose un moment (limite gratuite atteinte). Tout le reste fonctionne." },
  digest: { title: "Pendant la pause des alertes", generic: "Des alertes sont arrivées pendant la pause.", one: "1 alerte est arrivée pendant la pause des alertes.", other: "{{count}} alertes sont arrivées pendant la pause des alertes." },
}, {
  "notifications.phoneAlerts.title": "Alertes sur le téléphone",
  "notifications.phoneAlerts.note": "Les alertes n’arrivent que lorsque SahelFlow est ouvert sur votre PC.",
  "notifications.phoneAlerts.empty": "Aucun téléphone n’est encore lié.",
  "notifications.phoneAlerts.error": "Impossible de charger vos alertes sur le téléphone.",
  "notifications.phoneAlerts.errorKeptData": "Actualisation impossible. Voici ce que nous avions.",
  "notifications.phoneAlerts.retry": "Réessayer",
  "notifications.phoneAlerts.stale": "Votre PC n’est pas en ligne depuis {{time}}. Les alertes reprendront quand il le sera.",
  "notifications.phoneAlerts.loading": "Chargement des alertes du téléphone",
  "notifications.phoneAlerts.phones_one": "1 téléphone lié",
  "notifications.phoneAlerts.phones_other": "{{count}} téléphones liés",
  "notifications.phoneAlerts.on": "Activées",
  "notifications.phoneAlerts.off": "Désactivées",
});

const ar = build(true, {
  "order.new": { title: "طلبات جديدة", generic: "وصلت طلبات جديدة.", zero: "لا توجد طلبات جديدة.", one: "وصل طلب جديد.", two: "وصل طلبان جديدان.", few: "وصلت {{count}} طلبات جديدة.", many: "وصل {{count}} طلبًا جديدًا.", other: "وصل {{count}} طلب جديد." },
  "orders.toConfirm": { title: "طلبات تنتظر التأكيد", generic: "هناك طلبات تنتظر تأكيدك.", zero: "لا توجد طلبات تنتظر التأكيد.", one: "لديك طلب واحد ينتظر التأكيد.", two: "لديك طلبان ينتظران التأكيد.", few: "لديك {{count}} طلبات تنتظر التأكيد.", many: "لديك {{count}} طلبًا ينتظر التأكيد.", other: "لديك {{count}} طلب ينتظر التأكيد." },
  "delivery.failed": { title: "مشكلة في التوصيل", generic: "تعذّر إتمام توصيل. افتح SahelFlow لمعرفة أيّها.", zero: "لا توجد توصيلات متعثرة.", two: "تعذّر إتمام توصيلين. افتح SahelFlow لمعرفة أيّهما.", few: "تعذّر إتمام {{count}} توصيلات. افتح SahelFlow لمعرفة أيّها.", many: "تعذّر إتمام {{count}} توصيلًا. افتح SahelFlow لمعرفة أيّها.", other: "تعذّر إتمام {{count}} توصيل. افتح SahelFlow لمعرفة أيّها." },
  "whatsapp.received": { title: "رسائل واتساب", generic: "وصلت رسائل واتساب جديدة.", zero: "لا توجد رسائل جديدة.", one: "لديك رسالة واتساب جديدة.", two: "لديك رسالتان جديدتان على واتساب.", few: "لديك {{count}} رسائل جديدة على واتساب.", many: "لديك {{count}} رسالة جديدة على واتساب.", other: "لديك {{count}} رسالة جديدة على واتساب." },
  "whatsapp.held": { title: "رسالة تنتظر موافقتك", generic: "رسالة واتساب تنتظر موافقتك.", zero: "لا توجد رسائل تنتظر موافقتك.", two: "رسالتان على واتساب تنتظران موافقتك.", few: "{{count}} رسائل على واتساب تنتظر موافقتك.", many: "{{count}} رسالة على واتساب تنتظر موافقتك.", other: "{{count}} رسالة على واتساب تنتظر موافقتك." },
  "backup.failed": { title: "لم تكتمل النسخة الاحتياطية", generic: "لم تكتمل آخر نسخة احتياطية. بياناتك ما زالت على هذا الحاسوب لكنها غير منسوخة. افتح SahelFlow وأعد المحاولة." },
  "licence.ending": { title: "اقتراب انتهاء الاشتراك", generic: "انتهى وصولك إلى SahelFlow. افتح الإعدادات لتجديده.", one: "ينتهي وصولك إلى SahelFlow غدًا.", two: "ينتهي وصولك إلى SahelFlow بعد يومين.", few: "ينتهي وصولك إلى SahelFlow بعد {{count}} أيام.", many: "ينتهي وصولك إلى SahelFlow بعد {{count}} يومًا.", other: "ينتهي وصولك إلى SahelFlow بعد {{count}} يوم." },
  "update.available": { title: "تحديث متاح", generic: "إصدار جديد من SahelFlow جاهز." },
  "ai.quota": { title: "مساعد الذكاء الاصطناعي في استراحة", generic: "مساعد الذكاء الاصطناعي في استراحة قصيرة (بلغتَ الحد المجاني). كل ما عداه يعمل." },
  digest: { title: "أثناء إيقاف التنبيهات مؤقتًا", generic: "وصلت تنبيهات أثناء إيقافها مؤقتًا.", zero: "لم تصل تنبيهات.", one: "وصل تنبيه واحد أثناء إيقاف التنبيهات مؤقتًا.", two: "وصل تنبيهان أثناء إيقاف التنبيهات مؤقتًا.", few: "وصلت {{count}} تنبيهات أثناء إيقاف التنبيهات مؤقتًا.", many: "وصل {{count}} تنبيهًا أثناء إيقاف التنبيهات مؤقتًا.", other: "وصل {{count}} تنبيه أثناء إيقاف التنبيهات مؤقتًا." },
}, {
  "notifications.phoneAlerts.title": "تنبيهات الهاتف",
  "notifications.phoneAlerts.note": "التنبيهات تصلك فقط ما دام SahelFlow مفتوحًا على حاسوبك.",
  "notifications.phoneAlerts.empty": "لم يُربط أي هاتف بعد.",
  "notifications.phoneAlerts.error": "تعذّر تحميل تنبيهات هاتفك.",
  "notifications.phoneAlerts.errorKeptData": "تعذّر التحديث. نعرض ما كان لدينا.",
  "notifications.phoneAlerts.retry": "حاول مرة أخرى",
  "notifications.phoneAlerts.stale": "حاسوبك غير متصل منذ {{time}}. ستعود التنبيهات حين يتصل.",
  "notifications.phoneAlerts.loading": "جارٍ تحميل تنبيهات الهاتف",
  "notifications.phoneAlerts.phones_zero": "لا هاتف مرتبط",
  "notifications.phoneAlerts.phones_one": "هاتف واحد مرتبط",
  "notifications.phoneAlerts.phones_two": "هاتفان مرتبطان",
  "notifications.phoneAlerts.phones_few": "{{count}} هواتف مرتبطة",
  "notifications.phoneAlerts.phones_many": "{{count}} هاتفًا مرتبطًا",
  "notifications.phoneAlerts.phones_other": "{{count}} هاتف مرتبط",
  "notifications.phoneAlerts.on": "مفعّلة",
  "notifications.phoneAlerts.off": "متوقفة",
});

const translations: Record<Locale, Dict> = { en, fr, ar };

export function getNotificationEventsRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale][key];
}

export const NOTIFICATION_EVENTS_CATALOG: Readonly<Record<Locale, Readonly<Dict>>> = translations;
