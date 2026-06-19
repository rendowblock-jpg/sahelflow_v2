import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { dispatch } from "@/lib/agents/orchestrator";
import { timingSafeEqual } from "@/lib/validation";
import { randomUUID } from "crypto";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

/**
 * POST /api/webhooks/retry
 *
 * Processes pending webhook retry events from the webhook_retry_queue table.
 * Called by Vercel Cron (schedule in vercel.json).
 *
 * Flow:
 *  1. SELECT pending events WHERE next_retry_at <= now() LIMIT 10
 *  2. Claim the selected events with a run-owned claim token (claimed_by)
 *  3. For each claimed event: dispatch → mark completed or backoff
 *  3. Exponential backoff: next_retry_at = now() + (attempts^2 * 30 seconds)
 */

// ===== Shared retry/backoff helper =====

async function processRetryEvent(
  supabase: SupabaseClient,
  event: { id: string; attempts: number; max_attempts: number },
  dispatchFn: () => Promise<unknown>,
): Promise<"completed" | "failed" | "dead_letter"> {
  try {
    await dispatchFn();

    await supabase
      .from("webhook_retry_queue")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        locked_until: null,
      })
      .eq("id", event.id);

    return "completed";
  } catch (err) {
    const newAttempts = event.attempts + 1;
    const errMsg = err instanceof Error ? err.message : "Unknown error";

    if (newAttempts >= event.max_attempts) {
      await supabase
        .from("webhook_retry_queue")
        .update({
          status: "dead_letter",
          attempts: newAttempts,
          error: errMsg,
          locked_until: null,
        })
        .eq("id", event.id);
      return "dead_letter";
    }

    const backoffMs = newAttempts * newAttempts * 30 * 1000;
    await supabase
      .from("webhook_retry_queue")
      .update({
        status: "pending",
        attempts: newAttempts,
        error: errMsg,
        next_retry_at: new Date(Date.now() + backoffMs).toISOString(),
        locked_until: null,
      })
      .eq("id", event.id);
    return "failed";
  }
}

async function markDeadLetter(
  supabase: SupabaseClient,
  eventId: string,
  attempts: number,
  error: string,
) {
  await supabase
    .from("webhook_retry_queue")
    .update({ status: "dead_letter", attempts: attempts + 1, error, locked_until: null })
    .eq("id", eventId);
}

// ===== Main handler =====

// Vercel Cron sends GET requests. Alias to POST so the cron can drain the queue.
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  // Rate limit cron endpoint
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const rl = rateLimit(`webhook-retry:${ip}`, 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.log(JSON.stringify({ type: "retry_processor", action: "config_missing", message: "CRON_SECRET is not configured" }));
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const provided =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace("Bearer ", "") ||
    "";
  if (!timingSafeEqual(provided, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(JSON.stringify({ type: "retry_processor", action: "config_missing", message: "SUPABASE_SERVICE_ROLE_KEY missing" }));
    return NextResponse.json({ error: "Service unavailable" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const nowIso = new Date().toISOString();
  const runId = randomUUID();
  const lockMs = 5 * 60 * 1000;
  const lockedUntilIso = new Date(Date.now() + lockMs).toISOString();

  // Recover stale processing rows (worker crashed / timed out before completion).
  // These rows become claimable again by setting them back to pending.
  await supabase
    .from("webhook_retry_queue")
    .update({
      status: "pending",
      claimed_by: null,
      claimed_at: null,
      locked_until: null,
    })
    .eq("status", "processing")
    .lt("locked_until", nowIso);

  // Claim events with a run-owned token (claimed_by) so concurrent runs
  // cannot process each other's claimed rows.
  const { data: events, error: fetchError } = await supabase
    .from("webhook_retry_queue")
    .select("id")
    .eq("status", "pending")
    .lte("next_retry_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(10);

  if (fetchError) {
    console.log(JSON.stringify({ type: "retry_processor", action: "fetch_error", error: fetchError.message }));
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }

  if (!events || events.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const eventIds = events.map((e) => e.id);
  const { error: claimError } = await supabase
    .from("webhook_retry_queue")
    .update({
      status: "processing",
      claimed_by: runId,
      claimed_at: nowIso,
      locked_until: lockedUntilIso,
    })
    .in("id", eventIds)
    .eq("status", "pending"); // Only claim if still pending (prevents races)

  if (claimError) {
    console.log(JSON.stringify({ type: "retry_processor", action: "claim_error", error: claimError.message }));
    return NextResponse.json({ error: "Claim failed" }, { status: 500 });
  }

  // Only process events we actually claimed.
  const { data: claimedEvents, error: claimedError } = await supabase
    .from("webhook_retry_queue")
    .select("*")
    .eq("claimed_by", runId)
    .eq("status", "processing")
    .order("created_at", { ascending: true });

  if (claimedError || !claimedEvents || claimedEvents.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      note: "no_events_claimed",
    });
  }

  let processed = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const event of claimedEvents) {
    const payload = event.payload as Record<string, unknown>;

    if (event.event_type === "message.received" && event.seller_id) {
      const conversationId = payload.conversationId as string | undefined;
      const messageId = payload.platformMessageId as string | undefined;

      // Idempotency check — has this message already been processed?
      if (messageId) {
        const { data: existing } = await supabase
          .from("messages")
          .select("id")
          .eq("platform_message_id", messageId)
          .limit(1)
          .single();

        if (existing) {
          await supabase
            .from("webhook_retry_queue")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              locked_until: null,
            })
            .eq("id", event.id);
          processed++;
          continue;
        }
      }

      if (!conversationId) {
        await markDeadLetter(
          supabase,
          event.id,
          event.attempts,
          "Missing conversationId",
        );
        deadLettered++;
        continue;
      }

      const result = await processRetryEvent(supabase, event, () =>
        dispatch({
          type: "message.received",
          conversationId,
          sellerId: event.seller_id,
        }),
      );
      if (result === "completed") processed++;
      else if (result === "dead_letter") deadLettered++;
      else failed++;
    } else if (event.event_type === "order.created" && event.seller_id) {
      const orderId = payload.orderId as string | undefined;

      if (!orderId) {
        await markDeadLetter(
          supabase,
          event.id,
          event.attempts,
          "Missing orderId",
        );
        deadLettered++;
        continue;
      }

      const result = await processRetryEvent(supabase, event, () =>
        dispatch({ type: "order.created", orderId, sellerId: event.seller_id }),
      );
      if (result === "completed") processed++;
      else if (result === "dead_letter") deadLettered++;
      else failed++;
    } else if (event.event_type === "message.ai_pending") {
      const conversationId = payload.conversationId as string | undefined;
      const sellerId = payload.sellerId as string | undefined;

      if (!conversationId || !sellerId) {
        await markDeadLetter(
          supabase,
          event.id,
          event.attempts,
          "Missing conversationId or sellerId",
        );
        deadLettered++;
        continue;
      }

      const result = await processRetryEvent(supabase, event, () =>
        dispatch({ type: "message.received", conversationId, sellerId }),
      );
      if (result === "completed") processed++;
      else if (result === "dead_letter") deadLettered++;
      else failed++;
    } else {
      await markDeadLetter(
        supabase,
        event.id,
        event.attempts,
        `Unknown event_type: ${event.event_type}`,
      );
      deadLettered++;
    }
  }

  console.log(
    JSON.stringify({
      type: "retry_processor",
      action: "batch_complete",
      total: events.length,
      processed,
      failed,
      deadLettered,
    }),
  );

  return NextResponse.json({
    ok: true,
    total: events.length,
    processed,
    failed,
    deadLettered,
  });
}
