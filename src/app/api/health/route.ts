import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — lightweight health check endpoint.
 *
 * Returns 200 if the app is running and the database is reachable.
 * Used by Tauri (process liveness), Docker/K8s (health probes), and
 * monitoring tools.
 *
 * Does NOT check external services (Gemini, delivery APIs, sidecar) —
 * those are checked by /api/health/deep (future).
 */
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {
    app: "ok",
  };

  try {
    const { db } = await import("@/lib/db");
    await db.setting.count();
    checks.db = "ok";
  } catch {
    checks.db = "fail";
  }

  const allOk = Object.values(checks).every((value) => value === "ok");
  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      checks,
      version: env.appVersion,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
