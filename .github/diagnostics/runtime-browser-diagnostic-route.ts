import { appendFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { constantTimeEqual } from "@/lib/auth/constant-time";
import { RUNTIME_COOKIE } from "@/lib/runtime-auth";

const MAX_BODY_BYTES = 2_048;
const MAX_EVIDENCE_BYTES = 64 * 1_024;
const EVIDENCE_FILE = "runtime-browser-diagnostic.jsonl";
const STAGES = new Set([
  "initialization-script",
  "javascript-error",
  "unhandled-rejection",
  "dom-content-loaded",
  "react-root-present",
  "react-root-empty",
  "window-load",
  "ui-ready-request",
  "ui-ready-response",
  "ui-ready-fetch-error",
]);

function safeText(value: unknown, limit: number): string {
  return String(value ?? "")
    .replace(/[\r\n\0]/g, " ")
    .slice(0, limit);
}

export async function POST(request: NextRequest) {
  const loopback =
    request.nextUrl.hostname === "127.0.0.1" || request.nextUrl.hostname === "localhost";
  const dataDir = process.env.SF_DATA_DIR;
  if (process.env.SF_RUNTIME_DIAGNOSTICS !== "1" || !loopback || !dataDir) {
    return NextResponse.json({ status: "disabled" }, { status: 404 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ status: "rejected" }, { status: 413 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ status: "rejected" }, { status: 400 });
  }
  const stage = safeText(payload.stage, 64);
  if (!STAGES.has(stage)) {
    return NextResponse.json({ status: "rejected" }, { status: 400 });
  }

  const expected = process.env.SF_RUNTIME_APP_TOKEN;
  const supplied = request.cookies.get(RUNTIME_COOKIE)?.value;
  const cookieMatches = Boolean(expected && supplied && constantTimeEqual(supplied, expected));
  const evidencePath = resolve(dataDir, EVIDENCE_FILE);
  mkdirSync(dirname(evidencePath), { recursive: true });
  try {
    if (statSync(evidencePath).size >= MAX_EVIDENCE_BYTES) {
      return NextResponse.json({ status: "bounded" }, { status: 507 });
    }
  } catch {
    // The first bounded event creates the evidence file below.
  }

  appendFileSync(
    evidencePath,
    `${JSON.stringify({
      capturedAt: new Date().toISOString(),
      stage,
      path: safeText(payload.path, 256),
      errorName: safeText(payload.errorName, 64),
      message: safeText(payload.message, 512),
      status: Number.isInteger(payload.status) ? payload.status : null,
      runtimeCookiePresent: Boolean(supplied),
      runtimeCookieMatches: cookieMatches,
    })}\n`,
    { encoding: "utf8" },
  );

  return NextResponse.json(
    { status: "recorded" },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
