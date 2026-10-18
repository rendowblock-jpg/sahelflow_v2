import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { RUNTIME_COOKIE } from "@/lib/runtime-auth";
import {
  readLaunchAppearance,
  recordLaunchAppearance,
} from "@/lib/runtime/launch-appearance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

/**
 * Record the seller's language, colour mode and colour preset for the next
 * native startup card. Packaged-runtime IPC only: loopback, with the per-launch
 * runtime cookie compared in constant time (the same boundary as the UI-ready
 * report). It takes no body; the values come from the request's own cookies, so
 * a caller can never write anything but the three known tags.
 */
export async function POST(request: NextRequest) {
  const loopback =
    request.nextUrl.hostname === "127.0.0.1" ||
    request.nextUrl.hostname === "localhost";
  const expectedToken = process.env.SF_RUNTIME_APP_TOKEN;
  const dataDir = process.env.SF_DATA_DIR;

  if (
    !loopback ||
    !expectedToken ||
    !/^[0-9a-f]{64}$/i.test(expectedToken) ||
    !dataDir
  ) {
    return NextResponse.json(
      { status: "blocked", code: "LAUNCH_APPEARANCE_UNAVAILABLE" },
      { status: 503, headers: noStoreHeaders() },
    );
  }

  const supplied = request.cookies.get(RUNTIME_COOKIE)?.value ?? "";
  if (!/^[0-9a-f]{64}$/i.test(supplied) || !constantTimeEqual(supplied, expectedToken)) {
    return NextResponse.json(
      { status: "rejected", code: "RUNTIME_SESSION_REQUIRED" },
      { status: 401, headers: noStoreHeaders() },
    );
  }

  if (!recordLaunchAppearance(dataDir, readLaunchAppearance(request.cookies))) {
    return NextResponse.json(
      { status: "blocked", code: "LAUNCH_APPEARANCE_PERSIST_FAILED" },
      { status: 500, headers: noStoreHeaders() },
    );
  }
  return new NextResponse(null, { status: 204, headers: noStoreHeaders() });
}
