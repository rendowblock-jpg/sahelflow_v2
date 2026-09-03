export type AiDecisionCopyKey = keyof (typeof COPY)["en"];
export type AiDecisionLocale = "en" | "fr" | "ar";

type Params = Record<string, string | number>;

const COPY = {
  en: {
    newAnalysis: "New analysis",
    workHistory: "Work history",
    workHistoryDescription: "Saved local AI work",
    earlier: "Earlier",
    needsReview: "Needs review",
    reviewEvidence: "Review & evidence",
    reviewEvidenceDescription: "Proposals, provider state and decision proof",
    startTitle: "What do you need to decide?",
    startDescription:
      "Ask a free-form question or start from a common seller job. SahelFlow uses only the data and tools allowed for this shop.",
    safeStartNote: "Sensitive changes always require an exact reviewed proposal.",
    proposedChanges: "Proposed changes",
    proposedChangesDescription:
      "Nothing below changes the business until the exact persisted proposal is approved.",
    providerPrivacy: "Provider & privacy",
    providerReady: "Configuration ready",
    savedHistoryAvailable: "Saved history remains available",
    setupAttention: "AI setup needs attention",
    setupChecking: "Checking AI setup",
    demoBadge: "Sample data",
    historySearch: "Search analyses",
    historyNoMatches: "No analysis matches this search",
    actionHistoryIssue: "Action review history is unavailable",
    actionHistoryIssueDescription:
      "Retry before assuming this analysis has no pending or failed sensitive actions.",
    noReviewItems: "No sensitive actions need review",
    noReviewItemsDescription:
      "Read-only evidence stays in the decision canvas. Sensitive changes appear here before execution.",
    durableSession: "Saved locally",
    reviewCount: "{count} to review",
    setupRequiredTitle: "What AI adds to this workspace",
    setupRequiredCapabilities:
      "I can search products, customers, create orders, get statistics, and estimate delivery fees.",
    setupRequiredPrivacyNote:
      "Analysis runs on your own Gemini key, stored encrypted on this device. Everything in SahelFlow keeps working without AI.",
    setupChipPendingOrders: "Pending orders",
    setupChipBestProducts: "Best products",
    setupChipRevenueToday: "Revenue today",
    setupChipTopWilayas: "Top wilayas",
  },
  fr: {
    newAnalysis: "Nouvelle analyse",
    workHistory: "Historique de travail",
    workHistoryDescription: "Travail IA enregistré localement",
    earlier: "Plus tôt",
    needsReview: "À vérifier",
    reviewEvidence: "Revue & preuves",
    reviewEvidenceDescription: "Propositions, état fournisseur et preuve de décision",
    startTitle: "Quelle décision devez-vous prendre ?",
    startDescription:
      "Posez une question libre ou partez d’une tâche vendeur courante. SahelFlow utilise uniquement les données et outils autorisés pour cette boutique.",
    safeStartNote: "Les changements sensibles exigent toujours une proposition exacte et vérifiée.",
    proposedChanges: "Changements proposés",
    proposedChangesDescription:
      "Rien ci-dessous ne modifie l’activité tant que la proposition persistée exacte n’est pas approuvée.",
    providerPrivacy: "Fournisseur & confidentialité",
    providerReady: "Configuration prête",
    savedHistoryAvailable: "L’historique enregistré reste disponible",
    setupAttention: "La configuration IA demande votre attention",
    setupChecking: "Vérification de la configuration IA",
    demoBadge: "Données d’exemple",
    historySearch: "Rechercher des analyses",
    historyNoMatches: "Aucune analyse ne correspond à cette recherche",
    actionHistoryIssue: "L’historique de revue des actions est indisponible",
    actionHistoryIssueDescription:
      "Réessayez avant de conclure qu’aucune action sensible en attente ou en échec n’existe.",
    noReviewItems: "Aucune action sensible à vérifier",
    noReviewItemsDescription:
      "Les preuves en lecture seule restent dans le canevas. Les changements sensibles apparaissent ici avant exécution.",
    durableSession: "Enregistrée localement",
    reviewCount: "{count} à vérifier",
    setupRequiredTitle: "Ce que l’IA ajoute à cet espace",
    setupRequiredCapabilities:
      "Je peux rechercher des produits, des clients, créer des commandes, obtenir des statistiques, et estimer les frais de livraison.",
    setupRequiredPrivacyNote:
      "L’analyse s’exécute avec votre propre clé Gemini, chiffrée et stockée sur cet appareil. Tout SahelFlow reste fonctionnel sans IA.",
    setupChipPendingOrders: "Commandes en attente",
    setupChipBestProducts: "Meilleurs produits",
    setupChipRevenueToday: "CA du jour",
    setupChipTopWilayas: "Top wilayas",
  },
  ar: {
    newAnalysis: "تحليل جديد",
    workHistory: "سجل العمل",
    workHistoryDescription: "عمل الذكاء الاصطناعي المحفوظ محليًا",
    earlier: "سابقًا",
    needsReview: "يحتاج مراجعة",
    reviewEvidence: "المراجعة والأدلة",
    reviewEvidenceDescription: "المقترحات وحالة المزود ودليل القرار",
    startTitle: "ما القرار الذي تحتاج إلى اتخاذه؟",
    startDescription:
      "اطرح سؤالًا مباشرًا أو ابدأ من مهمة بيع شائعة. يستخدم SahelFlow فقط البيانات والأدوات المسموح بها لهذا المتجر.",
    safeStartNote: "أي تغيير حساس يتطلب دائمًا مقترحًا دقيقًا تتم مراجعته صراحةً.",
    proposedChanges: "التغييرات المقترحة",
    proposedChangesDescription:
      "لا يغيّر أي شيء أدناه حالة العمل حتى تتم الموافقة على المقترح المحفوظ المطابق.",
    providerPrivacy: "المزود والخصوصية",
    providerReady: "الإعداد جاهز",
    savedHistoryAvailable: "يبقى السجل المحفوظ متاحًا",
    setupAttention: "إعداد الذكاء الاصطناعي يحتاج إلى انتباه",
    setupChecking: "جارٍ التحقق من إعداد الذكاء الاصطناعي",
    demoBadge: "بيانات نموذجية",
    historySearch: "ابحث في التحليلات",
    historyNoMatches: "لا يوجد تحليل يطابق هذا البحث",
    actionHistoryIssue: "سجل مراجعة الإجراءات غير متاح",
    actionHistoryIssueDescription:
      "أعد المحاولة قبل افتراض عدم وجود إجراءات حساسة معلقة أو فاشلة في هذا التحليل.",
    noReviewItems: "لا توجد إجراءات حساسة تحتاج إلى مراجعة",
    noReviewItemsDescription:
      "تبقى الأدلة للقراءة في مساحة القرار. تظهر التغييرات الحساسة هنا قبل التنفيذ.",
    durableSession: "محفوظة محليًا",
    reviewCount: "{count} للمراجعة",
    setupRequiredTitle: "ما يضيفه الذكاء الاصطناعي إلى هذه المساحة",
    setupRequiredCapabilities:
      "يمكنني البحث عن المنتجات والعملاء، وإنشاء الطلبات، والحصول على الإحصائيات، وتقدير رسوم التوصيل.",
    setupRequiredPrivacyNote:
      "يعمل التحليل بمفتاح Gemini الخاص بك، المشفّر والمخزَّن على هذا الجهاز. ويبقى كل شيء في SahelFlow فعالاً بدون الذكاء الاصطناعي.",
    setupChipPendingOrders: "الطلبيات المعلقة",
    setupChipBestProducts: "أفضل المنتجات",
    setupChipRevenueToday: "إيرادات اليوم",
    setupChipTopWilayas: "أفضل الولايات",
  },
} as const;

export function getAiDecisionCopy(
  locale: AiDecisionLocale,
  key: AiDecisionCopyKey,
  params?: Params,
): string {
  const template: string = COPY[locale]?.[key] ?? COPY.en[key];
  if (!params) return template;

  let value = template;
  for (const [name, replacement] of Object.entries(params)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}
