import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isPublicApiRoute, isPublicPage } from "@/lib/auth/config";
import { verifySessionToken } from "@/lib/auth/crypto";

/**
 * Auth middleware — protects all /api/* (except public) and all pages
 * (except /login, /setup).
 *
 * Session verification uses HMAC-SHA256 via Web Crypto API (Edge-compatible).
 * The secret is read from process.env.AUTH_SECRET (set after first setup + restart).
 *
 * Setup mode: if AUTH_SECRET is not set, middleware allows all requests
 * (the setup wizard handles initial protection — it's only accessible when
 * no PIN is set, and the first thing it does is set the PIN + secret).
 *
 * The actual API-route-level auth check (requireAuth) provides defense-in-depth:
 * even if middleware is bypassed, API routes verify the token against the DB secret.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.AUTH_SECRET;

  // Setup mode — no secret yet, allow everything
  if (!secret) {
    return NextResponse.next();
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
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico"
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
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
