import { NextRequest, NextResponse } from "next/server";

import { constantTimeEqual } from "@/lib/auth/constant-time";
import { RUNTIME_COOKIE } from "@/lib/runtime-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

export async function GET(request: NextRequest) {
  const loopback =
    request.nextUrl.hostname === "127.0.0.1" ||
    request.nextUrl.hostname === "localhost";
  const expectedToken = process.env.SF_RUNTIME_APP_TOKEN;
  const suppliedToken = request.cookies.get(RUNTIME_COOKIE)?.value ?? "";

  if (!loopback || !expectedToken || !/^[0-9a-f]{64}$/i.test(expectedToken)) {
    return NextResponse.json(
      { status: "blocked", code: "RUNTIME_BOOTSTRAP_CONFIRM_UNAVAILABLE" },
      { status: 404, headers: noStoreHeaders() },
    );
  }

  if (
    !/^[0-9a-f]{64}$/i.test(suppliedToken) ||
    !constantTimeEqual(suppliedToken, expectedToken)
  ) {
    return NextResponse.json(
      { status: "rejected", code: "RUNTIME_SESSION_REQUIRED" },
      { status: 401, headers: noStoreHeaders() },
    );
  }

  return new NextResponse(null, {
    status: 204,
    headers: noStoreHeaders(),
  });
}
