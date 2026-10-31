import type { Locale } from "@/lib/i18n";

/**
 * Words for the hosted store's legal pages (terms, returns, privacy) and for the Studio's Legal panel.
 * The texts are TEMPLATES built from what the seller writes; they are DRAFT until a native reader has read them, and nothing here
 * claims legal validity. The Worker's message table (messages.generated.json) is built from the `storefront.legal.*` and
 * `storefront.public.legalNotFound*` keys by scripts/storefront-public-build.ts; a key missing in one language fails that build.
 */
type Row = Readonly<{ en: string; fr: string; ar: string }>;

const ROWS: Record<string, Row> = {
  // Footer and order line
  "storefront.legal.nav.label": { en: "Store policies", fr: "Politiques de la boutique", ar: "سياسات المتجر" },
  "storefront.legal.link.terms": { en: "Terms", fr: "Conditions", ar: "الشروط" },
  "storefront.legal.link.returns": { en: "Returns", fr: "Retours", ar: "الإرجاع" },
  "storefront.legal.link.privacy": { en: "Privacy", fr: "Données personnelles", ar: "الخصوصية" },
  "storefront.legal.orderLine": { en: "By ordering you accept:", fr: "En commandant, vous acceptez :", ar: "بطلبك فإنك توافق على:" },
  // Titles
  "storefront.legal.terms.title": { en: "Terms of sale", fr: "Conditions de vente", ar: "شروط البيع" },
  "storefront.legal.returns.title": { en: "Returns policy", fr: "Politique de retour", ar: "سياسة الإرجاع" },
  "storefront.legal.privacy.title": { en: "Privacy", fr: "Données personnelles", ar: "الخصوصية" },
  // Terms
  "storefront.legal.terms.seller": { en: "This store is run by {name}.", fr: "Cette boutique est tenue par {name}.", ar: "يدير هذا المتجر {name}." },
  "storefront.legal.terms.register": { en: "Commercial register or tax number: {number}", fr: "Registre de commerce ou numéro fiscal : {number}", ar: "السجل التجاري أو الرقم الجبائي: {number}" },
  "storefront.legal.terms.platform": { en: "This page is provided by SahelFlow.", fr: "Cette page est fournie par SahelFlow.", ar: "هذه الصفحة مقدَّمة من SahelFlow." },
  "storefront.legal.terms.cod": { en: "You pay the seller in cash when your order is delivered.", fr: "Vous payez le vendeur en espèces à la livraison de votre commande.", ar: "تدفع للبائع نقدًا عند تسليم طلبك." },
  "storefront.legal.terms.delivery": { en: "The seller delivers your order through the delivery company the seller chose.", fr: "Le vendeur livre votre commande par la société de livraison qu’il a choisie.", ar: "يوصّل البائع طلبك عبر شركة التوصيل التي اختارها." },
  "storefront.legal.terms.confirm": { en: "The seller may phone you to confirm the order.", fr: "Le vendeur peut vous appeler pour confirmer la commande.", ar: "قد يتصل بك البائع لتأكيد الطلب." },
  "storefront.legal.terms.extraHeading": { en: "More terms from the seller", fr: "Autres conditions du vendeur", ar: "شروط أخرى من البائع" },
  // Returns
  "storefront.legal.returns.period": { en: "Return period after delivery, in days: {days}.", fr: "Délai de retour après la livraison, en jours : {days}.", ar: "مدة الإرجاع بعد التسليم، بالأيام: {days}." },
  "storefront.legal.returns.none": { en: "This store does not accept returns.", fr: "Cette boutique n’accepte pas les retours.", ar: "هذا المتجر لا يقبل الإرجاع." },
  "storefront.legal.returns.shipping.seller": { en: "The seller pays the shipping for a return.", fr: "Le vendeur paie l’expédition d’un retour.", ar: "يتحمل البائع تكلفة شحن المنتج المُرجَع." },
  "storefront.legal.returns.shipping.buyer": { en: "You pay the shipping for a return.", fr: "Vous payez l’expédition d’un retour.", ar: "يتحمل المشتري تكلفة شحن المنتج المُرجَع." },
  "storefront.legal.returns.shipping.none": { en: "The seller has not said who pays the shipping for a return. Ask the seller before you send anything back.", fr: "Le vendeur n’a pas précisé qui paie l’expédition d’un retour. Demandez-lui avant de renvoyer quoi que ce soit.", ar: "لم يحدد البائع من يتحمل تكلفة شحن المنتج المُرجَع. اسأله قبل أن ترسل أي شيء." },
  "storefront.legal.returns.how": { en: "To return a product, contact the seller first.", fr: "Pour retourner un produit, contactez d’abord le vendeur.", ar: "لإرجاع منتج، تواصل مع البائع أولًا." },
  "storefront.legal.returns.extraHeading": { en: "More about returns from the seller", fr: "Précisions du vendeur sur les retours", ar: "تفاصيل أخرى من البائع عن الإرجاع" },
  // Privacy
  "storefront.legal.privacy.collects": { en: "The order form asks for your name, phone number, wilaya, commune, address and an optional note.", fr: "Le formulaire de commande demande votre nom, votre numéro de téléphone, votre wilaya, votre commune, votre adresse et une note facultative.", ar: "يطلب نموذج الطلب اسمك ورقم هاتفك وولايتك وبلديتك وعنوانك وملاحظة اختيارية." },
  "storefront.legal.privacy.seller": { en: "This information goes to the seller, {name}, to prepare and deliver your order.", fr: "Ces informations sont transmises au vendeur, {name}, pour préparer et livrer votre commande.", ar: "تصل هذه المعلومات إلى البائع {name} لتجهيز طلبك وتوصيله." },
  "storefront.legal.privacy.courier": { en: "The seller gives it to the delivery company that delivers your order.", fr: "Le vendeur les transmet à la société de livraison qui livre votre commande.", ar: "يسلّمها البائع إلى شركة التوصيل التي توصّل طلبك." },
  "storefront.legal.privacy.platform": { en: "SahelFlow hosts the order form. SahelFlow does not sell this information.", fr: "SahelFlow héberge le formulaire de commande. SahelFlow ne vend pas ces informations.", ar: "تستضيف SahelFlow نموذج الطلب. ولا تبيع SahelFlow هذه المعلومات." },
  "storefront.legal.privacy.delete": { en: "To ask the seller to delete your information, use the contact details below.", fr: "Pour demander au vendeur de supprimer vos informations, utilisez les coordonnées ci-dessous.", ar: "لطلب حذف معلوماتك من البائع، استخدم بيانات الاتصال أدناه." },
  // Contact block
  "storefront.legal.contact.heading": { en: "Contact the seller", fr: "Contacter le vendeur", ar: "تواصل مع البائع" },
  "storefront.legal.contact.phone": { en: "Phone: {value}", fr: "Téléphone : {value}", ar: "الهاتف: {value}" },
  "storefront.legal.contact.whatsapp": { en: "WhatsApp: {value}", fr: "WhatsApp : {value}", ar: "واتساب: {value}" },
  "storefront.legal.contact.none": { en: "The seller has not published a phone number yet.", fr: "Le vendeur n’a pas encore publié de numéro de téléphone.", ar: "لم ينشر البائع رقم هاتف بعد." },
  // Calm page for a store that has no legal pages (every release published before them)
  "storefront.public.legalNotFoundTitle": { en: "This page is not available", fr: "Cette page n’est pas disponible", ar: "هذه الصفحة غير متوفرة" },
  "storefront.public.legalNotFoundBody": { en: "This store has not published its policies yet. The rest of the shop is still open.", fr: "Cette boutique n’a pas encore publié ses politiques. Le reste de la boutique est toujours ouvert.", ar: "لم ينشر هذا المتجر سياساته بعد. بقية المتجر ما زالت مفتوحة." },
  // Studio: Legal panel (desktop app only)
  "storefront.legalPanel.nav": { en: "Legal", fr: "Mentions légales", ar: "المعلومات القانونية" },
  "storefront.legalPanel.title": { en: "Terms, returns and privacy", fr: "Conditions, retours et données personnelles", ar: "الشروط والإرجاع والخصوصية" },
  "storefront.legalPanel.description": { en: "Three short pages appear at the bottom of your store. They are built from the fields below.", fr: "Trois courtes pages apparaissent en bas de votre boutique. Elles sont construites à partir des champs ci-dessous.", ar: "تظهر ثلاث صفحات قصيرة أسفل متجرك. تُبنى من الحقول أدناه." },
  "storefront.legalPanel.templateBanner": { en: "Template: read it and edit it before you publish. SahelFlow does not give legal advice.", fr: "Modèle : lisez-le et modifiez-le avant de publier. SahelFlow ne donne pas de conseil juridique.", ar: "نموذج: اقرأه وعدّله قبل أن تنشر. لا تقدّم SahelFlow استشارة قانونية." },
  "storefront.legalPanel.sellerName": { en: "Seller name (your name or your business name)", fr: "Nom du vendeur (votre nom ou celui de votre entreprise)", ar: "اسم البائع (اسمك أو اسم نشاطك)" },
  "storefront.legalPanel.registerNumber": { en: "Commercial register or tax number (optional)", fr: "Registre de commerce ou numéro fiscal (facultatif)", ar: "السجل التجاري أو الرقم الجبائي (اختياري)" },
  "storefront.legalPanel.returnsDays": { en: "Return period in days (0 to 30; 0 means no returns)", fr: "Délai de retour en jours (0 à 30 ; 0 signifie aucun retour)", ar: "مدة الإرجاع بالأيام (من 0 إلى 30؛ 0 يعني لا إرجاع)" },
  "storefront.legalPanel.returnShipping": { en: "Who pays the shipping for a return", fr: "Qui paie l’expédition d’un retour", ar: "من يتحمل تكلفة شحن المنتج المُرجَع" },
  "storefront.legalPanel.shipping.seller": { en: "The seller", fr: "Le vendeur", ar: "البائع" },
  "storefront.legalPanel.shipping.buyer": { en: "The buyer", fr: "L’acheteur", ar: "المشتري" },
  "storefront.legalPanel.shipping.none": { en: "Not stated", fr: "Non précisé", ar: "غير محدد" },
  "storefront.legalPanel.extraReturns": { en: "More about returns (optional)", fr: "Précisions sur les retours (facultatif)", ar: "تفاصيل أخرى عن الإرجاع (اختياري)" },
  "storefront.legalPanel.extraTerms": { en: "More terms (optional)", fr: "Autres conditions (facultatif)", ar: "شروط أخرى (اختياري)" },
  "storefront.legalPanel.error.sellerName": { en: "Write the name of the seller.", fr: "Écrivez le nom du vendeur.", ar: "اكتب اسم البائع." },
  "storefront.legalPanel.error.returnsDays": { en: "Enter a whole number from 0 to 30.", fr: "Saisissez un nombre entier de 0 à 30.", ar: "أدخل عددًا صحيحًا من 0 إلى 30." },
  "storefront.legalPanel.previewHeading": { en: "What your buyers will read", fr: "Ce que vos acheteurs liront", ar: "ما سيقرؤه المشترون" },
  "storefront.legalPanel.readButton": { en: "I read this", fr: "J’ai lu", ar: "قرأتُ هذا" },
  "storefront.legalPanel.status.loading": { en: "Loading…", fr: "Chargement…", ar: "جارٍ التحميل…" },
  "storefront.legalPanel.status.saving": { en: "Saving…", fr: "Enregistrement…", ar: "جارٍ الحفظ…" },
  "storefront.legalPanel.status.saved": { en: "Saved", fr: "Enregistré", ar: "تم الحفظ" },
  "storefront.legalPanel.status.failed": { en: "Could not save. Your text is still here; try again.", fr: "Échec de l’enregistrement. Votre texte est toujours là ; réessayez.", ar: "تعذّر الحفظ. نصّك ما زال هنا؛ حاول مرة أخرى." },
  "storefront.legalPanel.status.notRead": { en: "Not read yet. Publishing waits until you press “I read this”.", fr: "Pas encore lu. La publication attend que vous appuyiez sur « J’ai lu ».", ar: "لم تقرأه بعد. ينتظر النشر حتى تضغط «قرأتُ هذا»." },
  "storefront.legalPanel.status.read": { en: "You read this version. If you change a text, read it again.", fr: "Vous avez lu cette version. Si vous modifiez un texte, relisez-le.", ar: "قرأتَ هذه النسخة. إن غيّرتَ نصًا فاقرأه من جديد." },
  "storefront.legalPanel.status.changedAfterRead": { en: "You changed the texts after reading them. Read them again.", fr: "Vous avez modifié les textes après les avoir lus. Relisez-les.", ar: "غيّرتَ النصوص بعد قراءتها. اقرأها من جديد." },
  "storefront.legalPanel.blocked.missing": { en: "Publishing waits: open the Legal panel, read the texts and press “I read this”.", fr: "La publication attend : ouvrez le panneau Mentions légales, lisez les textes et appuyez sur « J’ai lu ».", ar: "ينتظر النشر: افتح لوحة المعلومات القانونية واقرأ النصوص ثم اضغط «قرأتُ هذا»." },
  "storefront.legalPanel.blocked.unreviewed": { en: "Publishing waits: you changed the legal texts. Read them again in the Legal panel.", fr: "La publication attend : vous avez modifié les textes. Relisez-les dans le panneau Mentions légales.", ar: "ينتظر النشر: غيّرتَ النصوص القانونية. اقرأها من جديد في لوحة المعلومات القانونية." },
  "storefront.legalPanel.blocked.open": { en: "Open the Legal panel", fr: "Ouvrir le panneau Mentions légales", ar: "افتح لوحة المعلومات القانونية" },
};

const LOCALES: readonly Locale[] = ["ar", "fr", "en"];

const translations = Object.fromEntries(
  LOCALES.map((locale) => [locale, Object.fromEntries(Object.entries(ROWS).map(([key, row]) => [key, row[locale]]))]),
) as Record<Locale, Record<string, string>>;

/** key | ar | fr | en, for the Founder's native read (audit/waves/W3-B2-copy-for-native-read.md is generated from this). */
export function storefrontLegalRuntimeEntries(): Array<{ key: string; ar: string; fr: string; en: string }> {
  return Object.entries(ROWS).map(([key, row]) => ({ key, ar: row.ar, fr: row.fr, en: row.en }));
}

export function getStorefrontLegalRuntimeTranslation(locale: Locale, key: string): string | undefined {
  return translations[locale][key];
}
