/**
 * Order extraction review copy (FD-064).
 *
 * The sheet where a seller checks and corrects an order read from a customer
 * message before it becomes a real order. Parity across the three locales is
 * enforced by the `satisfies` clauses below.
 */
export type OrderExtractionLocale = "en" | "fr" | "ar";

type Params = Record<string, string | number>;

const EN = {
  sourceTitle: "Customer message",
  sourceHint: "Highlighted parts were read into the order.",
  legendProduct: "Product",
  legendCustomer: "Customer",
  legendPlace: "Place",
  reviewTitle: "Review the order",
  reviewHint: "Check every field — nothing becomes an order until you create it.",
  deliveryFee: "Delivery",
  total: "Total",
  ready: "Ready to create",
  read: "Read this order",
  readAgain: "Read again",
  reading: "Reading the order…",
  methodOffline: "Read on this device",
  methodGemini: "Read with Gemini",
  confidence: "{value}% sure",
  foundTitle: "Order read from the message",
  notFoundTitle: "No order found in this message",
  notFoundHint: "Add the items yourself below — the customer details that were found are kept.",
  itemsTitle: "Items",
  product: "Product",
  chooseProduct: "Choose a product",
  quantity: "Quantity",
  addItem: "Add item",
  removeItem: "Remove {name}",
  customerWrote: "Customer wrote “{text}”",
  statedPrice: "Customer said {price}",
  catalogPrice: "{price} each",
  matchedClose: "Closest catalog match — check it",
  notInCatalog: "Not in your catalog — choose the product",
  customerTitle: "Customer",
  name: "Name",
  phone: "Phone",
  deliveryTitle: "Delivery",
  wilaya: "Wilaya",
  chooseWilaya: "Choose a wilaya",
  commune: "Commune",
  address: "Address",
  notes: "Notes",
  subtotal: "Items subtotal",
  stillNeeded: "Still needed: {fields}",
  fieldItems: "a catalog product for every item",
  fieldWilaya: "the wilaya",
  fieldPhone: "a valid phone",
  aiOff: "Harder messages can also be read with Gemini once AI is enabled.",
  aiSettings: "AI settings",
  aiFailed: "Gemini could not help this time, so this is the reading made on this device.",
  create: "Create order",
  creating: "Creating order…",
  failed: "The message could not be read. Try again.",
} as const;

export type OrderExtractionCopyKey = keyof typeof EN;

const FR = {
  sourceTitle: "Message du client",
  sourceHint: "Les passages surlignés ont été lus dans la commande.",
  legendProduct: "Produit",
  legendCustomer: "Client",
  legendPlace: "Lieu",
  reviewTitle: "Vérifier la commande",
  reviewHint: "Vérifiez chaque champ — rien ne devient une commande tant que vous ne la créez pas.",
  deliveryFee: "Livraison",
  total: "Total",
  ready: "Prête à créer",
  read: "Lire cette commande",
  readAgain: "Relire",
  reading: "Lecture de la commande…",
  methodOffline: "Lu sur cet appareil",
  methodGemini: "Lu avec Gemini",
  confidence: "Sûr à {value} %",
  foundTitle: "Commande lue dans le message",
  notFoundTitle: "Aucune commande trouvée dans ce message",
  notFoundHint: "Ajoutez vous-même les articles ci-dessous — les coordonnées trouvées sont conservées.",
  itemsTitle: "Articles",
  product: "Produit",
  chooseProduct: "Choisir un produit",
  quantity: "Quantité",
  addItem: "Ajouter un article",
  removeItem: "Retirer {name}",
  customerWrote: "Le client a écrit « {text} »",
  statedPrice: "Prix annoncé par le client : {price}",
  catalogPrice: "{price} l'unité",
  matchedClose: "Produit le plus proche du catalogue — à vérifier",
  notInCatalog: "Absent du catalogue — choisissez le produit",
  customerTitle: "Client",
  name: "Nom",
  phone: "Téléphone",
  deliveryTitle: "Livraison",
  wilaya: "Wilaya",
  chooseWilaya: "Choisir une wilaya",
  commune: "Commune",
  address: "Adresse",
  notes: "Notes",
  subtotal: "Sous-total articles",
  stillNeeded: "Il manque : {fields}",
  fieldItems: "un produit du catalogue pour chaque article",
  fieldWilaya: "la wilaya",
  fieldPhone: "un téléphone valide",
  aiOff: "Les messages plus difficiles peuvent aussi être lus avec Gemini une fois l'IA activée.",
  aiSettings: "Paramètres IA",
  aiFailed: "Gemini n'a pas pu aider cette fois : voici la lecture faite sur cet appareil.",
  create: "Créer la commande",
  creating: "Création de la commande…",
  failed: "Le message n'a pas pu être lu. Réessayez.",
} as const satisfies Record<OrderExtractionCopyKey, string>;

const AR = {
  sourceTitle: "رسالة الزبون",
  sourceHint: "الأجزاء المظلّلة هي التي قُرئت في الطلب.",
  legendProduct: "المنتج",
  legendCustomer: "الزبون",
  legendPlace: "المكان",
  reviewTitle: "راجع الطلب",
  reviewHint: "تحقّق من كل حقل — لا يصبح أي شيء طلبًا حتى تنشئه بنفسك.",
  deliveryFee: "التوصيل",
  total: "المجموع",
  ready: "جاهز للإنشاء",
  read: "اقرأ هذا الطلب",
  readAgain: "أعد القراءة",
  reading: "جارٍ قراءة الطلب…",
  methodOffline: "قُرئ على هذا الجهاز",
  methodGemini: "قُرئ بواسطة Gemini",
  confidence: "موثوقية {value}٪",
  foundTitle: "طلب مقروء من الرسالة",
  notFoundTitle: "لم يُعثر على طلب في هذه الرسالة",
  notFoundHint: "أضف المنتجات بنفسك أدناه — تُحفظ بيانات الزبون التي عُثر عليها.",
  itemsTitle: "المنتجات",
  product: "المنتج",
  chooseProduct: "اختر منتجًا",
  quantity: "الكمية",
  addItem: "إضافة منتج",
  removeItem: "إزالة {name}",
  customerWrote: "كتب الزبون «{text}»",
  statedPrice: "السعر الذي ذكره الزبون: {price}",
  catalogPrice: "{price} للقطعة",
  matchedClose: "أقرب منتج في الكتالوج — تحقّق منه",
  notInCatalog: "غير موجود في الكتالوج — اختر المنتج",
  customerTitle: "الزبون",
  name: "الاسم",
  phone: "الهاتف",
  deliveryTitle: "التوصيل",
  wilaya: "الولاية",
  chooseWilaya: "اختر ولاية",
  commune: "البلدية",
  address: "العنوان",
  notes: "ملاحظات",
  subtotal: "مجموع المنتجات",
  stillNeeded: "ما زال مطلوبًا: {fields}",
  fieldItems: "منتج من الكتالوج لكل سطر",
  fieldWilaya: "الولاية",
  fieldPhone: "رقم هاتف صحيح",
  aiOff: "يمكن أيضًا قراءة الرسائل الأصعب بواسطة Gemini بعد تفعيل الذكاء الاصطناعي.",
  aiSettings: "إعدادات الذكاء الاصطناعي",
  aiFailed: "تعذّرت مساعدة Gemini هذه المرة، وهذه هي القراءة التي تمت على هذا الجهاز.",
  create: "إنشاء الطلب",
  creating: "جارٍ إنشاء الطلب…",
  failed: "تعذّرت قراءة الرسالة. حاول مرة أخرى.",
} as const satisfies Record<OrderExtractionCopyKey, string>;

const COPY: Record<OrderExtractionLocale, Record<OrderExtractionCopyKey, string>> = { en: EN, fr: FR, ar: AR };

export function getOrderExtractionCopy(
  locale: OrderExtractionLocale,
  key: OrderExtractionCopyKey,
  params?: Params,
): string {
  const template = COPY[locale]?.[key] ?? EN[key];
  if (!params) return template;
  // Interpolated values (product names, prices) are seller or customer data:
  // in Arabic each one is a first-strong isolate so a Latin name keeps order.
  const isolate = locale === "ar";
  let value: string = template;
  for (const [name, replacement] of Object.entries(params)) {
    const text = String(replacement);
    value = value.replaceAll(`{${name}}`, isolate ? `⁨${text}⁩` : text);
  }
  return value;
}
