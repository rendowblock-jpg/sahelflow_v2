import { AI_PROVIDER_IDS, type AiProviderId } from "./quota-ledger";

/** Setting that says in which order the order reader tries the AIs. Written only by /api/ai/provider-order. */
export const AI_PROVIDER_ORDER_SETTING = "ai_provider_order";

export type AiProviderOrderSetting = "groq-first" | "gemini-first";
export const AI_PROVIDER_ORDER_VALUES: readonly AiProviderOrderSetting[] = ["groq-first", "gemini-first"];

/** Free Groq first, then Gemini, then the seller's ChatGPT plan. */
export const DEFAULT_PROVIDER_ORDER_LIST: readonly AiProviderId[] = ["groq", "gemini", "openai"];

/** The two old values only; anything else means the default (Groq first). */
export function parseProviderOrderSetting(value: string | null | undefined): AiProviderOrderSetting {
  const normalized = value?.trim().toLowerCase();
  return normalized === "gemini-first" ? "gemini-first" : "groq-first";
}

/**
 * The full order. Accepts the two old values, or an ordered list (a JSON array or a comma list of provider ids).
 * Unknown names and repeats are dropped; providers the list leaves out follow in the default order. Junk means the default.
 */
export function parseProviderOrder(value: string | null | undefined): readonly AiProviderId[] {
  const raw = value?.trim().toLowerCase();
  if (!raw || raw === "groq-first") return DEFAULT_PROVIDER_ORDER_LIST;
  if (raw === "gemini-first") return ["gemini", "groq", "openai"];
  let names: unknown;
  try {
    names = raw.startsWith("[") ? JSON.parse(raw) : raw.split(",");
  } catch {
    return DEFAULT_PROVIDER_ORDER_LIST;
  }
  if (!Array.isArray(names)) return DEFAULT_PROVIDER_ORDER_LIST;
  const listed = [...new Set(names.map((n) => (typeof n === "string" ? n.trim() : "")))]
    .filter((n): n is AiProviderId => (AI_PROVIDER_IDS as readonly string[]).includes(n));
  return listed.length ? [...listed, ...DEFAULT_PROVIDER_ORDER_LIST.filter((id) => !listed.includes(id))] : DEFAULT_PROVIDER_ORDER_LIST;
}

export function providerOrderFor(setting: AiProviderOrderSetting): readonly AiProviderId[] {
  return parseProviderOrder(setting);
}
