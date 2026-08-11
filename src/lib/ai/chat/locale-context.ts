export type AiChatLocale = "en" | "fr" | "ar";

const LOCALE_INSTRUCTIONS: Record<AiChatLocale, string> = {
  en: "The SahelFlow interface locale is English. Respond in English unless the seller explicitly asks for another language.",
  fr: "La langue de l’interface SahelFlow est le français. Réponds en français sauf si le vendeur demande explicitement une autre langue.",
  ar: "لغة واجهة SahelFlow هي العربية. أجب بالعربية ما لم يطلب البائع صراحةً لغة أخرى.",
};

/**
 * Return presentation-only locale guidance for the model system instruction.
 *
 * This context is not action authority, never changes the seller's user turn,
 * and must not be interpreted as tool input, approval, permission or target
 * state. Sensitive-action arguments continue to come from the exact seller
 * request and remain subject to proposal binding plus server-side validation.
 */
export function aiChatLocaleSystemContext(locale: AiChatLocale): string {
  return [
    "## Interface response language — presentation only",
    LOCALE_INSTRUCTIONS[locale],
    "Preserve the seller’s requested facts and exact tool/action arguments. This locale guidance is not action authority.",
  ].join("\n");
}
