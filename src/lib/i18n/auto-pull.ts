import type { Locale } from "@/lib/i18n";

/**
 * Trilingual copy for the automatic courier and shop pull switches (INT-03).
 * The interval in the sentences (10 minutes) is RECONCILE_INTERVAL_MS in
 * src/lib/integrations/scheduled-reconcile.ts; a test checks the number is there.
 */
const EN = {
  saved: "Saved",
  failed: "Could not save the change. Try again.",
  retry: "Retry",
  loading: "Loading…",
  readOnly: "You can see this setting but not change it.",
  courier: {
    title: "Automatic courier tracking",
    description:
      "While SahelFlow is open, it asks your courier for the status of your open parcels every 10 minutes. When a parcel is delivered, refused or returned, the order, the cash expected and the stock follow on their own.",
    label: "Check parcels automatically",
    onHint: "On: parcel statuses update by themselves.",
    offHint: "Off: a parcel's status changes only when you press Sync on it.",
  },
  commerce: {
    title: "Automatic shop orders",
    description:
      "While SahelFlow is open, it fetches new orders from Shopify, WooCommerce and YouCan every 10 minutes, for the shops you have connected.",
    label: "Fetch orders automatically",
    onHint: "On: new shop orders arrive by themselves.",
    offHint: "Off: new shop orders arrive only when you press Sync now.",
  },
};

export type AutoPullCopy = typeof EN;

const FR: AutoPullCopy = {
  saved: "Enregistré",
  failed: "Impossible d'enregistrer la modification. Réessayez.",
  retry: "Réessayer",
  loading: "Chargement…",
  readOnly: "Vous pouvez voir ce réglage mais pas le modifier.",
  courier: {
    title: "Suivi automatique des transporteurs",
    description:
      "Tant que SahelFlow est ouvert, il demande à votre transporteur l'état de vos colis en cours toutes les 10 minutes. Quand un colis est livré, refusé ou retourné, la commande, l'argent attendu et le stock suivent d'eux-mêmes.",
    label: "Vérifier les colis automatiquement",
    onHint: "Activé : l'état des colis se met à jour tout seul.",
    offHint: "Désactivé : l'état d'un colis ne change que lorsque vous appuyez sur Synchroniser.",
  },
  commerce: {
    title: "Commandes de boutique automatiques",
    description:
      "Tant que SahelFlow est ouvert, il récupère les nouvelles commandes de Shopify, WooCommerce et YouCan toutes les 10 minutes, pour les boutiques que vous avez connectées.",
    label: "Récupérer les commandes automatiquement",
    onHint: "Activé : les nouvelles commandes de boutique arrivent toutes seules.",
    offHint: "Désactivé : les nouvelles commandes n'arrivent que lorsque vous appuyez sur Synchroniser maintenant.",
  },
};

const AR: AutoPullCopy = {
  saved: "تم الحفظ",
  failed: "تعذّر حفظ التغيير. حاول مجددًا.",
  retry: "إعادة المحاولة",
  loading: "جارٍ التحميل…",
  readOnly: "يمكنك رؤية هذا الإعداد لكن لا يمكنك تغييره.",
  courier: {
    title: "التتبّع التلقائي لشركات التوصيل",
    description:
      "ما دام SahelFlow مفتوحًا، يسأل شركة التوصيل كل 10 دقائق عن حالة طرودك الجارية. وعندما يُسلَّم الطرد أو يُرفض أو يُرجَع، تتبعه الطلبية والمبلغ المنتظر والمخزون تلقائيًا.",
    label: "تحقّق من الطرود تلقائيًا",
    onHint: "مفعّل: تتحدّث حالة الطرود من تلقاء نفسها.",
    offHint: "متوقف: لا تتغيّر حالة الطرد إلا عند الضغط على «مزامنة».",
  },
  commerce: {
    title: "طلبيات المتجر التلقائية",
    description:
      "ما دام SahelFlow مفتوحًا، يجلب الطلبيات الجديدة من Shopify وWooCommerce وYouCan كل 10 دقائق، للمتاجر التي ربطتها.",
    label: "اجلب الطلبيات تلقائيًا",
    onHint: "مفعّل: تصل طلبيات المتجر الجديدة من تلقاء نفسها.",
    offHint: "متوقف: لا تصل طلبيات المتجر الجديدة إلا عند الضغط على «مزامنة الآن».",
  },
};

const COPY: Record<Locale, AutoPullCopy> = { en: EN, fr: FR, ar: AR };

export function getAutoPullCopy(locale: Locale): AutoPullCopy {
  return COPY[locale] ?? COPY.en;
}
