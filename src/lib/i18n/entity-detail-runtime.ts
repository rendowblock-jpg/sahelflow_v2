import type { Locale } from "@/lib/i18n";

/**
 * Runtime dictionary for the entity-detail reconciliation surfaces (R3-c):
 *
 *   - the customer profile risk card, which renders the TWO SahelFlow risk
 *     vocabularies side by side with explicit scale labels (the governed
 *     0-100 order risk engine vs the separate ~0-10 customer signals index),
 *     plus the subtle note shown when the two tiers disagree;
 *   - the product detail stock-adjustment history, which surfaces the audit
 *     trail rows that record explicit stock changes (AI adjustments, manual
 *     corrections), plus the order-driven inventory ledger movements.
 *
 * Reused keys (NOT duplicated here): customers.risk, risk.level.*,
 * risk.action.*, risk.assessment.action, risk.lowRisk/mediumRisk/highRisk,
 * common.date. Keys are candidates for promotion into
 * src/lib/i18n/locales/*.json during the central locale pass.
 */
const translations: Record<Locale, Record<string, string>> = {
  en: {
    "customerRisk.engine.label": "Order risk engine (0-100)",
    "customerRisk.engine.scaleHint":
      "0-100 · thresholds {{low}} / {{medium}} / {{high}}",
    "customerRisk.engine.latestOrder": "Assessed on latest order",
    "customerRisk.engine.noOrders": "No orders to assess yet",
    "customerRisk.engine.unavailable": "Latest-order assessment unavailable",
    "customerRisk.engine.meterAria": "Order risk score {{score}} out of 100",
    "customerRisk.signals.label": "Customer signals score",
    "customerRisk.signals.scaleHint":
      "0-10 index · medium ≥ {{medium}} · high ≥ {{high}}",
    "customerRisk.signals.noScore": "No signals score recorded",
    "customerRisk.signals.meterAria": "Customer signals score {{score}} out of 10",
    "customerRisk.disagreeNote":
      "The two scores use different scales and can disagree — the engine rates the latest order while the signals score is a separate customer index. Treat a warning on either as a reason to check.",
    "productStock.historyTitle": "Stock history",
    "productStock.noHistory": "No manual or AI stock adjustment yet",
    "productStock.coverageNote":
      "Shows manual and AI adjustments, and stock moved by orders. Orders created before full tracking are not included.",
    "productStock.change": "Change",
    "productStock.newStock": "New stock",
    "productStock.source": "Source",
    "productStock.reason": "Reason",
    "productStock.by": "By",
    "productStock.source.aiAssistant": "AI assistant",
    "productStock.source.aiAction": "AI action",
    "productStock.source.manual": "Manual",
    "productStock.source.other": "Other",
    "productStock.orderMovementsTitle": "Stock moved by orders",
    "productStock.movement": "Movement",
    "productStock.quantity": "Quantity",
    "productStock.order": "Order",
    "productStock.kind.reserved": "Reserved for an order",
    "productStock.kind.released": "Released (order cancelled)",
    "productStock.kind.shipped": "Shipped",
    "productStock.kind.returnReceived": "Return received for checking",
    "productStock.kind.restocked": "Back in stock after return",
    "productStock.kind.damaged": "Returned damaged",
    "productStock.kind.lost": "Lost in return",
    "productStock.kind.storefront": "Online store allocation",
    "productStock.kind.other": "Other movement",
    "productStock.by.ai": "AI assistant",
    "productStock.by.person": "Team member",
    "productStock.by.system": "SahelFlow",
  },
  fr: {
    "customerRisk.engine.label": "Moteur de risque des commandes (0-100)",
    "customerRisk.engine.scaleHint":
      "0-100 · seuils {{low}} / {{medium}} / {{high}}",
    "customerRisk.engine.latestOrder": "Évalué sur la dernière commande",
    "customerRisk.engine.noOrders": "Aucune commande à évaluer pour l’instant",
    "customerRisk.engine.unavailable": "Évaluation de la dernière commande indisponible",
    "customerRisk.engine.meterAria": "Score de risque de commande {{score}} sur 100",
    "customerRisk.signals.label": "Score des signaux client",
    "customerRisk.signals.scaleHint":
      "Indice 0-10 · moyen ≥ {{medium}} · élevé ≥ {{high}}",
    "customerRisk.signals.noScore": "Aucun score de signaux enregistré",
    "customerRisk.signals.meterAria": "Score des signaux client {{score}} sur 10",
    "customerRisk.disagreeNote":
      "Ces deux scores utilisent des échelles différentes et peuvent diverger — le moteur évalue la dernière commande, le score des signaux est un indice client séparé. Considérez une alerte sur l’un ou l’autre comme un signal pour vérifier.",
    "productStock.historyTitle": "Historique du stock",
    "productStock.noHistory": "Aucun ajustement manuel ou IA pour l’instant",
    "productStock.coverageNote":
      "Affiche les ajustements manuels et IA, ainsi que le stock déplacé par les commandes. Les commandes créées avant le suivi complet ne sont pas incluses.",
    "productStock.change": "Variation",
    "productStock.newStock": "Nouveau stock",
    "productStock.source": "Source",
    "productStock.reason": "Motif",
    "productStock.by": "Par",
    "productStock.source.aiAssistant": "Assistant IA",
    "productStock.source.aiAction": "Action IA",
    "productStock.source.manual": "Manuel",
    "productStock.source.other": "Autre",
    "productStock.orderMovementsTitle": "Stock déplacé par les commandes",
    "productStock.movement": "Mouvement",
    "productStock.quantity": "Quantité",
    "productStock.order": "Commande",
    "productStock.kind.reserved": "Réservé pour une commande",
    "productStock.kind.released": "Libéré (commande annulée)",
    "productStock.kind.shipped": "Expédié",
    "productStock.kind.returnReceived": "Retour reçu pour vérification",
    "productStock.kind.restocked": "Remis en stock après retour",
    "productStock.kind.damaged": "Retourné endommagé",
    "productStock.kind.lost": "Perdu au retour",
    "productStock.kind.storefront": "Allocation boutique en ligne",
    "productStock.kind.other": "Autre mouvement",
    "productStock.by.ai": "Assistant IA",
    "productStock.by.person": "Membre de l’équipe",
    "productStock.by.system": "SahelFlow",
  },
  ar: {
    "customerRisk.engine.label": "محرك مخاطر الطلبيات (0-100)",
    "customerRisk.engine.scaleHint":
      "0-100 · العتبات {{low}} / {{medium}} / {{high}}",
    "customerRisk.engine.latestOrder": "تم التقييم على آخر طلبية",
    "customerRisk.engine.noOrders": "لا توجد طلبيات لتقييمها بعد",
    "customerRisk.engine.unavailable": "تعذّر تقييم آخر طلبية",
    "customerRisk.engine.meterAria": "درجة مخاطر الطلبية {{score}} من 100",
    "customerRisk.signals.label": "درجة إشارات العميل",
    "customerRisk.signals.scaleHint":
      "مؤشر 0-10 · متوسط ≥ {{medium}} · مرتفع ≥ {{high}}",
    "customerRisk.signals.noScore": "لا توجد درجة إشارات مسجلة",
    "customerRisk.signals.meterAria": "درجة إشارات العميل {{score}} من 10",
    "customerRisk.disagreeNote":
      "تستخدم هاتان الدرستان مقياسين مختلفين وقد تختلفان — يقيّم المحرك آخر طلبية، بينما درجة الإشارات مؤشر منفصل للعميل. اعتبر تحذير أيٍّ منهما سببًا للتحقق.",
    "productStock.historyTitle": "سجل المخزون",
    "productStock.noHistory": "لا توجد تعديلات يدوية أو بالذكاء الاصطناعي بعد",
    "productStock.coverageNote":
      "يعرض التعديلات اليدوية وتعديلات الذكاء الاصطناعي والمخزون الذي حرّكته الطلبيات. لا تشمل الطلبيات المنشأة قبل التتبّع الكامل.",
    "productStock.change": "التغيير",
    "productStock.newStock": "المخزون الجديد",
    "productStock.source": "المصدر",
    "productStock.reason": "السبب",
    "productStock.by": "بواسطة",
    "productStock.source.aiAssistant": "المساعد الذكي",
    "productStock.source.aiAction": "إجراء ذكي",
    "productStock.source.manual": "يدوي",
    "productStock.source.other": "أخرى",
    "productStock.orderMovementsTitle": "المخزون الذي حرّكته الطلبيات",
    "productStock.movement": "الحركة",
    "productStock.quantity": "الكمية",
    "productStock.order": "الطلبية",
    "productStock.kind.reserved": "محجوز لطلبية",
    "productStock.kind.released": "أُفرج عنه (طلبية ملغاة)",
    "productStock.kind.shipped": "تم شحنه",
    "productStock.kind.returnReceived": "إرجاع مستلم للفحص",
    "productStock.kind.restocked": "عاد إلى المخزون بعد الإرجاع",
    "productStock.kind.damaged": "أُرجع تالفًا",
    "productStock.kind.lost": "فُقد أثناء الإرجاع",
    "productStock.kind.storefront": "تخصيص للمتجر الإلكتروني",
    "productStock.kind.other": "حركة أخرى",
    "productStock.by.ai": "المساعد الذكي",
    "productStock.by.person": "عضو في الفريق",
    "productStock.by.system": "SahelFlow",
  },
};

export function getEntityDetailRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
