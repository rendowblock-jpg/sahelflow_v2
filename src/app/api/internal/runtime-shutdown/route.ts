import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { constantTimeEqual } from "@/lib/auth/constant-time";
import { flushPackagedCompileCache } from "@/lib/runtime/compile-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SHUTDOWN_DIAGNOSTIC_FILE = "runtime-shutdown-diagnostic.json";

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

function summarizeCompileCache(root: string | undefined) {
  if (!root || !isAbsolute(root) || !existsSync(root)) return null;

  let fileCount = 0;
  let bytes = 0;
  const pending = [root];
  try {
    while (pending.length > 0) {
      const current = pending.pop() as string;
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const path = resolve(current, entry.name);
        if (entry.isDirectory()) pending.push(path);
        else if (entry.isFile()) {
          fileCount += 1;
          bytes += statSync(path).size;
        }
      }
    }
  } catch {
    return null;
  }

  return fileCount > 0 && bytes > 0 ? { fileCount, bytes } : null;
}

function recordShutdownDiagnostic(payload: unknown): boolean {
  const dataDir = process.env.SF_DATA_DIR;
  if (!dataDir || !isAbsolute(dataDir)) return false;

  const path = resolve(dataDir, SHUTDOWN_DIAGNOSTIC_FILE);
  const temporaryPath = `${path}.tmp`;
  let handle: number | undefined;
  try {
    mkdirSync(dirname(path), { recursive: true });
    handle = openSync(temporaryPath, "w", 0o600);
    writeFileSync(handle, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fsyncSync(handle);
    closeSync(handle);
    handle = undefined;
    rmSync(path, { force: true });
    renameSync(temporaryPath, path);
    return true;
  } catch {
    if (handle !== undefined) {
      try {
        closeSync(handle);
      } catch {
        // Preserve the original persistence failure.
      }
    }
    rmSync(temporaryPath, { force: true });
    return false;
  }
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

  const cache = summarizeCompileCache(process.env.NODE_COMPILE_CACHE);
  if (!cache) {
    return NextResponse.json(
      { status: "blocked", code: "RUNTIME_COMPILE_CACHE_EMPTY" },
      { status: 500, headers: noStoreHeaders },
    );
  }

  const appVersion = process.env.APP_VERSION;
  if (
    !appVersion ||
    !recordShutdownDiagnostic({
      formatVersion: 1,
      state: "flushed",
      code: "RUNTIME_COMPILE_CACHE_FLUSHED",
      instanceId: expectedInstanceId,
      appVersion,
      processId: process.pid,
      cacheFileCount: cache.fileCount,
      cacheBytes: cache.bytes,
      createdAtUnixSeconds: Math.floor(Date.now() / 1000),
    })
  ) {
    return NextResponse.json(
      { status: "blocked", code: "RUNTIME_SHUTDOWN_EVIDENCE_FAILED" },
      { status: 500, headers: noStoreHeaders },
    );
  }

  return NextResponse.json(
    { status: "flushed", instanceId: expectedInstanceId, cache },
    { status: 200, headers: noStoreHeaders },
  );
}
