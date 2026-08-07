import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { RUNTIME_COOKIE } from "@/lib/runtime-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let bootstrapConsumed = false;

function noStoreHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
}

function handoffHeaders(): Record<string, string> {
  return {
    ...noStoreHeaders(),
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy":
      "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
  };
}

const HANDOFF_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SahelFlow</title>
  <script src="/runtime-bootstrap-handoff.js" defer></script>
</head>
<body>
  <noscript>SahelFlow requires JavaScript to finish secure desktop startup.</noscript>
</body>
</html>`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const expectedToken = process.env.SF_RUNTIME_APP_TOKEN;
  const suppliedToken = url.searchParams.get("token") ?? "";
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";

  if (!expectedToken || !loopback) {
    return NextResponse.json(
      { status: "blocked", code: "RUNTIME_BOOTSTRAP_UNAVAILABLE" },
      { status: 404, headers: noStoreHeaders() },
    );
  }
  if (bootstrapConsumed) {
    return NextResponse.json(
      { status: "rejected", code: "RUNTIME_BOOTSTRAP_CONSUMED" },
      { status: 410, headers: noStoreHeaders() },
    );
  }
  if (!/^[0-9a-f]{64}$/i.test(suppliedToken) || !constantTimeEqual(suppliedToken, expectedToken)) {
    return NextResponse.json(
      { status: "rejected", code: "RUNTIME_CREDENTIAL_REJECTED" },
      { status: 401, headers: noStoreHeaders() },
    );
  }

  bootstrapConsumed = true;

  // WebView2 can follow a redirect or start a replacement navigation before it
  // persists Set-Cookie from the bootstrap response. Return same-origin HTML and
  // let its external handoff script poll a cookie-authenticated confirmation
  // endpoint before navigating to the workspace. The token remains HttpOnly and
  // CSP permits only this origin for scripts and the confirmation request.
  const response = new NextResponse(HANDOFF_HTML, {
    status: 200,
    headers: handoffHeaders(),
  });
  response.cookies.set(RUNTIME_COOKIE, expectedToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
  });
  return response;
}

export function resetRuntimeBootstrapForTest(): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    bootstrapConsumed = false;
  }
}
