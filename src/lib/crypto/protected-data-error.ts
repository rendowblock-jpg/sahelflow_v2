import { SahelFlowError } from "@/types/errors";

export type ProtectedDataFailure =
  | "format"
  | "key"
  | "context"
  | "authentication";

const FAILURE_CODE: Record<ProtectedDataFailure, string> = {
  format: "PROTECTED_DATA_FORMAT_INVALID",
  key: "PROTECTED_DATA_KEY_MISMATCH",
  context: "PROTECTED_DATA_CONTEXT_MISMATCH",
  authentication: "PROTECTED_DATA_AUTHENTICATION_FAILED",
};

/**
 * A protected value was present but could not be authenticated under the exact
 * key, purpose and record context expected by the caller. Callers must surface
 * recovery/corruption state; they must never substitute the stored ciphertext,
 * blind index or an empty value as if it were seller plaintext.
 */
export class ProtectedDataCorruptionError extends SahelFlowError {
  constructor(
    public readonly failure: ProtectedDataFailure,
    message: string,
    cause?: unknown,
  ) {
    super(message, FAILURE_CODE[failure], 409);
    if (cause !== undefined) this.cause = cause;
  }
}
