import "server-only";

import { readFileSync } from "node:fs";
import type { NextRequest } from "next/server";

import { constantTimeEqual } from "@/lib/auth/constant-time";
import { env } from "@/lib/env";

function resolveExpectedRestToken(): string | undefined {
  const fromEnv = env.sidecarToken;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  try {
    const fromFile = readFileSync(env.sidecarTokenFile, "utf8").trim();
    if (fromFile.length >= 16) return fromFile;
  } catch {
    // The sidecar may not have published its token yet.
  }
  return undefined;
}

export function authenticateWhatsAppSidecar(request: NextRequest): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  const expected = resolveExpectedRestToken();
  return Boolean(
    match?.[1] && expected && constantTimeEqual(match[1], expected),
  );
}
