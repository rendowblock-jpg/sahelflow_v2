import { intlLocale } from "@/lib/utils";

export type RiskWorkspaceLocale = "en" | "fr" | "ar";
export type RiskWorkspaceCopyKey = keyof (typeof COPY)["en"];

const COPY = {
  en: {
    attentionTitle: "What needs your attention",
    attentionDescription:
      "A focused read of the signals most likely to affect confirmations and returns.",
    highestImpactFactor: "Highest-impact risk factor",
    openAnalysis: "Open full risk analysis",
    seriesOrders: "Orders",
    seriesCameBack: "Came back",
    wilayaActivityTitle: "Your wilayas",
    wilayaActivityHint: "Every wilaya you shipped to in this period, busiest first, with its return rate so far.",
    subtitle: "See which orders are likely to come back, where returns cost you money, and act before you ship.",
    kpiDelivered: "Delivery success",
    kpiDeliveredHint: "{delivered} of {completed} finished orders delivered",
    kpiReturnRate: "Return rate",
    kpiReturnHint: "{count} parcels came back (returned or refused)",
    kpiLost: "Lost to returns",
    kpiLostHint: "Delivery costs paid on parcels that came back",
    kpiLostUnknown: "{count} returns have no recorded cost",
    kpiToCheck: "Orders to check now",
    kpiToCheckHint: "Open orders flagged high risk",
    checkTitle: "Check before you ship",
    checkHint: "Call or re-confirm these orders first. The score flags them as likely to come back.",
    checkEmpty: "No risky orders are waiting. You're clear to ship.",
    checkMore: "{count} more to check",
    scoreTitle: "Is the risk score working?",
    scoreHint: "How often finished orders came back, by the risk level they had before shipping.",
    scoreLift: "High-risk orders came back {lift}× as often as low-risk ones.",
    scoreEarly: "Not enough finished orders yet to judge the score. It sharpens as deliveries come in.",
    finished: "{count} finished",
    preventTitle: "Money you could have kept",
    preventBody: "{amount} was lost on {count} parcels the score had flagged before shipping.",
    preventNone: "No flagged order came back in this period.",
    trendTitle: "Orders and returns by week",
    trendHint: "Orders placed each week, and how many of them came back.",
    tabLoss: "Where you lose money",
    lossWilaya: "By wilaya",
    lossProduct: "By product",
    lossSource: "By sales channel",
    lossEmpty: "No parcel came back in this period.",
    colPlace: "Wilaya",
    colProduct: "Product",
    colChannel: "Channel",
    colFinished: "Finished",
    colCameBack: "Came back",
    colReturnRate: "Return rate",
    colLost: "Lost",
    early: "Few orders",
    repeatTitle: "Customers who keep refusing",
    repeatHint: "Two or more of their parcels came back in this period.",
    repeatEmpty: "No customer refused twice in this period.",
    blacklisted: "Blacklisted",
    review: "Review",
    signsTitle: "Warning signs that predicted returns",
    signsHint: "Return rate of finished orders with each sign, compared with your average.",
    signsEmpty: "Not enough finished orders with warning signs yet.",
    signLift: "{lift}× your average",
    scoreDetails: "Score details",
  },
  fr: {
    attentionTitle: "Ce qui mérite votre attention",
    attentionDescription:
      "Une lecture ciblée des signaux les plus susceptibles d’affecter les confirmations et les retours.",
    highestImpactFactor: "Facteur de risque le plus impactant",
    openAnalysis: "Ouvrir l’analyse complète des risques",
    seriesOrders: "Commandes",
    seriesCameBack: "Revenues",
    wilayaActivityTitle: "Vos wilayas",
    wilayaActivityHint: "Toutes les wilayas livrées sur cette période, les plus actives d’abord, avec leur taux de retour.",
    subtitle: "Voyez quelles commandes risquent de revenir, où les retours vous coûtent de l’argent, et agissez avant d’expédier.",
    kpiDelivered: "Taux de livraison",
    kpiDeliveredHint: "{delivered} sur {completed} commandes terminées livrées",
    kpiReturnRate: "Taux de retour",
    kpiReturnHint: "{count} colis revenus (retournés ou refusés)",
    kpiLost: "Perdu à cause des retours",
    kpiLostHint: "Frais de livraison payés sur des colis revenus",
    kpiLostUnknown: "{count} retours sans coût enregistré",
    kpiToCheck: "Commandes à vérifier",
    kpiToCheckHint: "Commandes ouvertes à risque élevé",
    checkTitle: "À vérifier avant d’expédier",
    checkHint: "Appelez ou reconfirmez d’abord ces commandes : le score les signale comme susceptibles de revenir.",
    checkEmpty: "Aucune commande à risque en attente. Vous pouvez expédier.",
    checkMore: "{count} autres à vérifier",
    scoreTitle: "Le score de risque fonctionne-t-il ?",
    scoreHint: "À quelle fréquence les commandes terminées sont revenues, selon leur niveau de risque avant l’expédition.",
    scoreLift: "Les commandes à risque élevé sont revenues {lift}× plus souvent que celles à faible risque.",
    scoreEarly: "Pas encore assez de commandes terminées pour juger le score. Il s’affine avec les livraisons.",
    finished: "{count} terminées",
    preventTitle: "Argent que vous auriez pu garder",
    preventBody: "{amount} perdus sur {count} colis que le score avait signalés avant l’expédition.",
    preventNone: "Aucune commande signalée n’est revenue sur cette période.",
    trendTitle: "Commandes et retours par semaine",
    trendHint: "Commandes passées chaque semaine, et combien sont revenues.",
    tabLoss: "Où vous perdez de l’argent",
    lossWilaya: "Par wilaya",
    lossProduct: "Par produit",
    lossSource: "Par canal de vente",
    lossEmpty: "Aucun colis n’est revenu sur cette période.",
    colPlace: "Wilaya",
    colProduct: "Produit",
    colChannel: "Canal",
    colFinished: "Terminées",
    colCameBack: "Revenues",
    colReturnRate: "Taux de retour",
    colLost: "Perdu",
    early: "Peu de commandes",
    repeatTitle: "Clients qui refusent souvent",
    repeatHint: "Au moins deux de leurs colis sont revenus sur cette période.",
    repeatEmpty: "Aucun client n’a refusé deux fois sur cette période.",
    blacklisted: "Sur liste noire",
    review: "Examiner",
    signsTitle: "Signaux qui annonçaient les retours",
    signsHint: "Taux de retour des commandes terminées présentant chaque signal, comparé à votre moyenne.",
    signsEmpty: "Pas encore assez de commandes terminées avec des signaux.",
    signLift: "{lift}× votre moyenne",
    scoreDetails: "Détails du score",
  },
  ar: {
    attentionTitle: "ما يحتاج انتباهك الآن",
    attentionDescription:
      "ملخص مركز للإشارات الأكثر احتمالًا للتأثير على التأكيدات والمرتجعات.",
    highestImpactFactor: "عامل الخطر الأعلى تأثيرًا",
    openAnalysis: "فتح تحليل المخاطر الكامل",
    seriesOrders: "الطلبات",
    seriesCameBack: "عادت",
    wilayaActivityTitle: "ولاياتك",
    wilayaActivityHint: "كل الولايات التي شحنت إليها في هذه الفترة، الأكثر نشاطًا أولًا، مع نسبة الإرجاع حتى الآن.",
    subtitle: "اعرف الطلبات المرجّح أن تعود، وأين تكلّفك المرتجعات المال، وتصرّف قبل الشحن.",
    kpiDelivered: "نسبة التسليم الناجح",
    kpiDeliveredHint: "تم تسليم {delivered} من أصل {completed} طلبًا منتهيًا",
    kpiReturnRate: "نسبة المرتجعات",
    kpiReturnHint: "عاد {count} طردًا (مرتجع أو مرفوض)",
    kpiLost: "خسارة المرتجعات",
    kpiLostHint: "تكاليف التوصيل المدفوعة على طرود عادت",
    kpiLostUnknown: "{count} مرتجعات دون تكلفة مسجلة",
    kpiToCheck: "طلبات يجب التحقق منها",
    kpiToCheckHint: "طلبات مفتوحة بخطر مرتفع",
    checkTitle: "تحقّق قبل الشحن",
    checkHint: "اتصل بهذه الطلبات أو أعد تأكيدها أولًا، فالمؤشر يرجّح عودتها.",
    checkEmpty: "لا توجد طلبات خطرة بالانتظار. يمكنك الشحن.",
    checkMore: "{count} أخرى للتحقق",
    scoreTitle: "هل مؤشر الخطر يعمل؟",
    scoreHint: "كم مرة عادت الطلبات المنتهية حسب مستوى خطرها قبل الشحن.",
    scoreLift: "عادت الطلبات عالية الخطر {lift} مرة أكثر من منخفضة الخطر.",
    scoreEarly: "لا توجد طلبات منتهية كافية بعد لتقييم المؤشر، وسيتحسن مع وصول التسليمات.",
    finished: "{count} منتهية",
    preventTitle: "مال كان يمكنك توفيره",
    preventBody: "خُسر {amount} على {count} طرود نبّه إليها المؤشر قبل الشحن.",
    preventNone: "لم يعد أي طلب منبَّه إليه خلال هذه الفترة.",
    trendTitle: "الطلبات والمرتجعات أسبوعيًا",
    trendHint: "الطلبات المسجلة كل أسبوع، وكم منها عاد.",
    tabLoss: "أين تخسر المال",
    lossWilaya: "حسب الولاية",
    lossProduct: "حسب المنتج",
    lossSource: "حسب قناة البيع",
    lossEmpty: "لم يعد أي طرد خلال هذه الفترة.",
    colPlace: "الولاية",
    colProduct: "المنتج",
    colChannel: "القناة",
    colFinished: "منتهية",
    colCameBack: "عادت",
    colReturnRate: "نسبة الإرجاع",
    colLost: "الخسارة",
    early: "طلبات قليلة",
    repeatTitle: "عملاء يرفضون باستمرار",
    repeatHint: "عاد طردان أو أكثر لهم خلال هذه الفترة.",
    repeatEmpty: "لم يرفض أي عميل مرتين خلال هذه الفترة.",
    blacklisted: "في القائمة السوداء",
    review: "مراجعة",
    signsTitle: "إشارات تنبأت بالمرتجعات",
    signsHint: "نسبة إرجاع الطلبات المنتهية التي تحمل كل إشارة مقارنة بمتوسطك.",
    signsEmpty: "لا توجد بعد طلبات منتهية كافية تحمل إشارات.",
    signLift: "{lift} مرة متوسطك",
    scoreDetails: "تفاصيل المؤشر",
  },
} as const;

function numberLocale(locale: RiskWorkspaceLocale): string {
  return intlLocale(locale);
}

export function getRiskWorkspaceCopy(
  locale: RiskWorkspaceLocale,
  key: RiskWorkspaceCopyKey,
  params?: Record<string, string | number>,
): string {
  let value: string = COPY[locale]?.[key] ?? COPY.en[key];
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

/**
 * Complete localized impact message. Keep the number and noun agreement under
 * one locale authority instead of concatenating a formatted number with an
 * invariant unit fragment.
 */
export function formatPositiveRiskPoints(
  locale: RiskWorkspaceLocale,
  points: number,
): string {
  const safePoints = Number.isFinite(points) ? Math.max(0, points) : 0;
  const resolvedLocale = numberLocale(locale);
  const formatted = new Intl.NumberFormat(resolvedLocale, {
    signDisplay: "exceptZero",
    maximumFractionDigits: 1,
  }).format(safePoints);
  const category = new Intl.PluralRules(resolvedLocale).select(safePoints);

  if (locale === "ar") {
    switch (category) {
      case "one":
        return `نقطة خطر إيجابية واحدة (${formatted})`;
      case "two":
        return `نقطتا خطر إيجابيتان (${formatted})`;
      case "few":
        return `${formatted} نقاط خطر إيجابية`;
      case "zero":
      case "many":
      case "other":
      default:
        return `${formatted} نقطة خطر إيجابية`;
    }
  }

  if (locale === "fr") {
    return category === "one"
      ? `${formatted} point de risque positif`
      : `${formatted} points de risque positifs`;
  }

  return category === "one"
    ? `${formatted} positive risk point`
    : `${formatted} positive risk points`;
}
