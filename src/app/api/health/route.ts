import { NextResponse } from "next/server";

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

  // Check DB
  try {
    const { db } = await import("@/lib/db");
    await db.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {
    checks.db = "fail";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      checks,
      version: process.env.npm_package_version ?? process.env.npm_package_version ?? "3.1.0",
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
