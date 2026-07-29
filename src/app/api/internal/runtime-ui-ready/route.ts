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
import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { flushPackagedCompileCache } from "@/lib/runtime/compile-cache";
import { RUNTIME_COOKIE, RUNTIME_PROTOCOL_VERSION } from "@/lib/runtime-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UI_DIAGNOSTIC_FILE = "runtime-ui-diagnostic.json";
const DEFAULT_LOCALE = "fr";
let uiReadyAttempt = 0;

function runtimeLocale(request: NextRequest): "ar" | "fr" | "en" {
  const locale = request.cookies.get("sahelflow-locale")?.value;
  return locale === "ar" || locale === "en" || locale === "fr"
    ? locale
    : DEFAULT_LOCALE;
}

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

function writeJsonAtomically(path: string, payload: unknown) {
  const parent = dirname(path);
  const temporaryPath = `${path}.tmp`;
  let handle: number | undefined;
  try {
    mkdirSync(parent, { recursive: true });
    handle = openSync(temporaryPath, "w", 0o600);
    writeFileSync(handle, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fsyncSync(handle);
    closeSync(handle);
    handle = undefined;
    if (existsSync(path)) {
      rmSync(path, { force: true });
    }
    renameSync(temporaryPath, path);
  } catch (error) {
    if (handle !== undefined) {
      try {
        closeSync(handle);
      } catch {
        // Preserve the original persistence failure.
      }
    }
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function recordUiDiagnostic(
  dataDir: string | undefined,
  payload: {
    state: "received" | "blocked" | "ready";
    code: string;
    attempt: number;
    instanceId?: string;
    appVersion?: string;
  },
) {
  if (!dataDir) return false;
  try {
    writeJsonAtomically(resolve(dataDir, UI_DIAGNOSTIC_FILE), {
      formatVersion: 1,
      ...payload,
      processId: process.pid,
      createdAtUnixSeconds: Math.floor(Date.now() / 1000),
    });
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const attempt = ++uiReadyAttempt;
  const url = request.nextUrl;
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  const expectedToken = process.env.SF_RUNTIME_APP_TOKEN;
  const instanceId = process.env.SF_RUNTIME_INSTANCE_ID;
  const appVersion = process.env.APP_VERSION;
  const dataDir = process.env.SF_DATA_DIR;

  if (
    !loopback ||
    !expectedToken ||
    !/^[0-9a-f]{64}$/i.test(expectedToken) ||
    !instanceId ||
    !/^[0-9a-f]{32}$/i.test(instanceId) ||
    !appVersion ||
    !dataDir
  ) {
    recordUiDiagnostic(dataDir, {
      state: "blocked",
      code: "RUNTIME_UI_READY_UNAVAILABLE",
      attempt,
      instanceId,
      appVersion,
    });
    return unavailable();
  }

  const ackPath = resolve(dataDir, "runtime-ui-ready.json");
  const suppliedToken = request.cookies.get(RUNTIME_COOKIE)?.value ?? "";
  if (!/^[0-9a-f]{64}$/i.test(suppliedToken) || !constantTimeEqual(suppliedToken, expectedToken)) {
    recordUiDiagnostic(dataDir, {
      state: "blocked",
      code: "RUNTIME_SESSION_REQUIRED",
      attempt,
      instanceId,
      appVersion,
    });
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
    locale: runtimeLocale(request),
    pageUrl: url.origin,
    createdAtUnixSeconds: Math.floor(Date.now() / 1000),
  };

  recordUiDiagnostic(dataDir, {
    state: "received",
    code: "RUNTIME_UI_READY_REQUEST_RECEIVED",
    attempt,
    instanceId,
    appVersion,
  });

  try {
    writeJsonAtomically(ackPath, acknowledgment);
  } catch {
    recordUiDiagnostic(dataDir, {
      state: "blocked",
      code: "RUNTIME_UI_READY_PERSIST_FAILED",
      attempt,
      instanceId,
      appVersion,
    });
    return NextResponse.json(
      { status: "blocked", code: "RUNTIME_UI_READY_PERSIST_FAILED" },
      { status: 500, headers: noStoreHeaders() },
    );
  }

  const diagnosticPersisted = recordUiDiagnostic(dataDir, {
    state: "ready",
    code: "RUNTIME_UI_READY_PERSISTED",
    attempt,
    instanceId,
    appVersion,
  });
  if (!diagnosticPersisted) {
    rmSync(ackPath, { force: true });
    return NextResponse.json(
      { status: "blocked", code: "RUNTIME_UI_DIAGNOSTIC_PERSIST_FAILED" },
      { status: 500, headers: noStoreHeaders() },
    );
  }

  // Readiness evidence is already durable. Persist the compile cache only after
  // the desktop can observe and reveal the authenticated workspace, so a slow
  // disk flush cannot extend either semantic runtime readiness or UI readiness.
  // The helper remains best-effort and never changes the acknowledgment result.
  flushPackagedCompileCache();

  return NextResponse.json(
    { status: "ready", instanceId },
    { status: 200, headers: noStoreHeaders() },
  );
}
