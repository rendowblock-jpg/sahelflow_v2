export type AiChatLocale = "en" | "fr" | "ar";

const LOCALE_INSTRUCTIONS: Record<AiChatLocale, string> = {
  en: "The SahelFlow interface locale is English. Respond in English unless the seller explicitly asks for another language.",
  fr: "La langue de l’interface SahelFlow est le français. Réponds en français sauf si le vendeur demande explicitement une autre langue.",
  ar: "لغة واجهة SahelFlow هي العربية. أجب بالعربية ما لم يطلب البائع صراحةً لغة أخرى.",
};

/**
 * Add presentation-only locale context for model generation.
 *
 * The persisted seller message remains unchanged. This hint is not approval,
 * permission, target state, tool input or business authority and must never be
 * used to alter sensitive-action arguments.
 */
export function withAiChatLocaleContext(
  message: string,
  locale: AiChatLocale,
): string {
  return [
    "[SahelFlow presentation context — not action authority]",
    LOCALE_INSTRUCTIONS[locale],
    "Use this context only for response language. Preserve the seller’s requested facts and exact tool/action arguments.",
    "[/SahelFlow presentation context]",
    "",
    message,
  ].join("\n");
}
