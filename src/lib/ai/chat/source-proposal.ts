import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export interface AiSourceProposalContext {
  sourceIdentity: string;
  sourceOrderId: string;
}

interface StoredAiMessage {
  id: string;
  role: string;
  toolCalls: string | null;
}

const storage = new AsyncLocalStorage<AiSourceProposalContext>();

function isPendingCreateOrder(toolCalls: string | null): boolean {
  if (!toolCalls) return false;
  try {
    const parsed = JSON.parse(toolCalls) as unknown;
    if (!Array.isArray(parsed)) return false;
    return parsed.some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const tool = entry as {
        name?: unknown;
        result?: { pending_confirmation?: unknown; tool?: unknown };
      };
      return (
        tool.name === "create_order" &&
        tool.result?.pending_confirmation === true &&
        tool.result?.tool === "create_order"
      );
    });
  } catch {
    return false;
  }
}

export function resolveAiSourceProposalContext(
  sessionId: string,
  messages: readonly StoredAiMessage[],
  currentUserMessageId: string,
): AiSourceProposalContext {
  const pendingProposal = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" && isPendingCreateOrder(message.toolCalls),
    );
  return {
    sourceIdentity: `ai-session:${sessionId}`,
    sourceOrderId: pendingProposal
      ? `ai-proposal:${pendingProposal.id}`
      : `ai-message:${currentUserMessageId}`,
  };
}

export function runWithAiSourceProposal<T>(
  context: AiSourceProposalContext,
  operation: () => T,
): T {
  return storage.run(context, operation);
}

export function currentAiSourceProposal(): AiSourceProposalContext | null {
  return storage.getStore() ?? null;
}
