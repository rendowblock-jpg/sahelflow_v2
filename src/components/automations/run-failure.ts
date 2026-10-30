/**
 * Turns an automation run that needs attention into "which step failed and
 * why" in the seller's words. Pure: the panel renders the sentence, the raw
 * engine code stays under Details for support.
 */
export type RunFailureKind =
  | "whatsappUnavailable"
  | "whatsappFailed"
  | "messageEmpty"
  | "orderMissing"
  | "conditionNotMet"
  | "unsure"
  | "interrupted"
  | "exhausted"
  | "other";

export interface RunFailure {
  /** 1-based step number, or null when the failure belongs to the whole run. */
  step: number | null;
  action: string | null;
  kind: RunFailureKind;
}

interface RunLike {
  status: string;
  lastErrorCode: string | null;
  steps: ReadonlyArray<{
    position: number;
    action: string;
    status: string;
    lastErrorCode: string | null;
  }>;
}

const KIND_BY_CODE: Readonly<Record<string, RunFailureKind>> = {
  WHATSAPP_ACCOUNT_UNAVAILABLE: "whatsappUnavailable",
  AUTOMATION_WHATSAPP_SEND_GUARD_PAUSED: "whatsappUnavailable",
  WHATSAPP_DEAD_LETTER: "whatsappFailed",
  AUTOMATION_WHATSAPP_MESSAGE_EMPTY: "messageEmpty",
  ORDER_NOT_FOUND: "orderMissing",
  NOT_FOUND: "orderMissing",
  AUTOMATION_ORDER_ID_MISSING: "orderMissing",
  AUTOMATION_GUARD_NOT_MATCHED: "conditionNotMet",
  AUTOMATION_STATUS_GUARD_NOT_COMMITTED: "conditionNotMet",
  AUTOMATION_EFFECT_AMBIGUOUS: "unsure",
  AUTOMATION_EFFECT_RECOVERY_REQUIRED: "unsure",
  AUTOMATION_STEP_LEASE_LOST: "interrupted",
  AUTOMATION_STEP_LEASE_EXPIRED: "interrupted",
};

export function runFailureKind(code: string | null | undefined): RunFailureKind {
  if (!code) return "other";
  const known = KIND_BY_CODE[code];
  if (known) return known;
  return code.endsWith("_ATTEMPTS_EXHAUSTED") ? "exhausted" : "other";
}

const NEEDS_ATTENTION = new Set(["failed", "dead_letter", "ambiguous", "partially_completed"]);
const FAILED_STEP = new Set(["failed", "dead_letter", "ambiguous"]);

/** The first step that really failed (steps blocked by it are not the cause). */
export function findRunFailure(run: RunLike): RunFailure | null {
  if (!NEEDS_ATTENTION.has(run.status)) return null;
  const failed = run.steps.find(
    (step) => FAILED_STEP.has(step.status) && step.lastErrorCode !== "BLOCKED_BY_FAILED_STEP",
  );
  if (failed) {
    return {
      step: failed.position + 1,
      action: failed.action,
      kind: runFailureKind(failed.lastErrorCode ?? run.lastErrorCode),
    };
  }
  return { step: null, action: null, kind: runFailureKind(run.lastErrorCode) };
}
