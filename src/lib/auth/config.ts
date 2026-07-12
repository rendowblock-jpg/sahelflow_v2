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
 * Public API routes — these do NOT require authentication.
 *
 * SECURITY (W3-15): Each entry is treated as EITHER an exact match OR a
 * prefix match anchored on "/". The previous matcher used bare `startsWith`,
 * which let `/api/auth` match `/api/authors` (false-positive public route =
 * auth bypass). Now `/api/auth` matches `/api/auth` and `/api/auth/login`
 * but NOT `/api/authors`; `/api/health` matches `/api/health` but NOT
 * `/api/healthcheck`.
 *
 * - /api/auth/* — login, logout, setup, status (obviously)
 * - /api/health — health check (used by Tauri to verify the server is up)
 * - /api/storefront/submit — public COD checkout (customers place orders)
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
  "/api/reports/daily", // B7: cron-triggered daily WhatsApp report — self-protects via verifyCronSecret (x-cron-secret header)
];

/** Public pages — accessible without authentication. */
export const PUBLIC_PAGES: readonly string[] = [
  "/login",
  "/setup",
  "/storefront",
  "/api/reports/daily", // B7: cron-triggered daily WhatsApp report — self-protects via verifyCronSecret (x-cron-secret header)
];

/**
 * Check if a pathname is a public API route (no auth required).
 *
 * SECURITY (W3-15): Two-stage match —
 *   1. Exact equality (e.g. `/api/health` matches `/api/health`).
 *   2. Prefix match anchored on "/" — `route + "/"` is a prefix of the
 *      pathname (e.g. `/api/auth/` matches `/api/auth/login` but NOT
 *      `/api/authors`).
 *
 * Storefront config API routes are NOT public — the public storefront page
 * reads config via the service directly (SEC-003).
 */
export function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}

/**
 * Check if a pathname is a public page (no auth required).
 */
export function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.some((page) => pathname === page || pathname.startsWith(page + "/"));
}
