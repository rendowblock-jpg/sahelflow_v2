import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isPublicApiRoute, isPublicPage } from "@/lib/auth/config";
import { verifySessionToken } from "@/lib/auth/crypto";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import {
  classifySetupRequestPath,
  isAuthenticationStaticPath,
} from "@/lib/auth/setup-containment";
import {
  AUTH_MODE_CONFIGURED,
  AUTH_MODE_ENV,
  AUTH_MODE_SETUP,
  RUNTIME_BOOTSTRAP_PATH,
  RUNTIME_COOKIE,
  RUNTIME_READY_PATH,
  RUNTIME_SHUTDOWN_PATH,
  RUNTIME_UI_READY_PATH,
} from "@/lib/runtime-auth";

function sameOriginRedirectTarget(
  request: NextRequest,
  pathname: string,
): URL {
  const host = request.headers.get("host")?.trim();
  if (host) {
    try {
      const target = new URL(`${request.nextUrl.protocol}//${host}`);
      target.pathname = pathname;
      target.search = "";
      target.hash = "";
      return target;
    } catch {
      // Fall through to the parsed request URL when an invalid Host is supplied.
    }
  }

  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = "";
  target.hash = "";
  return new URL(target.href);
}

/**
 * Auth proxy (Next 16 middleware entry).
 *
 * Runtime launch authority is checked before seller authentication. Setup mode
 * is then treated as a narrow onboarding ceremony, never as an authenticated
 * session. Route-level `requireAuth()` remains the database-backed authority.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.AUTH_SECRET;

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

  if (pathname === RUNTIME_SHUTDOWN_PATH) {
    const loopback =
      request.nextUrl.hostname === "127.0.0.1" ||
      request.nextUrl.hostname === "localhost";
    const expectedToken = process.env.SF_RUNTIME_TOKEN;
    const expectedInstanceId = process.env.SF_RUNTIME_INSTANCE_ID;
    const authorization = request.headers.get("authorization") ?? "";
    const suppliedToken = /^Bearer\s+([0-9a-f]{64})$/i.exec(authorization)?.[1];
    const suppliedInstanceId = request.headers.get(
      "x-sahelflow-runtime-instance",
    );
    if (
      request.method !== "POST" ||
      !loopback ||
      !expectedToken ||
      !/^[0-9a-f]{64}$/i.test(expectedToken) ||
      !expectedInstanceId ||
      !/^[0-9a-f]{32}$/i.test(expectedInstanceId) ||
      !suppliedToken ||
      !suppliedInstanceId ||
      !/^[0-9a-f]{32}$/i.test(suppliedInstanceId) ||
      !constantTimeEqual(suppliedToken, expectedToken) ||
      !constantTimeEqual(suppliedInstanceId, expectedInstanceId)
    ) {
      return NextResponse.json(
        { status: "rejected", code: "RUNTIME_SHUTDOWN_CREDENTIAL_REJECTED" },
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
  // builds inject the launch cookie directly into the native WebView store.
  if (pathname === RUNTIME_BOOTSTRAP_PATH) {
    return NextResponse.next();
  }

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

  if (pathname === RUNTIME_UI_READY_PATH) {
    return NextResponse.next();
  }

  if (isAuthenticationStaticPath(pathname)) {
    return NextResponse.next();
  }

  // A missing seller secret is a setup ceremony, not an authenticated bypass.
  if (explicitSetup || (developmentFallback && !secret)) {
    const decision = classifySetupRequestPath(pathname);
    if (decision.kind === "allow") {
      return NextResponse.next();
    }
    if (decision.kind === "reject_api") {
      return NextResponse.json(
        { status: "blocked", code: decision.code },
        {
          status: decision.status,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    return NextResponse.redirect(
      sameOriginRedirectTarget(request, decision.destination),
    );
  }

  if (!secret) {
    return NextResponse.json(
      { status: "blocked", code: "AUTH_RUNTIME_MISCONFIGURED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (pathname.startsWith("/api/")) {
    if (isPublicApiRoute(pathname)) {
      return NextResponse.next();
    }

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

  if (isPublicPage(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const valid = await verifySessionToken(token, secret);
  if (!valid) {
    return NextResponse.redirect(sameOriginRedirectTarget(request, "/login"));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
