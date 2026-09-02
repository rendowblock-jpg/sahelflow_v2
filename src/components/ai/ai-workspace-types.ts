export interface AiSessionSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: Array<{
    id: string;
    content: string;
    role: string;
    createdAt: string;
  }>;
}

export interface AiToolCallView {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  state: "running" | "complete" | "failed";
}

/**
 * Ledger AI-26 — truthful model/quality signal. Every field originates from
 * the provider's own response (the served model id and the usageMetadata the
 * provider actually reported); the client renders the line only when the
 * signal exists and never estimates, extrapolates or fabricates values.
 * Ephemeral by design: durable history rows carry no signal, so reloaded
 * conversations show none instead of a stale or invented one.
 */
export interface AiTurnSignal {
  model: string;
  promptTokens?: number;
  candidateTokens?: number;
  totalTokens?: number;
}

export interface AiMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  toolCalls: AiToolCallView[];
  streaming?: boolean;
  persistenceWarning?: boolean;
  interrupted?: boolean;
  signal?: AiTurnSignal;
}

/** Defensive parse of the stream's done-event signal: anything that is not a
 *  provider-shaped signal (model id + finite non-negative counts) is dropped
 *  on the floor — the absence of a signal renders nothing (AI-26 truth). */
export function parseTurnSignal(value: unknown): AiTurnSignal | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.model !== "string" || !record.model) return undefined;
  const count = (input: unknown): number | undefined =>
    typeof input === "number" && Number.isFinite(input) && input >= 0
      ? input
      : undefined;
  const promptTokens = count(record.promptTokens);
  const candidateTokens = count(record.candidateTokens);
  const totalTokens = count(record.totalTokens);
  if (promptTokens === undefined && candidateTokens === undefined && totalTokens === undefined) {
    return { model: record.model };
  }
  return {
    model: record.model,
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(candidateTokens !== undefined ? { candidateTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

export interface AiSetupState {
  provider: "gemini";
  consentAccepted: boolean;
  keyConfigured: boolean;
  ready: boolean;
}

export interface AiActionProposalProjection {
  id: string;
  toolName: string;
  status: string;
  proposalDigestPrefix: string;
  summary: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  executionState: string | null;
  lastErrorCode: string | null;
}

export interface AiActionProposalHandle {
  proposal: AiActionProposalProjection;
  proposalDigest: string;
}

/** Ledger AI-19: pending proposal with its originating session identity. */
export interface AiActionProposalInboxHandle extends AiActionProposalHandle {
  sessionId: string;
  sessionTitle: string | null;
}

/** Ledger AI-20: one decided (approved/denied/executed/expired) proposal row. */
export interface AiActionDecisionView {
  id: string;
  sessionId: string;
  sessionTitle: string | null;
  toolName: string;
  status: string;
  lastErrorCode: string | null;
  proposalDigestPrefix: string;
  createdAt: string;
  decidedAt: string;
}

export type AiWorkspaceErrorCode =
  | "AI_CONSENT_REQUIRED"
  | "AI_LICENSE_REQUIRED"
  | "AI_RATE_LIMITED"
  | "AI_INVALID_MESSAGE"
  | "AI_INVALID_REQUEST"
  | "AI_SESSION_NOT_FOUND"
  | "AI_RESPONSE_NOT_PERSISTED"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_SESSION_LOAD_FAILED"
  | "AI_SESSION_CREATE_FAILED"
  | "AI_STREAM_TIMEOUT"
  | "AI_INTERNAL_ERROR";

export interface AiWorkspaceError {
  code: AiWorkspaceErrorCode;
  detail?: string | null;
}
