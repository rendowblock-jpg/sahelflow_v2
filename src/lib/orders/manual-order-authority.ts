export const TRUSTED_MANUAL_ORDER_AUTHORITY = "trusted-manual-v1" as const;

export interface ManualOrderAuthorityMetadata {
  authority: typeof TRUSTED_MANUAL_ORDER_AUTHORITY;
}

export function trustedManualOrderSourceMetadata(): string {
  return JSON.stringify({ authority: TRUSTED_MANUAL_ORDER_AUTHORITY });
}

export function isTrustedManualOrderAuthority(
  source: unknown,
  sourceMetadata: unknown,
): boolean {
  if (source !== "manual") return false;

  if (typeof sourceMetadata === "string") {
    try {
      const parsed = JSON.parse(sourceMetadata) as { authority?: unknown };
      return parsed.authority === TRUSTED_MANUAL_ORDER_AUTHORITY;
    } catch {
      return false;
    }
  }

  return Boolean(
    sourceMetadata &&
      typeof sourceMetadata === "object" &&
      "authority" in sourceMetadata &&
      (sourceMetadata as { authority?: unknown }).authority ===
        TRUSTED_MANUAL_ORDER_AUTHORITY,
  );
}
