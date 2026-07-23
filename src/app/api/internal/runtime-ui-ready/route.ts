import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { RUNTIME_COOKIE, RUNTIME_PROTOCOL_VERSION } from "@/lib/runtime-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

function unavailable() {
  return NextResponse.json(
    { status: "blocked", code: "RUNTIME_UI_READY_UNAVAILABLE" },
    { status: 503, headers: noStoreHeaders() },
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  const expectedToken = process.env.SF_RUNTIME_APP_TOKEN;
  const instanceId = process.env.SF_RUNTIME_INSTANCE_ID;
  const appVersion = process.env.APP_VERSION;
  const dataDir = process.env.SF_DATA_DIR;
  const configuredAckPath = process.env.SF_RUNTIME_UI_READY_PATH;

  if (
    !loopback ||
    !expectedToken ||
    !/^[0-9a-f]{64}$/i.test(expectedToken) ||
    !instanceId ||
    !/^[0-9a-f]{32}$/i.test(instanceId) ||
    !appVersion ||
    !dataDir ||
    !configuredAckPath
  ) {
    return unavailable();
  }

  const ackPath = resolve(configuredAckPath);
  const canonicalAckPath = resolve(dataDir, "runtime-ui-ready.json");
  if (ackPath !== canonicalAckPath) {
    return unavailable();
  }

  const suppliedToken = (await cookies()).get(RUNTIME_COOKIE)?.value ?? "";
  if (!/^[0-9a-f]{64}$/i.test(suppliedToken) || !constantTimeEqual(suppliedToken, expectedToken)) {
    return NextResponse.json(
      { status: "rejected", code: "RUNTIME_SESSION_REQUIRED" },
      { status: 401, headers: noStoreHeaders() },
    );
  }

  const acknowledgment = {
    formatVersion: 1,
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    state: "ready",
    instanceId,
    processId: process.pid,
    appVersion,
    pageUrl: url.origin,
    createdAtUnixSeconds: Math.floor(Date.now() / 1000),
  };

  const parent = dirname(ackPath);
  const temporaryPath = `${ackPath}.tmp`;
  let handle: number | undefined;
  try {
    mkdirSync(parent, { recursive: true });
    handle = openSync(temporaryPath, "w", 0o600);
    writeFileSync(handle, `${JSON.stringify(acknowledgment, null, 2)}\n`, "utf8");
    fsyncSync(handle);
    closeSync(handle);
    handle = undefined;
    if (existsSync(ackPath)) {
      rmSync(ackPath, { force: true });
    }
    renameSync(temporaryPath, ackPath);
  } catch {
    if (handle !== undefined) {
      try {
        closeSync(handle);
      } catch {
        // Best-effort close; the response remains fail-closed.
      }
    }
    rmSync(temporaryPath, { force: true });
    return NextResponse.json(
      { status: "blocked", code: "RUNTIME_UI_READY_PERSIST_FAILED" },
      { status: 500, headers: noStoreHeaders() },
    );
  }

  return NextResponse.json(
    { status: "ready", instanceId },
    { status: 200, headers: noStoreHeaders() },
  );
}
