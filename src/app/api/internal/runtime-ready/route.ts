import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { RUNTIME_PROTOCOL_VERSION } from "@/lib/runtime-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INSTANCE_HEADER = "x-sahelflow-runtime-instance";

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([0-9a-f]{64})$/i.exec(authorization);
  return match?.[1] ?? null;
}

/**
 * Credentialed semantic readiness for the Tauri runtime supervisor.
 *
 * This endpoint is deliberately separate from the public health route. A
 * successful response proves that the request reached the exact child
 * instance spawned for this launch and that its configured database is
 * queryable after the desktop migration gate completed.
 */
export async function GET(request: Request) {
  const expectedToken = process.env.SF_RUNTIME_TOKEN;
  const instanceId = process.env.SF_RUNTIME_INSTANCE_ID;
  const runtimePort = process.env.SF_RUNTIME_PORT;
  const shopId = process.env.SF_ACTIVE_SHOP_ID;
  const registryRevision = process.env.SF_REGISTRY_REVISION;
  const migrationSetSha256 = process.env.SF_MIGRATION_SET_SHA256;

  if (
    !expectedToken ||
    !instanceId ||
    !runtimePort ||
    !shopId ||
    !registryRevision ||
    !/^[0-9a-f]{64}$/i.test(migrationSetSha256 ?? "")
  ) {
    return NextResponse.json(
      { status: "blocked", code: "RUNTIME_NOT_CONFIGURED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const suppliedToken = bearerToken(request);
  if (!suppliedToken || !constantTimeEqual(suppliedToken, expectedToken)) {
    return NextResponse.json(
      { status: "rejected", code: "RUNTIME_CREDENTIAL_REJECTED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    // Use dbRaw intentionally: DATABASE_URL is injected by the desktop for
    // the database it migrated. The global active-shop proxy remains a Phase
    // 1B compatibility boundary and must not influence runtime readiness.
    const { dbRaw } = await import("@/lib/db");
    await dbRaw.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json(
      {
        status: "blocked",
        code: "RUNTIME_DATABASE_NOT_READY",
        checks: { app: "ready", database: "blocked", migration: "ready" },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = JSON.stringify({
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      status: "ready",
      instanceId,
      processId: process.pid,
      appVersion: process.env.APP_VERSION ?? "unknown",
      port: Number.parseInt(runtimePort, 10),
      shopId,
      registryRevision: Number.parseInt(registryRevision, 10),
      migrationSetSha256,
      checks: {
        app: "ready",
        database: "ready",
        migration: "ready",
        registry: "ready",
        shop: "ready",
      },
    });
  return new Response(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(body)),
      [INSTANCE_HEADER]: instanceId,
    },
  });
}
