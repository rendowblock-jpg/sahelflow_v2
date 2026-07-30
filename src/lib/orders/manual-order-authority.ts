import { SahelFlowError } from "@/types/errors";

export const TRUSTED_MANUAL_ORDER_AUTHORITY = "trusted-manual-v1" as const;
export const IMPORT_PENDING_ORDER_AUTHORITY = "import-pending-v1" as const;

export interface ManualOrderAuthorityMetadata {
  authority: typeof TRUSTED_MANUAL_ORDER_AUTHORITY;
}

export function trustedManualOrderSourceMetadata(): string {
  return JSON.stringify({ authority: TRUSTED_MANUAL_ORDER_AUTHORITY });
}

export function importPendingOrderSourceMetadata(): {
  authority: typeof IMPORT_PENDING_ORDER_AUTHORITY;
} {
  return { authority: IMPORT_PENDING_ORDER_AUTHORITY };
}

function hasAuthority(sourceMetadata: unknown, authority: string): boolean {
  if (typeof sourceMetadata === "string") {
    try {
      const parsed = JSON.parse(sourceMetadata) as { authority?: unknown };
      return parsed.authority === authority;
    } catch {
      return false;
    }
  }
  return Boolean(
    sourceMetadata &&
      typeof sourceMetadata === "object" &&
      "authority" in sourceMetadata &&
      (sourceMetadata as { authority?: unknown }).authority === authority,
  );
}

export function isTrustedManualOrderAuthority(
  source: unknown,
  sourceMetadata: unknown,
): boolean {
  if (source !== "manual") return false;
  return hasAuthority(sourceMetadata, TRUSTED_MANUAL_ORDER_AUTHORITY);
}

export function isImportPendingOrderAuthority(
  source: unknown,
  sourceMetadata: unknown,
): boolean {
  return source === "manual" &&
    hasAuthority(sourceMetadata, IMPORT_PENDING_ORDER_AUTHORITY);
}

export function assertLegacyOrderFollowupAllowed(
  source: unknown,
  sourceMetadata: unknown,
): void {
  if (!isTrustedManualOrderAuthority(source, sourceMetadata)) return;
  throw new SahelFlowError(
    "This canonical manual order requires a governed follow-up command",
    "CANONICAL_FOLLOWUP_REQUIRED",
    409,
  );
}
