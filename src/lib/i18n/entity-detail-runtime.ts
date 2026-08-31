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
 *     corrections) — order-driven movements are not logged yet.
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
    "productStock.historyTitle": "Stock adjustment history",
    "productStock.noHistory": "No stock adjustments recorded yet",
    "productStock.coverageNote":
      "Only explicit adjustments are logged — order-driven stock movements are not recorded yet.",
    "productStock.change": "Change",
    "productStock.newStock": "New stock",
    "productStock.source": "Source",
    "productStock.reason": "Reason",
    "productStock.by": "By",
    "productStock.source.aiAssistant": "AI assistant",
    "productStock.source.aiAction": "AI action",
    "productStock.source.manual": "Manual",
    "productStock.source.other": "Other",
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
    "productStock.historyTitle": "Historique des ajustements de stock",
    "productStock.noHistory": "Aucun ajustement de stock enregistré",
    "productStock.coverageNote":
      "Seuls les ajustements explicites sont journalisés — les mouvements de stock liés aux commandes ne sont pas encore enregistrés.",
    "productStock.change": "Variation",
    "productStock.newStock": "Nouveau stock",
    "productStock.source": "Source",
    "productStock.reason": "Motif",
    "productStock.by": "Par",
    "productStock.source.aiAssistant": "Assistant IA",
    "productStock.source.aiAction": "Action IA",
    "productStock.source.manual": "Manuel",
    "productStock.source.other": "Autre",
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
    "productStock.historyTitle": "سجل تعديلات المخزون",
    "productStock.noHistory": "لا توجد تعديلات مخزون مسجلة بعد",
    "productStock.coverageNote":
      "تُسجَّل التعديلات الصريحة فقط — حركات المخزون المرتبطة بالطلبيات لم تُسجَّل بعد.",
    "productStock.change": "التغيير",
    "productStock.newStock": "المخزون الجديد",
    "productStock.source": "المصدر",
    "productStock.reason": "السبب",
    "productStock.by": "بواسطة",
    "productStock.source.aiAssistant": "المساعد الذكي",
    "productStock.source.aiAction": "إجراء ذكي",
    "productStock.source.manual": "يدوي",
    "productStock.source.other": "أخرى",
  },
};

export function getEntityDetailRuntimeTranslation(
  locale: Locale,
  key: string,
): string | undefined {
  return translations[locale][key];
}
