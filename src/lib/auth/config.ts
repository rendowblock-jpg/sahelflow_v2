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
 * - /api/auth/* — login, logout, setup, status (obviously)
 * - /api/health — health check (used by Tauri to verify the server is up)
 * - /api/storefront/submit — public COD checkout (customers place orders)
 * - /api/storefront/config/[id] — public storefront config (renders the page)
 * - /api/qr-image — WhatsApp QR pairing (needs to work before login on first launch)
 */
export const PUBLIC_API_ROUTES: readonly string[] = [
  "/api/auth",
  "/api/health",
  "/api/storefront/submit",
  "/api/storefront/config",
  "/api/qr-image",
];

/** Public pages — accessible without authentication. */
export const PUBLIC_PAGES: readonly string[] = [
  "/login",
  "/setup",
];

/**
 * Check if a pathname is a public API route (no auth required).
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
