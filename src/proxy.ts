import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isPublicApiRoute, isPublicPage } from "@/lib/auth/config";
import { verifySessionToken } from "@/lib/auth/crypto";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import {
  AUTH_MODE_CONFIGURED,
  AUTH_MODE_ENV,
  AUTH_MODE_SETUP,
  RUNTIME_BOOTSTRAP_PATH,
  RUNTIME_COOKIE,
  RUNTIME_READY_PATH,
  RUNTIME_UI_READY_PATH,
} from "@/lib/runtime-auth";

/**
 * Auth proxy (Next 16 middleware entry) — protects all /api/* (except the
 * PUBLIC_API_ROUTES allowlist) and all pages (except /login, /setup, /storefront).
 *
 * A-S2: this IS the auth middleware. Next 16 renamed `middleware.ts` → `proxy.ts`;
 * the previous audit's "no middleware.ts" finding was a false alarm caused by
 * the rename. Per-route `requireAuth()` remains as defense-in-depth (in case a
 * future route is accidentally omitted from the matcher or added to the public
 * allowlist). Both layers are intentional.
 *
 * Session verification uses HMAC-SHA256 via Web Crypto API (Edge-compatible).
 * Packaged setup is allowed only when the desktop explicitly declares that
 * the migrated active-shop database has no auth state.
 *
 * The actual API-route-level auth check (requireAuth) provides defense-in-depth:
 * even if middleware is bypassed, API routes verify the token against the DB secret.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.AUTH_SECRET;

  // The desktop supervisor probes this before a user session exists. It has
  // its own independent per-launch bearer credential and is validated again
  // inside the route. Keep this before setup mode so a missing AUTH_SECRET
  // never turns runtime readiness into an unauthenticated endpoint.
  if (pathname === RUNTIME_READY_PATH) {
    const expected = process.env.SF_RUNTIME_TOKEN;
    const authorization = request.headers.get("authorization") ?? "";
    const supplied = /^Bearer\s+([0-9a-f]{64})$/i.exec(authorization)?.[1];
    if (!expected || !supplied || !constantTimeEqual(supplied, expected)) {
      return NextResponse.json(
        { status: "rejected", code: "RUNTIME_CREDENTIAL_REJECTED" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.next();
  }

  const authMode = process.env[AUTH_MODE_ENV];
  const explicitSetup = authMode === AUTH_MODE_SETUP && !secret;
  const explicitConfigured = authMode === AUTH_MODE_CONFIGURED && !!secret;
  const developmentFallback =
    process.env.NODE_ENV !== "production" && authMode === undefined;
  if (!explicitSetup && !explicitConfigured && !developmentFallback) {
    return NextResponse.json(
      { status: "blocked", code: "AUTH_RUNTIME_MISCONFIGURED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Backward-compatible fallback for older desktop builds. Current packaged
  // builds inject the launch cookie directly into the native WebView store and
  // never place the credential in browser navigation.
  if (pathname === RUNTIME_BOOTSTRAP_PATH) {
    return NextResponse.next();
  }

  // In a packaged launch, runtime authentication precedes setup mode, public
  // routes, and user authentication. Development remains unchanged when the
  // desktop did not inject a launch token.
  const runtimeAppToken = process.env.SF_RUNTIME_APP_TOKEN;
  if (runtimeAppToken) {
    const supplied = request.cookies.get(RUNTIME_COOKIE)?.value;
    if (!supplied || !constantTimeEqual(supplied, runtimeAppToken)) {
      return NextResponse.json(
        { status: "rejected", code: "RUNTIME_SESSION_REQUIRED" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  // The browser-side readiness beacon proves that the hidden WebView loaded
  // and hydrated a real SahelFlow page with the native HttpOnly runtime cookie.
  // It is independent of the seller's user-auth session and validates the
  // cookie again inside the route before persisting its per-launch evidence.
  if (pathname === RUNTIME_UI_READY_PATH) {
    return NextResponse.next();
  }

  // Browser development retains its old no-secret setup behavior. Packaged
  // production reaches this branch only through the explicit desktop mode.
  if (explicitSetup || (developmentFallback && !secret)) {
    return NextResponse.next();
  }
  if (!secret) {
    return NextResponse.json(
      { status: "blocked", code: "AUTH_RUNTIME_MISCONFIGURED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Allow public API routes
  if (pathname.startsWith("/api/")) {
    if (isPublicApiRoute(pathname)) {
      return NextResponse.next();
    }
    // CSRF protection: sameSite=strict cookies prevent cross-origin form
    // submissions. No additional CSRF token needed for a local-first desktop
    // app where the only client is the Tauri webview (same-origin).
    // Verify session token for protected API routes
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    const valid = await verifySessionToken(token, secret);
    if (!valid) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
    return NextResponse.next();
  }

  // Allow public pages
  if (isPublicPage(pathname)) {
    return NextResponse.next();
  }

  // Allow Next.js internals (_next, icons, manifest, etc.)
  // Also allow /sw.js — the service worker must be fetchable by the browser
  // directly (ServiceWorkerRegister calls navigator.serviceWorker.register("/sw.js")).
  // If middleware intercepted it, unauthenticated users on /login or /setup
  // would get an HTML redirect instead of JS, breaking SW registration and
  // silently disabling PWA/offline support. (CONN-4-BUILD finding)
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js"
  ) {
    return NextResponse.next();
  }

  // Check session for protected pages
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const valid = await verifySessionToken(token, secret);
  if (!valid) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Match all paths except:
   * - _next/static, _next/image (Next.js internals)
   * - favicon.ico, icons/* (static assets)
   * - sw.js (service worker — must be fetchable without auth)
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
