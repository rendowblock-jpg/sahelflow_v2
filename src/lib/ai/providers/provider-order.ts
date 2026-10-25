import type { AiProviderId } from "./quota-ledger";

/** Setting that says which AI the order reader tries first. Written only by /api/ai/provider-order. */
export const AI_PROVIDER_ORDER_SETTING = "ai_provider_order";

export type AiProviderOrderSetting = "groq-first" | "gemini-first";
export const AI_PROVIDER_ORDER_VALUES: readonly AiProviderOrderSetting[] = ["groq-first", "gemini-first"];

/** Anything that is not one of the two known values means the default (Groq first). */
export function parseProviderOrderSetting(value: string | null | undefined): AiProviderOrderSetting {
  const normalized = value?.trim().toLowerCase();
  return normalized === "gemini-first" ? "gemini-first" : "groq-first";
}

export function providerOrderFor(setting: AiProviderOrderSetting): readonly AiProviderId[] {
  return setting === "gemini-first" ? ["gemini", "groq"] : ["groq", "gemini"];
}
