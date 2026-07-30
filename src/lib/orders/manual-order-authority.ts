import { SahelFlowError } from "@/types/errors";

export const TRUSTED_MANUAL_ORDER_AUTHORITY = "trusted-manual-v1" as const;
export const CANONICAL_SOURCE_ORDER_AUTHORITY = "canonical-source-v1" as const;
export const IMPORT_PENDING_ORDER_AUTHORITY = "import-pending-v1" as const;

export const CANONICAL_ORDER_SOURCES = [
  "storefront",
  "whatsapp",
  "shopify",
  "woocommerce",
  "youcan",
  "ai_chat",
  "csv",
  "xlsx",
] as const;

export type CanonicalOrderSource = (typeof CANONICAL_ORDER_SOURCES)[number];

export interface ManualOrderAuthorityMetadata {
  authority: typeof TRUSTED_MANUAL_ORDER_AUTHORITY;
}

export interface CanonicalSourceOrderAuthorityMetadata {
  authority: typeof CANONICAL_SOURCE_ORDER_AUTHORITY;
  source: CanonicalOrderSource;
  sourceIdentity: string;
  sourceOrderId: string;
}

export function trustedManualOrderSourceMetadata(): string {
  return JSON.stringify({ authority: TRUSTED_MANUAL_ORDER_AUTHORITY });
}

export function canonicalSourceOrderSourceMetadata(input: {
  source: CanonicalOrderSource;
  sourceIdentity: string;
  sourceOrderId: string;
}): string {
  const sourceIdentity = input.sourceIdentity.trim();
  const sourceOrderId = input.sourceOrderId.trim();
  if (!sourceIdentity || !sourceOrderId) {
    throw new SahelFlowError(
      "Canonical source order identity must not be empty",
      "CANONICAL_SOURCE_IDENTITY",
      500,
    );
  }
  return JSON.stringify({
    authority: CANONICAL_SOURCE_ORDER_AUTHORITY,
    source: input.source,
    sourceIdentity,
    sourceOrderId,
  } satisfies CanonicalSourceOrderAuthorityMetadata);
}

export function importPendingOrderSourceMetadata(): {
  authority: typeof IMPORT_PENDING_ORDER_AUTHORITY;
} {
  return { authority: IMPORT_PENDING_ORDER_AUTHORITY };
}

function parsedMetadata(sourceMetadata: unknown): Record<string, unknown> | null {
  if (typeof sourceMetadata === "string") {
    try {
      const parsed = JSON.parse(sourceMetadata) as unknown;
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return sourceMetadata && typeof sourceMetadata === "object"
    ? (sourceMetadata as Record<string, unknown>)
    : null;
}

function hasAuthority(sourceMetadata: unknown, authority: string): boolean {
  return parsedMetadata(sourceMetadata)?.authority === authority;
}

export function isCanonicalOrderAuthority(
  source: unknown,
  sourceMetadata: unknown,
): boolean {
  if (
    source === "manual" &&
    hasAuthority(sourceMetadata, TRUSTED_MANUAL_ORDER_AUTHORITY)
  ) {
    return true;
  }

  if (
    typeof source !== "string" ||
    !CANONICAL_ORDER_SOURCES.includes(source as CanonicalOrderSource)
  ) {
    return false;
  }
  const metadata = parsedMetadata(sourceMetadata);
  return Boolean(
    metadata?.authority === CANONICAL_SOURCE_ORDER_AUTHORITY &&
      metadata.source === source &&
      typeof metadata.sourceIdentity === "string" &&
      metadata.sourceIdentity.trim().length > 0 &&
      typeof metadata.sourceOrderId === "string" &&
      metadata.sourceOrderId.trim().length > 0,
  );
}

/**
 * Compatibility name retained while the remaining Phase 1 call sites are
 * migrated. It now identifies every order adopted by the canonical command
 * kernel, including the original trusted-manual authority.
 */
export function isTrustedManualOrderAuthority(
  source: unknown,
  sourceMetadata: unknown,
): boolean {
  return isCanonicalOrderAuthority(source, sourceMetadata);
}

export function isImportPendingOrderAuthority(
  source: unknown,
  sourceMetadata: unknown,
): boolean {
  return (
    source === "manual" &&
    hasAuthority(sourceMetadata, IMPORT_PENDING_ORDER_AUTHORITY)
  );
}

export function assertLegacyOrderFollowupAllowed(
  source: unknown,
  sourceMetadata: unknown,
): void {
  if (!isCanonicalOrderAuthority(source, sourceMetadata)) return;
  throw new SahelFlowError(
    "This canonical order requires a governed follow-up command",
    "CANONICAL_FOLLOWUP_REQUIRED",
    409,
  );
}
