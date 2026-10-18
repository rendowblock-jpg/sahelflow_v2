import "server-only";

import { readFileSync } from "node:fs";
import type { NextRequest } from "next/server";

import {
  SIDECAR_TOKEN_MIN_LENGTH,
  sidecarBearerMatches,
} from "@/lib/auth/sidecar-bearer";
import { env } from "@/lib/env";

function resolveExpectedRestToken(): string | undefined {
  const fromEnv = env.sidecarToken;
  if (fromEnv && fromEnv.length >= SIDECAR_TOKEN_MIN_LENGTH) return fromEnv;
  try {
    const fromFile = readFileSync(env.sidecarTokenFile, "utf8").trim();
    if (fromFile.length >= SIDECAR_TOKEN_MIN_LENGTH) return fromFile;
  } catch {
    // The sidecar may not have published its token yet.
  }
  return undefined;
}

/**
 * The one route-side check for the sidecar's private callbacks (inbound and
 * message-status). The comparison itself lives in sidecarBearerMatches, shared
 * with the proxy.
 */
export function authenticateWhatsAppSidecar(request: NextRequest): boolean {
  return sidecarBearerMatches(
    request.headers.get("authorization"),
    resolveExpectedRestToken(),
  );
}
