import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import type { AiActionProposalHandle } from "./service";

export interface AiActionProposalRuntime {
  createProposal: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<AiActionProposalHandle>;
}

export interface AiActionProposalToolResult {
  pending_action_proposal: true;
  tool: string;
  proposal: AiActionProposalHandle["proposal"];
  proposalDigest: string;
}

const storage = new AsyncLocalStorage<AiActionProposalRuntime>();

export function runWithAiActionProposalRuntime<T>(
  runtime: AiActionProposalRuntime,
  operation: () => T,
): T {
  return storage.run(runtime, operation);
}

export function currentAiActionProposalRuntime(): AiActionProposalRuntime | null {
  return storage.getStore() ?? null;
}

export function isAiActionProposalToolResult(
  value: unknown,
): value is AiActionProposalToolResult {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.pending_action_proposal === true &&
    typeof record.tool === "string" &&
    typeof record.proposalDigest === "string" &&
    Boolean(record.proposal && typeof record.proposal === "object")
  );
}
