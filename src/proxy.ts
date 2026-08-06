import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE, isPublicApiRoute, isPublicPage } from "@/lib/auth/config";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { verifySessionToken } from "@/lib/auth/crypto";
import {
  classifySetupRequestPath,
  isAuthenticationStaticPath,
} from "@/lib/auth/setup-containment";
import {
  AUTH_MODE_CONFIGURED,
  AUTH_MODE_ENV,
  AUTH_MODE_SETUP,
  RUNTIME_BOOTSTRAP_CONFIRM_PATH,
  RUNTIME_BOOTSTRAP_HANDOFF_PATH,
  RUNTIME_BOOTSTRAP_PATH,
  RUNTIME_COOKIE,
  RUNTIME_READY_PATH,
  RUNTIME_SHUTDOWN_PATH,
  RUNTIME_UI_READY_PATH,
} from "@/lib/runtime-auth";

function sameOriginRedirect(
  request: NextRequest,
  pathname: "/setup" | "/login",
): NextResponse {
  const destination = request.nextUrl.clone();
  destination.pathname = pathname;
  destination.search = "";
  destination.hash = "";
  const response = NextResponse.redirect(destination, 307);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * Runtime launch authority is checked before seller authentication. Setup mode
 * is a narrow onboarding ceremony, never an authenticated session.
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
  const explicitConfigured = authMode === AUTH_MODE_CONFIGURED && Boolean(secret);
  const developmentFallback =
    process.env.NODE_ENV !== "production" && authMode === undefined;
  if (!explicitSetup && !explicitConfigured && !developmentFallback) {
    return NextResponse.json(
      { status: "blocked", code: "AUTH_RUNTIME_MISCONFIGURED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (pathname === RUNTIME_BOOTSTRAP_PATH) {
    return NextResponse.next();
  }

  // The bootstrap response sets the HttpOnly launch cookie and then loads this
  // exact same-origin static script. WebView2 may request the subresource before
  // exposing the newly committed cookie to proxy middleware, so this harmless
  // one-purpose handoff asset must remain reachable without runtime authority.
  // Every other script/page/API request stays behind the launch-cookie boundary.
  if (
    pathname === RUNTIME_BOOTSTRAP_HANDOFF_PATH &&
    (request.nextUrl.hostname === "127.0.0.1" ||
      request.nextUrl.hostname === "localhost")
  ) {
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

  // Both internal browser endpoints are available only after the launch-cookie
  // boundary above succeeds. Their route handlers repeat the runtime authority
  // checks so an accidental middleware exclusion still fails closed.
  if (
    pathname === RUNTIME_BOOTSTRAP_CONFIRM_PATH ||
    pathname === RUNTIME_UI_READY_PATH
  ) {
    return NextResponse.next();
  }

  if (isAuthenticationStaticPath(pathname)) {
    return NextResponse.next();
  }

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
    return sameOriginRedirect(request, decision.destination);
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
    return sameOriginRedirect(request, "/login");
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
