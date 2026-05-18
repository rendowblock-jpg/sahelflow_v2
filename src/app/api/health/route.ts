import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { timingSafeEqual } from "@/lib/validation";

/**
 * GET /api/health
 * Comprehensive health check — tests DB, Evolution API, and Groq.
 * Use with a free cron service (e.g. cron-job.org) to ping every 6 days
 * and prevent Supabase free-tier from pausing.
 */
export const GET = withAuthAndRateLimit(
  async (req) => {
    const healthSecret = process.env.HEALTH_SECRET;
    const token =
      req.headers.get("authorization")?.replace("Bearer ", "") ?? "";

    const checks: Record<
      string,
      { status: string; latency?: number; error?: string }
    > = {};

    // 1. Database check — always run regardless of secret
    try {
      const start = Date.now();
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      const { error } = await supabase.from("sellers").select("id").limit(1);
      checks.database = {
        status: error ? "error" : "ok",
        latency: Date.now() - start,
        ...(error && { error: error.message }),
      };
    } catch (e) {
      checks.database = { status: "error", error: (e as Error).message };
    }

    // Secret gates the detailed multi-service response
    if (!healthSecret || !timingSafeEqual(token, healthSecret)) {
      return NextResponse.json(
        {
          status: checks.database.status === "ok" ? "ok" : "error",
          checks: { database: checks.database },
        },
        { status: checks.database.status === "ok" ? 200 : 503 },
      );
    }

    // 2. Evolution API check
    try {
      const url = process.env.EVOLUTION_API_URL;
      if (!url) {
        checks.evolution = { status: "not_configured" };
      } else {
        const start = Date.now();
        const res = await fetch(`${url}/instance/fetchInstances`, {
          method: "GET",
          headers: {
            apikey: process.env.EVOLUTION_API_KEY || "",
          },
          signal: AbortSignal.timeout(5000),
        });
        checks.evolution = {
          status: res.ok ? "ok" : "error",
          latency: Date.now() - start,
          ...(!res.ok && { error: `HTTP ${res.status}` }),
        };
      }
    } catch (e) {
      checks.evolution = { status: "error", error: (e as Error).message };
    }

    // 3. Groq check
    try {
      const key = process.env.GROQ_API_KEY;
      if (!key) {
        checks.groq = { status: "not_configured" };
      } else {
        const res = await fetch("https://api.groq.com/openai/v1/models", {
          headers: {
            Authorization: `Bearer ${key}`,
          },
          signal: AbortSignal.timeout(5000),
        });
        checks.groq = {
          status: res.ok ? "ok" : "error",
          ...(!res.ok && { error: `HTTP ${res.status}` }),
        };
      }
    } catch (e) {
      checks.groq = { status: "error", error: (e as Error).message };
    }

    // Overall status
    const allOk = Object.values(checks).every(
      (c) => c.status === "ok" || c.status === "not_configured",
    );

    return NextResponse.json(
      {
        status: allOk ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        version: "2.0.0",
        checks,
      },
      { status: allOk ? 200 : 503 },
    );
  },
  { requireAuth: false, rateLimitConfig: { maxRequests: 2, windowMs: 60000 } },
);
