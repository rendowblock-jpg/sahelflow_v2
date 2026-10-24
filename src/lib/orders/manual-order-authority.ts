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
  "google_sheets",
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
  sourceRevision?: string;
  sourceDetails?: Record<string, unknown>;
}

export function trustedManualOrderSourceMetadata(): string {
  return JSON.stringify({ authority: TRUSTED_MANUAL_ORDER_AUTHORITY });
}

export function canonicalSourceOrderSourceMetadata(input: {
  source: CanonicalOrderSource;
  sourceIdentity: string;
  sourceOrderId: string;
  sourceRevision?: string | null;
  sourceDetails?: Record<string, unknown> | null;
}): string {
  const sourceIdentity = input.sourceIdentity.trim();
  const sourceOrderId = input.sourceOrderId.trim();
  const sourceRevision = input.sourceRevision?.trim() || undefined;
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
    ...(sourceRevision ? { sourceRevision } : {}),
    ...(input.sourceDetails ? { sourceDetails: input.sourceDetails } : {}),
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

export function readCanonicalSourceOrderAuthority(
  source: unknown,
  sourceMetadata: unknown,
): CanonicalSourceOrderAuthorityMetadata | null {
  if (
    typeof source !== "string" ||
    !CANONICAL_ORDER_SOURCES.includes(source as CanonicalOrderSource)
  ) {
    return null;
  }
  const metadata = parsedMetadata(sourceMetadata);
  if (
    metadata?.authority !== CANONICAL_SOURCE_ORDER_AUTHORITY ||
    metadata.source !== source ||
    typeof metadata.sourceIdentity !== "string" ||
    !metadata.sourceIdentity.trim() ||
    typeof metadata.sourceOrderId !== "string" ||
    !metadata.sourceOrderId.trim()
  ) {
    return null;
  }
  return {
    authority: CANONICAL_SOURCE_ORDER_AUTHORITY,
    source: source as CanonicalOrderSource,
    sourceIdentity: metadata.sourceIdentity,
    sourceOrderId: metadata.sourceOrderId,
    ...(typeof metadata.sourceRevision === "string" && metadata.sourceRevision.trim()
      ? { sourceRevision: metadata.sourceRevision }
      : {}),
    ...(metadata.sourceDetails && typeof metadata.sourceDetails === "object"
      ? { sourceDetails: metadata.sourceDetails as Record<string, unknown> }
      : {}),
  };
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
  return readCanonicalSourceOrderAuthority(source, sourceMetadata) !== null;
}

/**
 * An order the seller typed in himself: source "manual" under the trusted-manual
 * authority. Unlike isTrustedManualOrderAuthority (which also answers true for
 * every canonical SOURCE order), this is false for a hosted-storefront order, an
 * imported order and a legacy order. Its lines are the seller's own, so they hold
 * no stock before confirmation and depend on nothing held elsewhere.
 */
export function isSellerTypedOrderAuthority(
  source: unknown,
  sourceMetadata: unknown,
): boolean {
  return (
    source === "manual" &&
    hasAuthority(sourceMetadata, TRUSTED_MANUAL_ORDER_AUTHORITY)
  );
}

/**
 * Sources whose PENDING order holds no stock (createCanonicalSourceOrder writes inventoryState "unreserved" and nothing else) and
 * whose lines the seller may correct before confirming. Left out on purpose: shopify, woocommerce, youcan (the platform owns the
 * price and may cancel or re-sync) and google_sheets (a sheet re-sync may rewrite the order): they wait for a product decision.
 */
const SELLER_EDITABLE_LINES_SOURCES: readonly CanonicalOrderSource[] = ["whatsapp", "ai_chat", "csv", "xlsx", "storefront"];

/**
 * An order whose lines the seller may edit while it is pending: one he typed in himself, or a canonical order from one of the
 * SELLER_EDITABLE_LINES_SOURCES. A hosted-storefront order is never editable: its stock is a pool reserved at the storefront and
 * its receipt is bound to the lines. Any hosted marker keeps an order out, valid or not (fail closed). Legacy and import-pending
 * orders carry no canonical metadata and stay out too.
 */
export function isSellerEditableLinesAuthority(
  source: unknown,
  sourceMetadata: unknown,
): boolean {
  if (isSellerTypedOrderAuthority(source, sourceMetadata)) return true;
  const authority = readCanonicalSourceOrderAuthority(source, sourceMetadata);
  if (!authority || !SELLER_EDITABLE_LINES_SOURCES.includes(authority.source)) return false;
  const details = authority.sourceDetails;
  return !(details && ("hostedDelegationAuthority" in details || "hostedReleaseId" in details));
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
