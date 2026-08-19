export type RiskWorkspaceLocale = "en" | "fr" | "ar";
export type RiskWorkspaceCopyKey = keyof (typeof COPY)["en"];

const COPY = {
  en: {
    attentionTitle: "What needs your attention",
    attentionDescription:
      "A focused read of the signals most likely to affect confirmations and returns.",
    highestImpactFactor: "Highest-impact risk factor",
    openAnalysis: "Open full risk analysis",
  },
  fr: {
    attentionTitle: "Ce qui mérite votre attention",
    attentionDescription:
      "Une lecture ciblée des signaux les plus susceptibles d’affecter les confirmations et les retours.",
    highestImpactFactor: "Facteur de risque le plus impactant",
    openAnalysis: "Ouvrir l’analyse complète des risques",
  },
  ar: {
    attentionTitle: "ما يحتاج انتباهك الآن",
    attentionDescription:
      "ملخص مركز للإشارات الأكثر احتمالًا للتأثير على التأكيدات والمرتجعات.",
    highestImpactFactor: "عامل الخطر الأعلى تأثيرًا",
    openAnalysis: "فتح تحليل المخاطر الكامل",
  },
} as const;

function numberLocale(locale: RiskWorkspaceLocale): string {
  return locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-DZ" : "en-GB";
}

export function getRiskWorkspaceCopy(
  locale: RiskWorkspaceLocale,
  key: RiskWorkspaceCopyKey,
): string {
  return COPY[locale]?.[key] ?? COPY.en[key];
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
