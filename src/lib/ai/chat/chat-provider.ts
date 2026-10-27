import "server-only";

import { quotaLedger, type AiProviderId, type QuotaLedger } from "@/lib/ai/providers/quota-ledger";
import type { AgentResult, AgentStreamEvent } from "./agent";
import type { GroqAgentResult } from "./groq-agent";

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

/**
 * A Groq turn in the shape `runAgent` returns. The loop already scrubs keys
 * from its text and its error, so nothing is added or copied beyond these
 * four fields (no usage, no retry delay, no rejected calls).
 */
export function groqToAgentResult(result: GroqAgentResult): AgentResult {
  return {
    response: result.text,
    toolCalls: result.toolCalls,
    ...(result.actionProposal ? { actionProposal: result.actionProposal } : {}),
    ...(result.error ? { error: result.error.message } : {}),
  };
}

/**
 * A Groq turn as the events the stream route sends. Phase A of the Groq loop
 * has no token streaming: the whole answer arrives at once, so it becomes ONE
 * text_delta. `done` has no `signal` (Gemini-specific; absent means the UI
 * shows none). An error ends the turn INSTEAD of done.
 */
export function groqToStreamEvents(result: GroqAgentResult): AgentStreamEvent[] {
  const events: AgentStreamEvent[] = [];
  for (const call of result.toolCalls) {
    events.push({ type: "tool_call", name: call.name, args: call.args });
    events.push({ type: "tool_result", name: call.name, result: call.result });
  }
  if (result.actionProposal) events.push({ type: "action_proposal", proposal: result.actionProposal });
  if (result.text !== "") events.push({ type: "text_delta", text: result.text });
  if (result.error) {
    events.push({ type: "error", message: result.error.message, code: result.error.code });
  } else {
    events.push({
      type: "done",
      response: result.text,
      toolCalls: result.toolCalls,
      ...(result.actionProposal ? { actionProposal: result.actionProposal } : {}),
    });
  }
  return events;
}
