import { NextRequest, NextResponse } from "next/server";

import { constantTimeEqual } from "@/lib/auth/constant-time";
import { flushPackagedCompileCache } from "@/lib/runtime/compile-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function blocked() {
  return NextResponse.json(
    { status: "blocked", code: "RUNTIME_SHUTDOWN_UNAVAILABLE" },
    { status: 503, headers: noStoreHeaders },
  );
}

/**
 * Flush the packaged Node compile cache only during trusted desktop shutdown.
 * This can perform synchronous disk I/O, so it must never run on a readiness or
 * seller-interaction path. The desktop bounds the request before terminating
 * the contained process tree.
 */
export async function POST(request: NextRequest) {
  const loopback =
    request.nextUrl.hostname === "127.0.0.1" ||
    request.nextUrl.hostname === "localhost";
  const expectedToken = process.env.SF_RUNTIME_TOKEN;
  const expectedInstanceId = process.env.SF_RUNTIME_INSTANCE_ID;
  const suppliedToken =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const suppliedInstanceId =
    request.headers.get("x-sahelflow-runtime-instance") ?? "";

  if (
    !loopback ||
    !expectedToken ||
    !/^[0-9a-f]{64}$/i.test(expectedToken) ||
    !expectedInstanceId ||
    !/^[0-9a-f]{32}$/i.test(expectedInstanceId) ||
    !/^[0-9a-f]{64}$/i.test(suppliedToken) ||
    !/^[0-9a-f]{32}$/i.test(suppliedInstanceId) ||
    !constantTimeEqual(suppliedToken, expectedToken) ||
    !constantTimeEqual(suppliedInstanceId, expectedInstanceId)
  ) {
    return blocked();
  }

  if (!flushPackagedCompileCache()) {
    return NextResponse.json(
      { status: "blocked", code: "RUNTIME_COMPILE_CACHE_FLUSH_FAILED" },
      { status: 500, headers: noStoreHeaders },
    );
  }

  return NextResponse.json(
    { status: "flushed", instanceId: expectedInstanceId },
    { status: 200, headers: noStoreHeaders },
  );
}
