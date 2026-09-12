export type AiDecisionCopyKey = keyof (typeof COPY)["en"];
export type AiDecisionLocale = "en" | "fr" | "ar";

type Params = Record<string, string | number>;

const COPY = {
  en: {
    newAnalysis: "New",
    workHistory: "Agents",
    workHistoryDescription: "Saved local AI work",
    earlier: "Earlier",
    needsReview: "Needs review",
    reviewEvidence: "Review & evidence",
    reviewEvidenceDescription: "Proposals, provider state and decision proof",
    startTitle: "What should the shop do next?",
    startDescription:
      "Ask anything about this shop, or open an agent. Sensitive changes always wait for your approval.",
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
    historySearch: "Search",
    historyNoMatches: "No session matches this search",
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
      "Orders, products, customers, delivery fees, revenue and risk analysis, and WhatsApp conversation search — with sensitive changes always submitted as proposals for your approval.",
    setupRequiredPrivacyNote:
      "Analysis runs on your own Gemini key, stored encrypted on this device. Everything in SahelFlow keeps working without AI.",
    setupChipPendingOrders: "Pending orders",
    setupChipBestProducts: "Best products",
    setupChipRevenueToday: "Revenue today",
    setupChipTopWilayas: "Top wilayas",
    assistantName: "Assistant",
    messagesMeta: "{count} messages",
    startJobsTitle: "Your agents",
    agentOrders: "Orders",
    agentInsights: "Insights",
    agentReturns: "Returns",
    agentCatalog: "Catalog",
    greetingMorning: "Good morning",
    greetingAfternoon: "Good afternoon",
    greetingEvening: "Good evening",
    abilitiesDisclosure: "What they can do on this shop",
    composerCounter: "{count} / {max}",
    deleteArmAnnounce: "Deleting \"{title}\" — activate delete again to confirm",
    abilitiesTitle: "What they can do",
    abilitiesDescription:
      "Live from this shop's tool policy — read work runs directly, sensitive changes always wait for your approval.",
    abilityNeedsApproval: "Needs approval",
    abilitiesUnavailable: "The live capability list is unavailable right now.",
    starterCountPending: "{count} waiting",
    starterCountToday: "{count} today",
    starterCountLowStock: "{count} low",
    inboxStripCount: "{count} sensitive actions await your approval",
    inboxStripDescription:
      "Proposed by the agent in any analysis. Nothing runs until you approve it.",
    inboxStripOpen: "Open review",
  },
  fr: {
    newAnalysis: "Nouveau",
    workHistory: "Agents",
    workHistoryDescription: "Travail IA enregistré localement",
    earlier: "Plus tôt",
    needsReview: "À vérifier",
    reviewEvidence: "Revue & preuves",
    reviewEvidenceDescription: "Propositions, état fournisseur et preuve de décision",
    startTitle: "Que doit faire la boutique maintenant ?",
    startDescription:
      "Posez une question sur cette boutique, ou ouvrez un agent. Les changements sensibles attendent toujours votre approbation.",
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
    historySearch: "Rechercher",
    historyNoMatches: "Aucune session ne correspond à cette recherche",
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
      "Commandes, produits, clients, frais de livraison, revenus, analyse de risque et recherche dans les conversations WhatsApp — les changements sensibles sont toujours soumis sous forme de propositions à approuver.",
    setupRequiredPrivacyNote:
      "L’analyse s’exécute avec votre propre clé Gemini, chiffrée et stockée sur cet appareil. Tout SahelFlow reste fonctionnel sans IA.",
    setupChipPendingOrders: "Commandes en attente",
    setupChipBestProducts: "Meilleurs produits",
    setupChipRevenueToday: "CA du jour",
    setupChipTopWilayas: "Top wilayas",
    assistantName: "Assistant",
    messagesMeta: "{count} messages",
    startJobsTitle: "Vos agents",
    agentOrders: "Commandes",
    agentInsights: "Analyses",
    agentReturns: "Retours",
    agentCatalog: "Catalogue",
    greetingMorning: "Bonjour",
    greetingAfternoon: "Bon après-midi",
    greetingEvening: "Bonsoir",
    abilitiesDisclosure: "Ce qu’ils peuvent faire dans cette boutique",
    composerCounter: "{count} / {max}",
    deleteArmAnnounce: "Suppression de « {title} » armée — activez à nouveau la suppression pour confirmer",
    abilitiesTitle: "Ce qu’ils savent faire",
    abilitiesDescription:
      "En direct de la politique d’outils de cette boutique — la lecture s’exécute directement, les changements sensibles attendent toujours votre approbation.",
    abilityNeedsApproval: "Nécessite une approbation",
    abilitiesUnavailable: "La liste des capacités est indisponible pour le moment.",
    starterCountPending: "{count} en attente",
    starterCountToday: "{count} aujourd’hui",
    starterCountLowStock: "{count} stock faible",
    inboxStripCount: "{count} actions sensibles attendent votre approbation",
    inboxStripDescription:
      "Proposées par l’agent dans n’importe quelle analyse. Rien ne s’exécute sans votre approbation.",
    inboxStripOpen: "Ouvrir la revue",
  },
  ar: {
    newAnalysis: "جديد",
    workHistory: "الوكلاء",
    workHistoryDescription: "عمل الذكاء الاصطناعي المحفوظ محليًا",
    earlier: "سابقًا",
    needsReview: "يحتاج مراجعة",
    reviewEvidence: "المراجعة والأدلة",
    reviewEvidenceDescription: "المقترحات وحالة المزود ودليل القرار",
    startTitle: "ما الذي يجب أن يفعله المتجر الآن؟",
    startDescription:
      "اسأل عن هذا المتجر، أو افتح وكيلاً. التغييرات الحساسة تنتظر موافقتك دائمًا.",
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
    historySearch: "بحث",
    historyNoMatches: "لا توجد جلسة تطابق هذا البحث",
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
      "الطلبات والمنتجات والعملاء ورسوم التوصيل وتحليل الإيرادات والمخاطر والبحث في محادثات واتساب — والتغييرات الحساسة تُقدَّم دائمًا كمقترحات بانتظار موافقتك.",
    setupRequiredPrivacyNote:
      "يعمل التحليل بمفتاح Gemini الخاص بك، المشفّر والمخزَّن على هذا الجهاز. ويبقى كل شيء في SahelFlow فعالاً بدون الذكاء الاصطناعي.",
    setupChipPendingOrders: "الطلبيات المعلقة",
    setupChipBestProducts: "أفضل المنتجات",
    setupChipRevenueToday: "إيرادات اليوم",
    setupChipTopWilayas: "أفضل الولايات",
    assistantName: "المساعد",
    messagesMeta: "{count} رسالة",
    startJobsTitle: "وكلاؤك",
    agentOrders: "الطلبات",
    agentInsights: "الرؤى",
    agentReturns: "الإرجاع",
    agentCatalog: "المنتجات",
    greetingMorning: "صباح الخير",
    greetingAfternoon: "مرحباً",
    greetingEvening: "مساء الخير",
    abilitiesDisclosure: "ما يستطيعون فعله في هذا المتجر",
    composerCounter: "{count} / {max}",
    deleteArmAnnounce: "جارٍ حذف \"{title}\" — فعّل الحذف مرة أخرى للتأكيد",
    abilitiesTitle: "ما يستطيعون فعله",
    abilitiesDescription:
      "مباشرةً من سياسة أدوات هذا المتجر — الأعمال القرائية تُنفَّذ فورًا، والتغييرات الحساسة تنتظر موافقتك دائمًا.",
    abilityNeedsApproval: "يتطلب موافقة",
    abilitiesUnavailable: "قائمة القدرات غير متاحة حاليًا.",
    starterCountPending: "{count} بانتظارك",
    starterCountToday: "{count} اليوم",
    starterCountLowStock: "{count} منخفض",
    inboxStripCount: "{count} إجراءات حساسة بانتظار موافقتك",
    inboxStripDescription:
      "قام الوكيل باقتراحها في أي تحليل. لا يُنفَّذ شيء حتى توافق عليه.",
    inboxStripOpen: "فتح المراجعة",
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
