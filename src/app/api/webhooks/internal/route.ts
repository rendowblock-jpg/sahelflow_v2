import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { dispatch } from "@/lib/agents/orchestrator";
import { internalWebhookSchema, timingSafeEqual } from "@/lib/validation";
import { rateLimit, rateLimitHeaders, getClientIP } from "@/lib/rate-limit";

/**
 * Structured logger — no full error objects leaked to stdout in production.
 */
function webhookLog(
	level: "error" | "warn" | "info",
	action: string,
	meta?: Record<string, unknown>,
) {
	console.log(JSON.stringify({ type: "webhook", level, action, ...meta }));
}

/**
 * Queue a failed dispatch event for automatic retry.
 * Uses ON CONFLICT to ensure idempotency — duplicate keys are silently ignored.
 */
async function queueForRetry(
	eventType: string,
	payload: Record<string, unknown>,
	sellerId: string,
	idempotencyKey: string,
) {
	if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

	const supabase = createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY,
	);

	try {
		await supabase.from("webhook_retry_queue").insert({
			idempotency_key: idempotencyKey,
			event_type: eventType,
			payload,
			seller_id: sellerId,
		});
	} catch (insertErr: unknown) {
		const errMsg =
			insertErr instanceof Error ? insertErr.message : "Unknown insert error";
		// Silently ignore duplicate key violations (idempotency working as designed)
		if (!errMsg.includes("duplicate") && !errMsg.includes("unique")) {
			webhookLog("warn", "retry_queue_insert_failed", { error: errMsg });
		}
	}
}

/**
 * POST /api/webhooks/internal
 * Internal Webhook endpoint to trigger AI Agents asynchronously.
 * Called by the public checkout page or internal services without requiring Auth blocks.
 */
export async function POST(req: NextRequest) {
	try {
		// Rate limiting — 60 requests per minute per IP
		const ip = getClientIP(req); // S13 fix: spoofing-resistant IP
		const rl = await rateLimit(`internal:${ip}`, 60, 60000);
		if (!rl.allowed) {
			return NextResponse.json(
				{ error: "Too many requests" },
				{ status: 429, headers: rateLimitHeaders(rl) },
			);
		}

		const body = await req.json();

		// Validate internal secret — reject ALL requests if env var is missing
		const internalSecret = process.env.INTERNAL_WEBHOOK_SECRET;
		if (!internalSecret) {
			return NextResponse.json(
				{ error: "Service unavailable" },
				{ status: 503 },
			);
		}
		const provided = req.headers.get("x-internal-secret");
		if (!provided || !timingSafeEqual(provided, internalSecret)) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const parsed = internalWebhookSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json(
				{
					error: "Invalid request",
					details: parsed.error.issues.map((i) => i.message),
				},
				{ status: 400 },
			);
		}

		const { type, orderId, sellerId, conversationId } = parsed.data;

		if (type === "order.created" && orderId && sellerId) {
			webhookLog("info", "dispatch_order", { orderId, sellerId });
			try {
				await dispatch({ type: "order.created", orderId, sellerId });
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : "Unknown error";
				webhookLog("warn", "order_dispatch_retry", { orderId, error: errMsg });
				await queueForRetry(
					"order.created",
					{ orderId, sellerId },
					sellerId,
					`order:${orderId}`,
				);
			}
		} else if (type === "message.received" && conversationId && sellerId) {
			webhookLog("info", "dispatch_message", { conversationId, sellerId });
			try {
				await dispatch({ type: "message.received", conversationId, sellerId });
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : "Unknown error";
				webhookLog("warn", "message_dispatch_retry", {
					conversationId,
					error: errMsg,
				});
				await queueForRetry(
					"message.received",
					{ conversationId, sellerId },
					sellerId,
					`conv:${conversationId}`,
				);
			}
		} else {
			return NextResponse.json(
				{ error: "Invalid event payload" },
				{ status: 400 },
			);
		}

		return NextResponse.json({ ok: true, message: "Dispatched to orchestrator" }); // L15 fix: was msg, now message (consistent with other routes)
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		webhookLog("error", "top_level_error", { error: message });
		return NextResponse.json({ error: "Internal error" }, { status: 500 });
	}
}
