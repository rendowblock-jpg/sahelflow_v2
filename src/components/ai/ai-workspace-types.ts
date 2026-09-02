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

export interface AiMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  toolCalls: AiToolCallView[];
  streaming?: boolean;
  persistenceWarning?: boolean;
  interrupted?: boolean;
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
