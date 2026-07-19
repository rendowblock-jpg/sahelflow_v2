import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import {
  AUTH_MODE_CONFIGURED,
  AUTH_MODE_ENV,
  AUTH_MODE_SETUP,
  RUNTIME_PROTOCOL_VERSION,
} from "@/lib/runtime-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INSTANCE_HEADER = "x-sahelflow-runtime-instance";

type DatabaseAuthState =
  | { mode: typeof AUTH_MODE_SETUP }
  | { mode: typeof AUTH_MODE_CONFIGURED; secret: string };

type CanonicalAuthRow = { id: unknown; pinHash: unknown; secret: unknown };
type LegacyAuthRow = { key: unknown; value: unknown };

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([0-9a-f]{64})$/i.exec(authorization);
  return match?.[1] ?? null;
}

async function databaseAuthState(): Promise<DatabaseAuthState> {
  const { dbRaw } = await import("@/lib/db");
  const canonicalRows = await dbRaw.$queryRaw<CanonicalAuthRow[]>`
    SELECT "id", "pinHash", "secret" FROM "AuthSecret"
  `;

  if (canonicalRows.length > 0) {
    const row = canonicalRows[0];
    if (
      canonicalRows.length !== 1 ||
      row?.id !== "default" ||
      typeof row.pinHash !== "string" ||
      !row.pinHash.trim() ||
      typeof row.secret !== "string" ||
      !row.secret.trim()
    ) {
      throw new Error("Invalid canonical auth state");
    }
    return { mode: AUTH_MODE_CONFIGURED, secret: row.secret };
  }

  // Both Setting values are required for the only supported legacy upgrade.
  const legacyRows = await dbRaw.$queryRaw<LegacyAuthRow[]>`
    SELECT "key", "value" FROM "Setting"
    WHERE "key" IN ('auth_secret', 'auth_pin_hash')
  `;
  const legacySecret = legacyRows.find((row) => row.key === "auth_secret")?.value;
  const legacyPin = legacyRows.find((row) => row.key === "auth_pin_hash")?.value;
  if (legacySecret === undefined && legacyPin === undefined) {
    return { mode: AUTH_MODE_SETUP };
  }
  if (
    typeof legacySecret !== "string" ||
    !legacySecret.trim() ||
    typeof legacyPin !== "string" ||
    !legacyPin.trim()
  ) {
    throw new Error("Invalid legacy auth upgrade state");
  }
  return { mode: AUTH_MODE_CONFIGURED, secret: legacySecret };
}

/**
 * Credentialed semantic readiness for the Tauri runtime supervisor. Readiness
 * proves the exact child, active database, and desktop-declared auth mode.
 */
export async function GET(request: Request) {
  const expectedToken = process.env.SF_RUNTIME_TOKEN;
  const instanceId = process.env.SF_RUNTIME_INSTANCE_ID;
  const runtimePort = process.env.SF_RUNTIME_PORT;
  const shopId = process.env.SF_ACTIVE_SHOP_ID;
  const registryRevision = process.env.SF_REGISTRY_REVISION;
  const migrationSetSha256 = process.env.SF_MIGRATION_SET_SHA256;
  const authMode = process.env[AUTH_MODE_ENV];
  const authSecret = process.env.AUTH_SECRET;

  if (
    !expectedToken ||
    !instanceId ||
    !runtimePort ||
    !shopId ||
    !registryRevision ||
    !/^[0-9a-f]{64}$/i.test(migrationSetSha256 ?? "") ||
    (authMode !== AUTH_MODE_SETUP && authMode !== AUTH_MODE_CONFIGURED) ||
    (authMode === AUTH_MODE_SETUP && !!authSecret) ||
    (authMode === AUTH_MODE_CONFIGURED && !authSecret)
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

  let databaseAuth: DatabaseAuthState;
  try {
    databaseAuth = await databaseAuthState();
  } catch {
    return NextResponse.json(
      {
        status: "blocked",
        code: "RUNTIME_AUTH_DATABASE_INVALID",
        checks: { app: "ready", database: "blocked", auth: "blocked" },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authMatches =
    databaseAuth.mode === authMode &&
    (databaseAuth.mode === AUTH_MODE_SETUP ||
      (!!authSecret && constantTimeEqual(databaseAuth.secret, authSecret)));
  if (!authMatches) {
    return NextResponse.json(
      {
        status: "blocked",
        code: "RUNTIME_AUTH_MISMATCH",
        checks: { app: "ready", database: "ready", auth: "blocked" },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    // DATABASE_URL is the exact path selected and migrated by the desktop.
    const { dbRaw } = await import("@/lib/db");
    await dbRaw.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json(
      {
        status: "blocked",
        code: "RUNTIME_DATABASE_NOT_READY",
        checks: {
          app: "ready",
          database: "blocked",
          migration: "ready",
          auth: "ready",
        },
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
    authMode,
    checks: {
      app: "ready",
      database: "ready",
      migration: "ready",
      registry: "ready",
      shop: "ready",
      auth: "ready",
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
