export type RiskWorkspaceLocale = "en" | "fr" | "ar";
export type RiskWorkspaceCopyKey = keyof (typeof COPY)["en"];

const COPY = {
  en: {
    attentionTitle: "What needs your attention",
    attentionDescription:
      "A focused read of the signals most likely to affect confirmations and returns.",
    openAnalysis: "Open full risk analysis",
  },
  fr: {
    attentionTitle: "Ce qui mérite votre attention",
    attentionDescription:
      "Une lecture ciblée des signaux les plus susceptibles d’affecter les confirmations et les retours.",
    openAnalysis: "Ouvrir l’analyse complète des risques",
  },
  ar: {
    attentionTitle: "ما يحتاج انتباهك الآن",
    attentionDescription:
      "ملخص مركز للإشارات الأكثر احتمالًا للتأثير على التأكيدات والمرتجعات.",
    openAnalysis: "فتح تحليل المخاطر الكامل",
  },
} as const;

export function getRiskWorkspaceCopy(
  locale: RiskWorkspaceLocale,
  key: RiskWorkspaceCopyKey,
): string {
  return COPY[locale]?.[key] ?? COPY.en[key];
}
