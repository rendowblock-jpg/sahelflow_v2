/**
 * Per-row import failures with constant, internal-detail-free messages
 * (S03c-13). The commit step used to echo `error.message` for every failed
 * row, which leaks driver text ("Unique constraint failed on the fields ...")
 * and, for service errors, the phone number or Zod issue JSON.
 *
 * The caller logs the original error itself (code only, no payload).
 */
import { SahelFlowError } from "@/types/errors";

export interface ImportRowError {
  code: string;
  message: string;
}

const CONSTANT_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "The row has invalid values.",
  CONFLICT: "A record with the same unique value already exists.",
  CUSTOMER_PHONE_DELETED: "The phone number belongs to a previously deleted customer.",
  NOT_FOUND: "A referenced record was not found.",
};

export const IMPORT_ROW_FAILED_MESSAGE = "The row could not be imported.";

/** Map any thrown value to a stable `{ code, message }`; never echoes `error.message`. */
export function importRowError(error: unknown): ImportRowError {
  if (error instanceof SahelFlowError) {
    const message = CONSTANT_MESSAGES[error.code];
    if (message) return { code: error.code, message };
  }
  return { code: "IMPORT_ROW_FAILED", message: IMPORT_ROW_FAILED_MESSAGE };
}
