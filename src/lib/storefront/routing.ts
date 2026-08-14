export const STOREFRONT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/;

export function slugifyStorefront(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63).replace(/-+$/g, "");
}

export function validStorefrontSlug(value: string): boolean {
  return STOREFRONT_SLUG_PATTERN.test(value);
}
