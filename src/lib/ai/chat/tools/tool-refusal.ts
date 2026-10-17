/**
 * Model-readable refusal results for the in-app AI chat.
 *
 * A refused read, a refused proposal and a proposal that could not be created
 * are all TOOL RESULTS: the turn continues and the model can tell the seller
 * why. They are built only from constants (a fixed sentence per code, names
 * from the permission vocabulary, a coded reason), never from record content or
 * from an error message, so they are safe to hand to the remote model as they
 * are. `isAiToolRefusalResult` accepts nothing else, which keeps a tool body
 * from forging this channel to smuggle free text past the redaction layer.
 */
import { PHASE2_ACTIONS, type Phase2Action } from "@/lib/identity/permissions";

export type AiToolRefusalCode =
  | "AI_TOOL_NOT_PERMITTED"
  | "AI_PROPOSAL_NOT_PERMITTED"
  | "AI_PROPOSAL_REJECTED";

export interface AiToolRefusal {
  code: AiToolRefusalCode;
  /** Grants the signed-in member lacks (vocabulary names only). */
  missingPermissions?: readonly Phase2Action[];
  /** Stable error code of the service that refused (never its message). */
  reasonCode?: string;
}

export interface AiToolRefusalResult {
  refused: true;
  code: AiToolRefusalCode;
  error: string;
  missing_permissions?: Phase2Action[];
  reason_code?: string;
}

const MESSAGES: Readonly<Record<AiToolRefusalCode, string>> = Object.freeze({
  AI_TOOL_NOT_PERMITTED:
    "NOT PERMITTED: the signed-in member's role does not allow reading this data through the assistant, so nothing was retrieved. Tell the seller plainly that this information is restricted for their role and that the owner or a member with the listed access can view it. Do not guess, estimate or infer the restricted values.",
  AI_PROPOSAL_NOT_PERMITTED:
    "NOT PERMITTED: the signed-in member's role does not allow requesting this action, so no proposal was created and nothing was changed. Tell the seller plainly that this action is restricted for their role and that the owner or a member with the listed access can do it. Do not retry.",
  AI_PROPOSAL_REJECTED:
    "NOT RECORDED: the action proposal could not be created, so nothing was changed. Tell the seller the action was not recorded and, using reason_code only as a hint, ask them to check the details (for example which record is meant) before trying again. Do not claim it was done.",
});

const CODES = new Set<string>(Object.keys(MESSAGES));
const VOCABULARY = new Set<string>(PHASE2_ACTIONS);
const REASON_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const ALLOWED_KEYS = new Set([
  "refused",
  "code",
  "error",
  "missing_permissions",
  "reason_code",
]);

/** Build the exact result object the model and the browser receive. */
export function aiToolRefusalResult(
  refusal: AiToolRefusal,
): AiToolRefusalResult {
  const missing = (refusal.missingPermissions ?? []).filter((action) =>
    VOCABULARY.has(action),
  );
  return {
    refused: true,
    code: refusal.code,
    error: MESSAGES[refusal.code],
    ...(missing.length > 0 ? { missing_permissions: [...missing] } : {}),
    ...(refusal.reasonCode && REASON_CODE.test(refusal.reasonCode)
      ? { reason_code: refusal.reasonCode }
      : {}),
  };
}

/** True only for a result that is exactly what `aiToolRefusalResult` builds. */
export function isAiToolRefusalResult(
  value: unknown,
): value is AiToolRefusalResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!Object.keys(record).every((key) => ALLOWED_KEYS.has(key))) return false;
  if (record.refused !== true) return false;
  if (typeof record.code !== "string" || !CODES.has(record.code)) return false;
  if (record.error !== MESSAGES[record.code as AiToolRefusalCode]) return false;
  if (record.missing_permissions !== undefined) {
    const missing = record.missing_permissions;
    if (
      !Array.isArray(missing) ||
      !missing.every(
        (action) => typeof action === "string" && VOCABULARY.has(action),
      )
    ) {
      return false;
    }
  }
  if (
    record.reason_code !== undefined &&
    (typeof record.reason_code !== "string" ||
      !REASON_CODE.test(record.reason_code))
  ) {
    return false;
  }
  return true;
}
