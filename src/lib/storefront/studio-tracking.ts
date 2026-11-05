/**
 * Ad tracking of the hosted store (ITEM 2 P1 slice 1): the seller's Meta (Facebook) Pixel id and TikTok Pixel id.
 * Wire/DB home: the OPTIONAL `theme.tracking` block of the v2 theme (no schema version bump, like builder.contact). Absent = no tracking.
 * The two shapes below are the ONLY gate between what a seller pastes and a <script> the buyer's browser runs, so they are strict:
 * digits only for Meta, upper-case letters and digits only for TikTok. The hosted validator (control-plane/storefront/shared.ts) repeats
 * them; studio-tracking.test.ts and control-plane/storefront/web/tracking.test.ts keep the copies equal.
 */
export const STOREFRONT_TRACKING_PATTERNS = {
  meta: "^[0-9]{10,20}$",
  tiktok: "^[A-Z0-9]{10,32}$",
} as const;

export interface StorefrontTracking {
  metaPixelId?: string;
  tiktokPixelId?: string;
}

export type TrackingField = "meta" | "tiktok";

const META = new RegExp(STOREFRONT_TRACKING_PATTERNS.meta);
const TIKTOK = new RegExp(STOREFRONT_TRACKING_PATTERNS.tiktok);

export function isMetaPixelId(value: string): boolean {
  return META.test(value);
}

export function isTiktokPixelId(value: string): boolean {
  return TIKTOK.test(value);
}

/** null = fine (empty means "not set"); otherwise the message key the panel shows under the field. */
export function trackingFieldError(field: TrackingField, value: string): string | null {
  if (value === "") return null;
  const ok = field === "meta" ? isMetaPixelId(value) : isTiktokPixelId(value);
  return ok ? null : `storefront.tracking.error.${field}`;
}

/** Empty = removed: the block without its empty ids, or undefined when nothing is set, so an unset store carries no `tracking` key at all. */
export function normalizeStorefrontTracking(tracking: StorefrontTracking | undefined): StorefrontTracking | undefined {
  if (!tracking) return undefined;
  const next: StorefrontTracking = {};
  if (tracking.metaPixelId) next.metaPixelId = tracking.metaPixelId;
  if (tracking.tiktokPixelId) next.tiktokPixelId = tracking.tiktokPixelId;
  return next.metaPixelId || next.tiktokPixelId ? next : undefined;
}
