import { ProtectedDataCorruptionError } from "@/lib/crypto/protected-data-error";
import { isProtectedValueEnvelope } from "@/lib/crypto/protected-value";

const CANONICAL_FORMAT = "sahelflow-protected-value";

export type ProtectedValueClassification = "canonical" | "other";

/**
 * Distinguish ordinary plaintext/legacy payloads from a canonical declaration.
 * A value that declares the canonical format but fails strict parsing is
 * corruption, not plaintext that may be returned or encrypted again.
 */
export function classifyProtectedValue(
  value: string | null | undefined,
): ProtectedValueClassification {
  if (!value) return "other";

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return "other";
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as { format?: unknown }).format === CANONICAL_FORMAT
  ) {
    if (!isProtectedValueEnvelope(value)) {
      throw new ProtectedDataCorruptionError(
        "format",
        "Canonical protected value declaration is malformed or unsupported",
      );
    }
    return "canonical";
  }

  return "other";
}
