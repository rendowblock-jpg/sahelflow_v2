import "server-only";

import { quotaLedger, type AiProviderId, type QuotaLedger } from "@/lib/ai/providers/quota-ledger";

/**
 * Which AI answers a chat turn. Pure logic: the route reads the keys and the
 * seller's order and passes them in, so nothing here reads a secret, a
 * setting or the network.
 */

/** The providers chat can use today (chat on a ChatGPT plan is not built). */
export type ChatProviderId = Extract<AiProviderId, "gemini" | "groq">;
export type ChatNone = "no_key" | "images_need_gemini";

export interface ChooseChatProvidersInput {
  /** The seller's order, already parsed. Repeats and unknown names are tolerated. */
  order: readonly string[];
  geminiConfigured: boolean;
  groqApiKey?: string | null;
  hasImages: boolean;
  ledger?: Pick<QuotaLedger, "isPaused">;
  now?: Date;
}

export interface ChatProviderChoice {
  chain: ChatProviderId[];
  none?: ChatNone;
}

export function chooseChatProviders(input: ChooseChatProvidersInput): ChatProviderChoice {
  const hasGroqKey = typeof input.groqApiKey === "string" && input.groqApiKey.trim() !== "";
  const ledger = input.ledger ?? quotaLedger;

  const candidates: ChatProviderId[] = [];
  for (const name of input.order) {
    if (candidates.includes(name as ChatProviderId)) continue;
    if (name === "gemini" && input.geminiConfigured) candidates.push("gemini");
    // Groq's text model cannot read images; "openai" and unknown names fall through.
    else if (name === "groq" && hasGroqKey && !input.hasImages) candidates.push("groq");
  }

  if (candidates.length === 0) {
    const none: ChatNone = hasGroqKey && input.hasImages && !input.geminiConfigured ? "images_need_gemini" : "no_key";
    return { chain: [], none };
  }

  const available = candidates.filter((id) => !ledger.isPaused(id, input.now).paused);
  // All paused: try them in order anyway; the first attempt gives the plain "limit reached" error.
  return { chain: available.length > 0 ? available : candidates };
}
