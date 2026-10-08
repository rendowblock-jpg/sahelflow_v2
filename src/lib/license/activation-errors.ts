import type { ActivationParseErrorCode } from "./activation-code";

/**
 * One sentence per activation failure, telling the seller what happened and
 * what to do next instead of a generic "activation failed". Server
 * rejections carry `LICENSE_<STATUS>` codes from license-authority.ts; the
 * two `LICENSE_INVALID` causes a seller can act on are told apart by the
 * authority's fixed English message.
 */
const PARSE_KEYS: Record<ActivationParseErrorCode, string> = {
  LICENSE_CODE_EMPTY: "license.activation.error.empty",
  LICENSE_CODE_UNRECOGNIZED: "license.activation.error.unrecognized",
  LICENSE_CODE_CHECKSUM: "license.activation.error.checksum",
  LICENSE_CODE_UNREADABLE: "license.activation.error.unreadable",
};

const SERVER_KEYS: Record<string, string> = {
  LICENSE_DEVICE_MISMATCH: "license.activation.error.otherComputer",
  LICENSE_INSTALLATION_MISMATCH: "license.activation.error.otherComputer",
  LICENSE_WORKSPACE_MISMATCH: "license.activation.error.otherComputer",
  LICENSE_REVOKED: "license.activation.error.revoked",
  LICENSE_REVOCATION_ROLLBACK: "license.activation.error.revoked",
  LICENSE_EXPIRED: "license.activation.error.expired",
  LICENSE_PRODUCT_MISMATCH: "license.activation.error.version",
  LICENSE_CLOCK_ROLLBACK: "license.activation.error.clock",
  LICENSE_RECOVERY_CHALLENGE_REQUIRED: "license.activation.error.recovery",
  LICENSE_TRANSFER_REQUIRED: "license.activation.error.recovery",
  ACTION_FORBIDDEN: "license.activation.error.permission",
  REQUEST_VALIDATION_FAILED: "license.activation.error.unreadable",
};

export function activationParseErrorKey(code: ActivationParseErrorCode): string {
  return PARSE_KEYS[code];
}

export function activationServerErrorKey(body: {
  code?: unknown;
  error?: unknown;
  message?: unknown;
}): string {
  const code = typeof body.code === "string" ? body.code : "";
  const text = String(body.error ?? body.message ?? "").toLowerCase();
  if (code === "LICENSE_INVALID") {
    if (text.includes("signing key is unavailable")) return "license.activation.error.unknownKey";
    if (text.includes("signature")) return "license.activation.error.signature";
    return "license.activation.error.unreadable";
  }
  return SERVER_KEYS[code] ?? "license.activationFailed";
}
