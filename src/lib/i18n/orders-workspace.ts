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
    "orders.workspace.decision.authority": "Canonical order authority",
    "orders.workspace.decision.importAuthority":
      "Imported order pending catalog mapping",
    "orders.workspace.decision.confirm": "Confirm order",
    "orders.workspace.decision.reject": "Reject order",
    "orders.workspace.decision.submitDraft": "Submit draft for confirmation",
    "orders.workspace.decision.submitDraftCommitted":
      "The AI draft is now in the confirmation queue.",
    "orders.workspace.decision.submitDraftReplayed":
      "The previous draft submission was recovered safely.",
    "orders.workspace.decision.confirmTitle": "Confirm this order?",
    "orders.workspace.decision.confirmBody":
      "This atomically reserves exact available stock and records the inventory movement.",
    "orders.workspace.decision.rejectTitle": "Reject this order?",
    "orders.workspace.decision.rejectBody":
      "Enter the seller-approved rejection reason.",
    "orders.workspace.decision.reasonLabel": "Rejection reason",
    "orders.workspace.decision.reasonPlaceholder":
      "Reason for rejecting this order",
    "orders.workspace.decision.commit": "Commit decision",
    "orders.workspace.decision.committed": "Decision committed.",
    "orders.workspace.decision.replayed":
      "The previously committed decision was recovered safely.",
    "orders.workspace.decision.versionMissing":
      "Refresh the order before committing a decision.",
    "orders.workspace.decision.importBlocked":
      "Map this imported order to exact catalog products and variants before confirmation.",
    "orders.workspace.fulfillment.authority": "Canonical fulfillment authority",
    "orders.workspace.fulfillment.heading": "Fulfillment and delivery",
    "orders.workspace.fulfillment.axis.fulfillment": "Fulfillment",
    "orders.workspace.fulfillment.axis.delivery": "Delivery",
    "orders.workspace.fulfillment.axis.inventory": "Inventory",
    "orders.workspace.fulfillment.axis.cod": "COD",
    "orders.workspace.fulfillment.legacy": "Awaiting governed adoption",
    "orders.workspace.fulfillment.action.pack": "Mark packed",
    "orders.workspace.fulfillment.action.ship": "Dispatch shipment",
    "orders.workspace.fulfillment.action.deliver": "Mark delivered",
    "orders.workspace.fulfillment.confirm.pack.title":
      "Mark this order as packed?",
    "orders.workspace.fulfillment.confirm.pack.body":
      "The reserved items remain held and the order becomes ready for dispatch.",
    "orders.workspace.fulfillment.confirm.ship.title":
      "Dispatch this order manually?",
    "orders.workspace.fulfillment.confirm.ship.body":
      "This consumes the exact reservations into outbound inventory without calling a courier provider. Use the governed courier workspace for provider booking.",
    "orders.workspace.fulfillment.confirm.deliver.title":
      "Mark this order as delivered?",
    "orders.workspace.fulfillment.confirm.deliver.body":
      "This closes fulfillment and creates the carrier COD receivable. Collection and remittance remain separate.",
    "orders.workspace.fulfillment.commit": "Commit transition",
    "orders.workspace.fulfillment.committed": "Transition committed.",
    "orders.workspace.fulfillment.replayed":
      "The previously committed transition was recovered safely.",
    "orders.workspace.fulfillment.noAction":
      "No governed fulfillment action is available from the current state.",
    "orders.workspace.fulfillment.error.failed":
      "The transition was not committed. Refresh and retry safely.",
    "orders.workspace.fulfillment.error.conflict":
      "This order changed or its inventory authority is incomplete. Refresh before retrying.",
    "orders.workspace.fulfillment.error.invalid":
      "This transition is not valid from the current order state.",
    "orders.workspace.fulfillment.error.notFound":
      "This order is no longer available.",
    "orders.workspace.fulfillment.state.unfulfilled": "Not prepared",
    "orders.workspace.fulfillment.state.ready": "Packed and ready",
    "orders.workspace.fulfillment.state.shipped": "Shipped",
    "orders.workspace.fulfillment.state.closed": "Closed",
    "orders.workspace.fulfillment.state.not_created": "Not created",
    "orders.workspace.fulfillment.state.pending": "Provider booking pending",
    "orders.workspace.fulfillment.state.picked_up": "Picked up",
    "orders.workspace.fulfillment.state.in_transit": "In transit",
    "orders.workspace.fulfillment.state.out_for_delivery": "Out for delivery",
    "orders.workspace.fulfillment.state.delivered": "Delivered",
    "orders.workspace.fulfillment.state.failed": "Failed",
    "orders.workspace.fulfillment.state.refused": "Refused",
    "orders.workspace.fulfillment.state.return_in_transit": "Return in transit",
    "orders.workspace.fulfillment.state.returned": "Returned",
    "orders.workspace.fulfillment.state.unreserved": "Not reserved",
    "orders.workspace.fulfillment.state.reserved": "Reserved",
    "orders.workspace.fulfillment.state.outbound": "Outbound",
    "orders.workspace.fulfillment.state.return_pending_receipt":
      "Awaiting physical return",
    "orders.workspace.fulfillment.state.return_pending_inspection":
      "Awaiting inspection",
    "orders.workspace.fulfillment.state.settled": "Settled",
    "orders.workspace.fulfillment.state.not_expected": "Not expected",
    "orders.workspace.fulfillment.state.receivable": "Awaiting collection",
    "orders.workspace.fulfillment.state.collected": "Collected by courier",
    "orders.workspace.fulfillment.state.partially_remitted":
      "Partially remitted",
    "orders.workspace.fulfillment.state.remitted": "Remitted",
    "orders.workspace.fulfillment.state.disputed": "Disputed",
    "orders.workspace.fulfillment.state.corrected": "Corrected",
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
    "orders.workspace.confirmation.backToQueue":
      "Retour à la file de confirmation",
    "orders.workspace.decision.authority": "Autorité canonique de commande",
    "orders.workspace.decision.importAuthority":
      "Commande importée en attente de correspondance catalogue",
    "orders.workspace.decision.confirm": "Confirmer la commande",
    "orders.workspace.decision.reject": "Refuser la commande",
    "orders.workspace.decision.submitDraft":
      "Soumettre le brouillon à confirmation",
    "orders.workspace.decision.submitDraftCommitted":
      "Le brouillon IA est maintenant dans la file de confirmation.",
    "orders.workspace.decision.submitDraftReplayed":
      "La soumission précédente du brouillon a été récupérée en toute sécurité.",
    "orders.workspace.decision.confirmTitle": "Confirmer cette commande ?",
    "orders.workspace.decision.confirmBody":
      "Cette action réserve atomiquement le stock exact disponible et enregistre le mouvement.",
    "orders.workspace.decision.rejectTitle": "Refuser cette commande ?",
    "orders.workspace.decision.rejectBody":
      "Saisissez le motif de refus approuvé par le vendeur.",
    "orders.workspace.decision.reasonLabel": "Motif du refus",
    "orders.workspace.decision.reasonPlaceholder":
      "Motif du refus de cette commande",
    "orders.workspace.decision.commit": "Valider la décision",
    "orders.workspace.decision.committed": "Décision validée.",
    "orders.workspace.decision.replayed":
      "La décision déjà validée a été récupérée en toute sécurité.",
    "orders.workspace.decision.versionMissing":
      "Actualisez la commande avant de valider une décision.",
    "orders.workspace.decision.importBlocked":
      "Associez cette commande importée aux produits et variantes exacts avant confirmation.",
    "orders.workspace.fulfillment.authority": "Autorité canonique d'exécution",
    "orders.workspace.fulfillment.heading": "Préparation et livraison",
    "orders.workspace.fulfillment.axis.fulfillment": "Préparation",
    "orders.workspace.fulfillment.axis.delivery": "Livraison",
    "orders.workspace.fulfillment.axis.inventory": "Stock",
    "orders.workspace.fulfillment.axis.cod": "COD",
    "orders.workspace.fulfillment.legacy": "En attente d'adoption gouvernée",
    "orders.workspace.fulfillment.action.pack": "Marquer comme emballée",
    "orders.workspace.fulfillment.action.ship": "Expédier manuellement",
    "orders.workspace.fulfillment.action.deliver": "Marquer comme livrée",
    "orders.workspace.fulfillment.confirm.pack.title":
      "Marquer cette commande comme emballée ?",
    "orders.workspace.fulfillment.confirm.pack.body":
      "Les articles réservés restent bloqués et la commande devient prête à expédier.",
    "orders.workspace.fulfillment.confirm.ship.title":
      "Expédier cette commande manuellement ?",
    "orders.workspace.fulfillment.confirm.ship.body":
      "Les réservations exactes passent en stock sortant sans appeler un transporteur. Utilisez l'espace transporteur gouverné pour une réservation fournisseur.",
    "orders.workspace.fulfillment.confirm.deliver.title":
      "Marquer cette commande comme livrée ?",
    "orders.workspace.fulfillment.confirm.deliver.body":
      "La préparation est clôturée et la créance COD transporteur est créée. Encaissement et versement restent séparés.",
    "orders.workspace.fulfillment.commit": "Valider la transition",
    "orders.workspace.fulfillment.committed": "Transition validée.",
    "orders.workspace.fulfillment.replayed":
      "La transition déjà validée a été récupérée en toute sécurité.",
    "orders.workspace.fulfillment.noAction":
      "Aucune action gouvernée n'est disponible depuis l'état actuel.",
    "orders.workspace.fulfillment.error.failed":
      "La transition n'a pas été validée. Actualisez puis réessayez sans risque.",
    "orders.workspace.fulfillment.error.conflict":
      "La commande a changé ou son autorité de stock est incomplète. Actualisez avant de réessayer.",
    "orders.workspace.fulfillment.error.invalid":
      "Cette transition n'est pas valide depuis l'état actuel.",
    "orders.workspace.fulfillment.error.notFound":
      "Cette commande n'est plus disponible.",
    "orders.workspace.fulfillment.state.unfulfilled": "Non préparée",
    "orders.workspace.fulfillment.state.ready": "Emballée et prête",
    "orders.workspace.fulfillment.state.shipped": "Expédiée",
    "orders.workspace.fulfillment.state.closed": "Clôturée",
    "orders.workspace.fulfillment.state.not_created": "Non créée",
    "orders.workspace.fulfillment.state.pending":
      "Réservation transporteur en attente",
    "orders.workspace.fulfillment.state.picked_up": "Collectée",
    "orders.workspace.fulfillment.state.in_transit": "En transit",
    "orders.workspace.fulfillment.state.out_for_delivery":
      "En cours de livraison",
    "orders.workspace.fulfillment.state.delivered": "Livrée",
    "orders.workspace.fulfillment.state.failed": "Échec",
    "orders.workspace.fulfillment.state.refused": "Refusée",
    "orders.workspace.fulfillment.state.return_in_transit": "Retour en transit",
    "orders.workspace.fulfillment.state.returned": "Retournée",
    "orders.workspace.fulfillment.state.unreserved": "Non réservé",
    "orders.workspace.fulfillment.state.reserved": "Réservé",
    "orders.workspace.fulfillment.state.outbound": "Sortant",
    "orders.workspace.fulfillment.state.return_pending_receipt":
      "Retour physique attendu",
    "orders.workspace.fulfillment.state.return_pending_inspection":
      "Inspection attendue",
    "orders.workspace.fulfillment.state.settled": "Soldé",
    "orders.workspace.fulfillment.state.not_expected": "Non attendu",
    "orders.workspace.fulfillment.state.receivable":
      "En attente d'encaissement",
    "orders.workspace.fulfillment.state.collected":
      "Encaissé par le transporteur",
    "orders.workspace.fulfillment.state.partially_remitted":
      "Partiellement versé",
    "orders.workspace.fulfillment.state.remitted": "Versé",
    "orders.workspace.fulfillment.state.disputed": "En litige",
    "orders.workspace.fulfillment.state.corrected": "Corrigé",
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
    "orders.workspace.decision.authority": "صلاحية الطلبية الموثوقة",
    "orders.workspace.decision.importAuthority":
      "طلبية مستوردة بانتظار ربط الكتالوج",
    "orders.workspace.decision.confirm": "تأكيد الطلبية",
    "orders.workspace.decision.reject": "رفض الطلبية",
    "orders.workspace.decision.submitDraft": "إرسال المسودة إلى قائمة التأكيد",
    "orders.workspace.decision.submitDraftCommitted":
      "أصبحت مسودة الذكاء الاصطناعي ضمن قائمة التأكيد.",
    "orders.workspace.decision.submitDraftReplayed":
      "تمت استعادة إرسال المسودة السابق بأمان.",
    "orders.workspace.decision.confirmTitle": "تأكيد هذه الطلبية؟",
    "orders.workspace.decision.confirmBody":
      "سيتم حجز المخزون المتاح بدقة وتسجيل حركة المخزون ضمن عملية ذرية واحدة.",
    "orders.workspace.decision.rejectTitle": "رفض هذه الطلبية؟",
    "orders.workspace.decision.rejectBody": "أدخل سبب الرفض المعتمد من البائع.",
    "orders.workspace.decision.reasonLabel": "سبب الرفض",
    "orders.workspace.decision.reasonPlaceholder": "سبب رفض هذه الطلبية",
    "orders.workspace.decision.commit": "اعتماد القرار",
    "orders.workspace.decision.committed": "تم اعتماد القرار.",
    "orders.workspace.decision.replayed":
      "تمت استعادة القرار المعتمد سابقًا بأمان.",
    "orders.workspace.decision.versionMissing":
      "حدّث الطلبية قبل اعتماد القرار.",
    "orders.workspace.decision.importBlocked":
      "اربط الطلبية المستوردة بالمنتجات والمتغيرات الدقيقة قبل تأكيدها.",
    "orders.workspace.fulfillment.authority": "صلاحية تنفيذ موثوقة",
    "orders.workspace.fulfillment.heading": "التجهيز والتوصيل",
    "orders.workspace.fulfillment.axis.fulfillment": "التجهيز",
    "orders.workspace.fulfillment.axis.delivery": "التوصيل",
    "orders.workspace.fulfillment.axis.inventory": "المخزون",
    "orders.workspace.fulfillment.axis.cod": "الدفع عند الاستلام",
    "orders.workspace.fulfillment.legacy": "بانتظار الاعتماد الموثوق",
    "orders.workspace.fulfillment.action.pack": "تعليمها كمجهّزة",
    "orders.workspace.fulfillment.action.ship": "إرسالها يدويًا",
    "orders.workspace.fulfillment.action.deliver": "تعليمها كمسلّمة",
    "orders.workspace.fulfillment.confirm.pack.title":
      "هل تم تجهيز هذه الطلبية؟",
    "orders.workspace.fulfillment.confirm.pack.body":
      "يبقى المخزون الدقيق محجوزًا وتصبح الطلبية جاهزة للإرسال.",
    "orders.workspace.fulfillment.confirm.ship.title":
      "هل تريد إرسال هذه الطلبية يدويًا؟",
    "orders.workspace.fulfillment.confirm.ship.body":
      "تُنقل الحجوزات الدقيقة إلى مخزون قيد الشحن دون الاتصال بشركة توصيل. استخدم مساحة شركة التوصيل الموثوقة لإنشاء شحنة لدى المزوّد.",
    "orders.workspace.fulfillment.confirm.deliver.title":
      "هل تم تسليم هذه الطلبية؟",
    "orders.workspace.fulfillment.confirm.deliver.body":
      "يُغلق التجهيز وتُنشأ مستحقات الدفع عند الاستلام. يبقى التحصيل والتحويل منفصلين.",
    "orders.workspace.fulfillment.commit": "اعتماد الانتقال",
    "orders.workspace.fulfillment.committed": "تم اعتماد الانتقال.",
    "orders.workspace.fulfillment.replayed":
      "تمت استعادة الانتقال المعتمد سابقًا بأمان.",
    "orders.workspace.fulfillment.noAction":
      "لا يوجد إجراء تنفيذ موثوق متاح من الحالة الحالية.",
    "orders.workspace.fulfillment.error.failed":
      "لم يتم اعتماد الانتقال. حدّث الصفحة ثم أعد المحاولة بأمان.",
    "orders.workspace.fulfillment.error.conflict":
      "تغيّرت الطلبية أو أن صلاحية مخزونها غير مكتملة. حدّث الصفحة قبل إعادة المحاولة.",
    "orders.workspace.fulfillment.error.invalid":
      "هذا الانتقال غير صالح من حالة الطلبية الحالية.",
    "orders.workspace.fulfillment.error.notFound": "لم تعد هذه الطلبية متاحة.",
    "orders.workspace.fulfillment.state.unfulfilled": "غير مجهّزة",
    "orders.workspace.fulfillment.state.ready": "مجهّزة وجاهزة",
    "orders.workspace.fulfillment.state.shipped": "مشحونة",
    "orders.workspace.fulfillment.state.closed": "مغلقة",
    "orders.workspace.fulfillment.state.not_created": "غير منشأة",
    "orders.workspace.fulfillment.state.pending":
      "حجز شركة التوصيل قيد الانتظار",
    "orders.workspace.fulfillment.state.picked_up": "تم الاستلام من البائع",
    "orders.workspace.fulfillment.state.in_transit": "قيد النقل",
    "orders.workspace.fulfillment.state.out_for_delivery": "خرجت للتسليم",
    "orders.workspace.fulfillment.state.delivered": "مسلّمة",
    "orders.workspace.fulfillment.state.failed": "فشل التوصيل",
    "orders.workspace.fulfillment.state.refused": "مرفوضة",
    "orders.workspace.fulfillment.state.return_in_transit": "الإرجاع قيد النقل",
    "orders.workspace.fulfillment.state.returned": "مرتجعة",
    "orders.workspace.fulfillment.state.unreserved": "غير محجوز",
    "orders.workspace.fulfillment.state.reserved": "محجوز",
    "orders.workspace.fulfillment.state.outbound": "قيد الشحن",
    "orders.workspace.fulfillment.state.return_pending_receipt":
      "بانتظار الإرجاع الفعلي",
    "orders.workspace.fulfillment.state.return_pending_inspection":
      "بانتظار الفحص",
    "orders.workspace.fulfillment.state.settled": "مسوّى",
    "orders.workspace.fulfillment.state.not_expected": "غير مستحق",
    "orders.workspace.fulfillment.state.receivable": "بانتظار التحصيل",
    "orders.workspace.fulfillment.state.collected":
      "محصّل لدى شركة التوصيل",
    "orders.workspace.fulfillment.state.partially_remitted": "محول جزئيًا",
    "orders.workspace.fulfillment.state.remitted": "محول",
    "orders.workspace.fulfillment.state.disputed": "متنازع عليه",
    "orders.workspace.fulfillment.state.corrected": "مصحّح",
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
