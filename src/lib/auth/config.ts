/**
 * Auth configuration — single source of truth for auth constants.
 */

export const AUTH_COOKIE = "sf_session";
export const AUTH_SECRET_ENV = "AUTH_SECRET";
export const AUTH_SECRET_SETTING_KEY = "auth_secret";
export const AUTH_PIN_SETTING_KEY = "auth_pin_hash";

/** Session TTL: 7 days (in ms). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Public API route PREFIXES — these do NOT require authentication.
 *
 * SECURITY: Each prefix must be as NARROW as possible to avoid accidentally
 * exposing protected mutations. The previous list had `/api/storefront/config`
 * as a prefix, which matched ALL methods (GET + POST + PUT + DELETE) on
 * `/api/storefront/config/*` — allowing anyone to create/modify/delete
 * storefronts. Now we only expose the specific public paths.
 *
 * - /api/auth/* — login, logout, setup, status (obviously)
 * - /api/health — health check (used by Tauri to verify the server is up)
 * - /api/storefront/submit — public COD checkout (customers place orders)
 * - /api/storefront/config/[slug] GET — public storefront config (renders the page)
 * - /api/whatsapp/qr-image — WhatsApp QR pairing (needs to work before login on first launch)
 */
export const PUBLIC_API_ROUTES: readonly string[] = [
  "/api/auth",
  "/api/health",
  "/api/storefront/submit",
  "/api/storefront/config/",  // NOTE: trailing slash — only matches GET-by-slug, NOT the POST/PUT/DELETE collection routes
  "/api/whatsapp/qr-image",   // FIXED: was "/api/qr-image" (typo — the real route is /api/whatsapp/qr-image)
];

/** Public pages — accessible without authentication. */
export const PUBLIC_PAGES: readonly string[] = [
  "/login",
  "/setup",
];

/**
 * Check if a pathname is a public API route (no auth required).
 *
 * SECURITY: Uses startsWith for prefix matching. The trailing slash on
 * `/api/storefront/config/` ensures it only matches the GET-by-slug route
 * (`/api/storefront/config/some-slug`), NOT the POST (create) or PUT/DELETE
 * (update/delete) routes which are at `/api/storefront/config` (no trailing slash).
 */
export function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Check if a pathname is a public page (no auth required).
 */
export function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.some((page) => pathname === page || pathname.startsWith(page + "/"));
}
