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
  const response = NextResponse.redirect(new URL("/", url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
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
