/**
 * SahelFlow Dead Letter Dashboard API
 * GET  → list dead-lettered webhook events
 * POST → retry or dismiss a dead letter event
 *
 * Uses service-role client because webhook_retry_queue has RLS enabled
 * with no user-facing policies (service-role only access by design).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "@/lib/validation";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key);
}

function requireAdmin(req: NextRequest): NextResponse | null {
  // Fail-closed: if no secret is configured, do not expose service-role endpoints publicly.
  const adminSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!adminSecret) {
    console.log(JSON.stringify({ type: "dead_letters", action: "config_missing", message: "ADMIN_SECRET/CRON_SECRET is not configured" }));
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const provided =
    req.headers.get("x-admin-secret") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace("Bearer ", "") ||
    "";

  if (!timingSafeEqual(provided, adminSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    // Rate limit admin endpoint
    const ip = req.headers.get("x-forwarded-for") || "anonymous";
    const rl = rateLimit(`dead-letters:${ip}`, 30, 60000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const authError = requireAdmin(req);
    if (authError) return authError;

    const supabase = getServiceSupabase();
    if (!supabase) {
      return NextResponse.json({ events: [], error: "Service role not configured" });
    }

    const { data, error } = await supabase
      .from("webhook_retry_queue")
      .select("id, event_type, error, attempts, max_attempts, created_at")
      .eq("status", "dead_letter")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.log(JSON.stringify({ type: "dead_letters", action: "fetch_error", error: error.message }));
      return NextResponse.json({ events: [] });
    }

    return NextResponse.json({ events: data || [] });
  } catch {
    return NextResponse.json({ events: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit admin endpoint
    const ip = req.headers.get("x-forwarded-for") || "anonymous";
    const rl = rateLimit(`dead-letters:${ip}`, 30, 60000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const authError = requireAdmin(req);
    if (authError) return authError;

    const body = await req.json();
    const { action, id } = body;

    if (!id || !action) {
      return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
    }

    if (action === "retry") {
      // Reset to pending for re-processing
      const { error } = await supabase
        .from("webhook_retry_queue")
        .update({
          status: "pending",
          attempts: 0,
          next_retry_at: new Date().toISOString(),
          claimed_by: null,
          claimed_at: null,
          locked_until: null,
        })
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "dismiss") {
      const { error } = await supabase
        .from("webhook_retry_queue")
        .update({
          status: "dismissed",
          claimed_by: null,
          claimed_at: null,
          locked_until: null,
        })
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
