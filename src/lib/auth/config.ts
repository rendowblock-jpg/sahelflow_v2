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
 * - (none — /api/whatsapp/qr-image was removed in A-S1; it now requires auth)
 */
export const PUBLIC_API_ROUTES: readonly string[] = [
  "/api/auth",
  "/api/health",
  "/api/storefront/submit",
  // SEC-003: /api/storefront/config/ removed from public routes. The startsWith
  // match exposed GET/PUT/DELETE on /api/storefront/config/[id] to unauthenticated
  // requests. The public storefront page reads config via storefrontService
  // directly (Server Component), not via the API — so the config API doesn't
  // need to be public. All config API routes are now auth-protected.
  // A-S1: /api/whatsapp/qr-image removed from public routes. The QR is shown
  // in the authenticated WhatsApp settings page — exposing it unauthenticated
  // lets anyone scan it during the pairing window and hijack the WhatsApp
  // account. The route now calls requireAuth() (defense-in-depth) and is
  // enforced by proxy.ts middleware.
];

/** Public pages — accessible without authentication. */
export const PUBLIC_PAGES: readonly string[] = [
  "/login",
  "/setup",
  "/storefront",
];

/**
 * Check if a pathname is a public API route (no auth required).
 *
 * SECURITY: Uses startsWith for prefix matching. Each prefix must be as
 * narrow as possible. Storefront config API routes are NOT public — the
 * public storefront page reads config via the service directly (SEC-003).
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
