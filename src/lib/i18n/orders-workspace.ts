import type { Locale } from "@/lib/i18n";

const translations: Record<Locale, Record<string, string>> = {
  en: {
    "orders.workspace.entity": "Order",
    "orders.workspace.entityNumber": "Order {{number}}",
    "orders.workspace.bulkGovernedBlocked":
      "This selection includes orders that require an individual review before their status can change.",
    "orders.workspace.confirmation.review": "Review",
    "orders.workspace.confirmation.title": "Confirmation review",
    "orders.workspace.confirmation.description":
      "Verify the customer, risk signals, order value, and delivery details before committing a decision.",
    "orders.workspace.confirmation.backToQueue": "Back to confirmation queue",
    "orders.workspace.risk.factor.customerReturnRate":
      "Historical returns are {{rate}}% for this customer.",
    "orders.workspace.risk.factor.customerLoyalty":
      "A {{rate}}% delivery history lowers the risk for this repeat customer.",
    "orders.workspace.risk.factor.wilayaRisk":
      "The destination wilaya is rated {{level}}/5 in the current risk profile.",
    "orders.workspace.risk.factor.orderValueRisk":
      "The order value adds {{points}} risk points.",
    "orders.workspace.risk.factor.orderValueClear":
      "The order value does not add risk points at the current thresholds.",
    "orders.workspace.risk.factor.contactRisk":
      "Contact or address quality adds {{points}} risk points.",
    "orders.workspace.risk.factor.contactClear":
      "The available phone and address details pass the current contact-quality checks.",
    "orders.workspace.risk.factor.newCustomer":
      "This is the customer’s first order, so there is no delivery history to rely on yet.",
    "orders.workspace.risk.factor.orderFrequency":
      "The previous order was only {{hours}} hours earlier, which can indicate a duplicate or unusual ordering pattern.",
    "orders.workspace.risk.factor.genericRisk":
      "This signal adds {{points}} risk points.",
    "orders.workspace.risk.factor.genericProtective":
      "This signal reduces risk by {{points}} points.",
    "orders.workspace.risk.rule.autoBlacklist":
      "The customer blacklist policy was applied.",
  },
  fr: {
    "orders.workspace.entity": "Commande",
    "orders.workspace.entityNumber": "Commande {{number}}",
    "orders.workspace.bulkGovernedBlocked":
      "Cette sélection contient des commandes qui exigent une vérification individuelle avant tout changement d’état.",
    "orders.workspace.confirmation.review": "Vérifier",
    "orders.workspace.confirmation.title": "Vérification de confirmation",
    "orders.workspace.confirmation.description":
      "Vérifiez le client, les signaux de risque, la valeur de la commande et la livraison avant de valider une décision.",
    "orders.workspace.confirmation.backToQueue": "Retour à la file de confirmation",
    "orders.workspace.risk.factor.customerReturnRate":
      "Le taux de retour historique de ce client est de {{rate}} %.",
    "orders.workspace.risk.factor.customerLoyalty":
      "Un historique de livraison de {{rate}} % réduit le risque pour ce client récurrent.",
    "orders.workspace.risk.factor.wilayaRisk":
      "La wilaya de destination est classée {{level}}/5 dans le profil de risque actuel.",
    "orders.workspace.risk.factor.orderValueRisk":
      "La valeur de la commande ajoute {{points}} points de risque.",
    "orders.workspace.risk.factor.orderValueClear":
      "La valeur de la commande n’ajoute aucun point de risque avec les seuils actuels.",
    "orders.workspace.risk.factor.contactRisk":
      "La qualité des coordonnées ou de l’adresse ajoute {{points}} points de risque.",
    "orders.workspace.risk.factor.contactClear":
      "Le téléphone et l’adresse disponibles satisfont les contrôles actuels de qualité des coordonnées.",
    "orders.workspace.risk.factor.newCustomer":
      "Il s’agit de la première commande de ce client ; aucun historique de livraison n’est encore disponible.",
    "orders.workspace.risk.factor.orderFrequency":
      "La commande précédente date de seulement {{hours}} heures, ce qui peut signaler un doublon ou un rythme inhabituel.",
    "orders.workspace.risk.factor.genericRisk":
      "Ce signal ajoute {{points}} points de risque.",
    "orders.workspace.risk.factor.genericProtective":
      "Ce signal réduit le risque de {{points}} points.",
    "orders.workspace.risk.rule.autoBlacklist":
      "La politique de liste noire du client a été appliquée.",
  },
  ar: {
    "orders.workspace.entity": "طلبية",
    "orders.workspace.entityNumber": "الطلبية {{number}}",
    "orders.workspace.bulkGovernedBlocked":
      "يتضمن هذا التحديد طلبيات تتطلب مراجعة فردية قبل تغيير حالتها.",
    "orders.workspace.confirmation.review": "مراجعة",
    "orders.workspace.confirmation.title": "مراجعة التأكيد",
    "orders.workspace.confirmation.description":
      "راجع العميل ومؤشرات المخاطر وقيمة الطلبية وتفاصيل التوصيل قبل اعتماد القرار.",
    "orders.workspace.confirmation.backToQueue": "العودة إلى قائمة التأكيد",
    "orders.workspace.risk.factor.customerReturnRate":
      "بلغ معدل الإرجاع السابق لهذا العميل {{rate}}٪.",
    "orders.workspace.risk.factor.customerLoyalty":
      "سجل توصيل ناجح بنسبة {{rate}}٪ يخفض مخاطر هذا العميل المتكرر.",
    "orders.workspace.risk.factor.wilayaRisk":
      "تصنيف مخاطر ولاية الوجهة هو {{level}} من 5 وفق الملف الحالي.",
    "orders.workspace.risk.factor.orderValueRisk":
      "تضيف قيمة الطلبية {{points}} نقطة إلى المخاطر.",
    "orders.workspace.risk.factor.orderValueClear":
      "لا تضيف قيمة الطلبية نقاط مخاطر وفق الحدود الحالية.",
    "orders.workspace.risk.factor.contactRisk":
      "تضيف جودة بيانات الاتصال أو العنوان {{points}} نقطة إلى المخاطر.",
    "orders.workspace.risk.factor.contactClear":
      "بيانات الهاتف والعنوان المتاحة تستوفي فحوص جودة الاتصال الحالية.",
    "orders.workspace.risk.factor.newCustomer":
      "هذه أول طلبية للعميل، لذلك لا يتوفر بعد سجل توصيل يمكن الاعتماد عليه.",
    "orders.workspace.risk.factor.orderFrequency":
      "تفصل {{hours}} ساعة فقط عن الطلبية السابقة، وقد يشير ذلك إلى طلب مكرر أو نمط غير معتاد.",
    "orders.workspace.risk.factor.genericRisk":
      "يضيف هذا المؤشر {{points}} نقطة إلى المخاطر.",
    "orders.workspace.risk.factor.genericProtective":
      "يخفض هذا المؤشر المخاطر بمقدار {{points}} نقطة.",
    "orders.workspace.risk.rule.autoBlacklist":
      "تم تطبيق سياسة القائمة السوداء الخاصة بالعميل.",
  },
};

export function getOrdersWorkspaceTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
