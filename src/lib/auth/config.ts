/**
 * Auth configuration — single source of truth for auth constants.
 */

export const AUTH_COOKIE = "sf_session";
export const AUTH_SECRET_ENV = "AUTH_SECRET";
export const AUTH_SECRET_SETTING_KEY = "auth_secret";
export const AUTH_PIN_SETTING_KEY = "auth_pin_hash";

/** Cryptographic cookie envelope; database authority expires sooner. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Maximum time since login or successful reauthentication. */
export const SESSION_OVERALL_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** Maximum seller inactivity before the session is rejected. */
export const SESSION_INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

/** Avoid a database write on every authenticated request. */
export const SESSION_ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum age of PIN proof accepted for a high-risk action. */
export const SENSITIVE_REAUTH_WINDOW_MS = 10 * 60 * 1000;

/**
 * Exact public API routes. No child route inherits public access.
 *
 * In particular, the auth namespace itself is never public: login, logout,
 * setup and status are listed individually while change-pin, reauthenticate,
 * and all future auth administration endpoints remain protected by default.
 */
export const PUBLIC_API_ROUTES: readonly string[] = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/setup",
  "/api/auth/status",
  "/api/health",
  "/api/storefront/submit",
  "/api/reports/daily", // self-protects via x-cron-secret
];

/** Public page prefixes — storefront slugs and setup/login pages are intentional. */
export const PUBLIC_PAGES: readonly string[] = [
  "/login",
  "/setup",
  "/storefront",
];

/** Check if a pathname is one explicitly public API route. */
export function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.includes(pathname);
}

/** Check if a pathname is a public page or one of its intended child pages. */
export function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.some(
    (page) => pathname === page || pathname.startsWith(page + "/"),
  );
}
