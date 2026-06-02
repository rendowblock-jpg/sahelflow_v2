import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { findExistingOrderByExternalId } from "@/lib/data/order-service";
import {
	verifyShopifyHmac,
	verifyWooCommerceHmac,
	verifyYouCanHmac,
	detectPlatform,
} from "@/lib/webhook-verify";
import { dispatch } from "@/lib/agents/orchestrator";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	let detectedPlatform: "shopify" | "woocommerce" | "youcan" | "custom" | null =
		null;
	try {
		const { token } = await params;

		// Rate limiting — 30 requests per minute per token
		const rl = await rateLimit(`webhook:${token}`, 30, 60000);
		if (!rl.allowed) {
			return NextResponse.json(
				{ error: "Too many requests" },
				{ status: 429, headers: rateLimitHeaders(rl) },
			);
		}

		const rawBody = await request.text();

		// Test mode — just respond OK
		if (request.headers.get("X-SahelFlow-Test") === "true") {
			return NextResponse.json({ success: true, test: true });
		}

		// Detect platform from headers BEFORE parsing body
		detectedPlatform = detectPlatform(request.headers);

		let body: Record<string, unknown>;
		try {
			body = JSON.parse(rawBody);
		} catch {
			return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
		}

		// Fallback: detect platform from payload shape if headers didn't match
		if (!detectedPlatform) {
			detectedPlatform = detectPlatform(request.headers, body);
		}

		// Final fallback for webhooks without recognizable headers/shape
		if (!detectedPlatform) {
			detectedPlatform = "custom";
		}

		// Use service role client as this is a server-to-server webhook request (unauthenticated by user bounds)
		const supabase = createClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.SUPABASE_SERVICE_ROLE_KEY!,
		);

		// Look up seller by token
		const { data: seller, error: sellerError } = await supabase
			.from("sellers")
			.select("id, webhook_token, webhook_orders_count")
			.eq("webhook_token", token)
			.single();

		if (!seller || sellerError) {
			return NextResponse.json({ error: "Invalid token" }, { status: 401 });
		}

		// ===== PLATFORM-SPECIFIC SIGNATURE VERIFICATION =====
		// Shopify HMAC verification
		const shopifyHmac = request.headers.get("X-Shopify-Hmac-Sha256");
		if (shopifyHmac) {
			const SHOPIFY_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
			if (
				!SHOPIFY_SECRET ||
				!verifyShopifyHmac(rawBody, shopifyHmac, SHOPIFY_SECRET)
			) {
				return NextResponse.json(
					{ error: "Invalid HMAC signature" },
					{ status: 401 },
				);
			}
		}

		// WooCommerce HMAC verification (if signature header present)
		const wcSignature = request.headers.get("X-WC-Webhook-Signature");
		if (wcSignature || detectedPlatform === "woocommerce") {
			const { data: wcIntegration } = await supabase
				.from("integrations")
				.select("credentials")
				.eq("seller_id", seller.id)
				.eq("platform", "woocommerce")
				.eq("is_active", true)
				.maybeSingle();

			const wcSecret = wcIntegration?.credentials?.webhook_secret as
				| string
				| undefined;
			if (!wcSecret || !wcSignature || !verifyWooCommerceHmac(rawBody, wcSignature, wcSecret)) {
				await supabase.from("agent_activity").insert({
					seller_id: seller.id,
					type: "alert",
					title: "WooCommerce Webhook Signature Failed",
					description: !wcSecret
						? "WooCommerce integration is active but webhook_secret is not configured."
						: !wcSignature
						? "WooCommerce signature header is missing."
						: "WooCommerce webhook signature verification failed.",
					metadata: { platform: "woocommerce", has_secret: !!wcSecret, has_signature: !!wcSignature }
				});

				return NextResponse.json(
					{ error: "Invalid WooCommerce signature" },
					{ status: 401 },
				);
			}
		}

		// YouCan HMAC verification (if signature header present)
		const youcanSignature = request.headers.get("x-youcan-signature");
		if (youcanSignature || detectedPlatform === "youcan") {
			const { data: youcanIntegration } = await supabase
				.from("integrations")
				.select("credentials")
				.eq("seller_id", seller.id)
				.eq("platform", "youcan")
				.eq("is_active", true)
				.maybeSingle();

			const youcanSecret = youcanIntegration?.credentials?.webhook_secret as
				| string
				| undefined;
			if (!youcanSecret || !youcanSignature || !verifyYouCanHmac(rawBody, youcanSignature, youcanSecret)) {
				await supabase.from("agent_activity").insert({
					seller_id: seller.id,
					type: "alert",
					title: "YouCan Webhook Signature Failed",
					description: !youcanSecret
						? "YouCan integration is active but webhook_secret is not configured."
						: !youcanSignature
						? "YouCan signature header is missing."
						: "YouCan webhook signature verification failed.",
					metadata: { platform: "youcan", has_secret: !!youcanSecret, has_signature: !!youcanSignature }
				});

				return NextResponse.json(
					{ error: "Invalid YouCan signature" },
					{ status: 401 },
				);
			}
		}

		// Extract platform event ID for deduplication (prevents duplicate processing on retries)
		let platformEventId: string | null = null;
		if (detectedPlatform === "shopify") {
			platformEventId = request.headers.get("X-Shopify-Event-Id");
		} else if (detectedPlatform === "woocommerce") {
			platformEventId = request.headers.get("X-WC-Webhook-Delivery-ID");
		} else if (detectedPlatform === "youcan") {
			// YouCan doesn't send an event-id header; use the order id from payload
			platformEventId = body.id ? String(body.id) : null;
		}

		const webhookTopic =
			request.headers.get("X-Shopify-Topic") ||
			request.headers.get("X-WC-Webhook-Topic") ||
			null;

		// Deduplicate by event ID atomically by attempting to insert first
		if (platformEventId) {
			const { error: insertError } = await supabase
				.from("webhook_events")
				.insert({
					seller_id: seller.id,
					platform: detectedPlatform,
					event_id: platformEventId,
					topic: webhookTopic,
				});

			if (insertError) {
				if (insertError.code === "23505") {
					return NextResponse.json({
						success: true,
						message: "Event already processed",
					});
				}
				console.error("[Webhook Deduplication] Failed to insert event ID:", insertError.message);
			}
		}

		// Normalize order data from various platforms
		const normalizedData = normalizeOrder(body, seller.id);
		if (!normalizedData) {
			return NextResponse.json(
				{ error: "Could not parse order data" },
				{ status: 400 },
			);
		}

		const { customer_info, order_data } = normalizedData;

		// 1. Deduplicate by external_id as secondary guard
		if (order_data.external_id) {
			const existingOrder = await findExistingOrderByExternalId(
				supabase,
				seller.id,
				order_data.external_id as string,
			);
			if (existingOrder) {
				// Still record the event so we don't re-check next time
				if (platformEventId) {
					try {
						await supabase.from("webhook_events").insert({
							seller_id: seller.id,
							platform: detectedPlatform,
							event_id: platformEventId,
							topic: webhookTopic,
						});
					} catch {
						/* ignore unique-violation race */
					}
				}
				return NextResponse.json({
					success: true,
					message: "Order already exists",
				});
			}
		}

		// 2. Atomically create order (customer upsert + stock check in one transaction)
		const { data: rpcResult, error: orderError } = await supabase.rpc(
			"atomic_create_order",
			{
				p_seller_id: seller.id,
				p_customer_name: customer_info.name || "",
				p_customer_phone: customer_info.phone || "",
				p_customer_wilaya: customer_info.wilaya || null,
				p_customer_commune: customer_info.commune || null,
				p_customer_address: customer_info.address || null,
				p_items: order_data.items,
				p_total_price: (order_data.total_price as number) || 0,
				p_delivery_cost: (order_data.delivery_cost as number) || 0,
				p_net_profit: (order_data.total_price as number) || 0,
				p_wilaya: (order_data.wilaya as string) || null,
				p_commune: (order_data.commune as string) || null,
				p_address: (order_data.address as string) || null,
				p_source: order_data.source as string,
				p_external_id: (order_data.external_id as string) || null,
				p_notes: (order_data.notes as string) || null,
				p_delivery_type: "home",
				p_status: "pending",
			},
		);
		if (orderError) throw orderError;

		// 2b. Auto-trigger Order Agent for risk assessment
		const createdOrderId = (rpcResult as Record<string, unknown>)?.order_id as
			| string
			| undefined;
		if (createdOrderId) {
			// Fire-and-forget: don't block webhook response on AI processing
			dispatch({
				type: "order.created",
				orderId: createdOrderId,
				sellerId: seller.id,
			}).catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				console.log(
					JSON.stringify({
						type: "webhook",
						action: "order_agent_dispatch_failed",
						error: msg,
						orderId: createdOrderId,
					}),
				);
			});
		}



		// 4. Update sync stats
		await supabase
			.from("sellers")
			.update({
				webhook_last_sync: new Date().toISOString(),
				webhook_orders_count: (seller.webhook_orders_count || 0) + 1,
			})
			.eq("id", seller.id);

		return NextResponse.json({ success: true });
	} catch (e: unknown) {
		const err = e instanceof Error ? e.message : "Unknown error";
		console.log(
			JSON.stringify({
				type: "webhook",
				action: "store_error",
				error: err,
				platform: detectedPlatform ?? "unknown",
			}),
		);
		return NextResponse.json({ error: "Internal error" }, { status: 500 });
	}
}

// GET — just return 200 so stores can verify the endpoint
export async function GET() {
	return NextResponse.json({ status: "ok", service: "SahelFlow Webhook" });
}

function normalizeOrder(
	body: Record<string, unknown>,
	sellerId: string,
): {
	customer_info: Record<string, string>;
	order_data: Record<string, unknown>;
} | null {
	try {
		// Shopify
		if (body.line_items && body.shipping_address) {
			const shipping = body.shipping_address as Record<string, unknown>;
			const customer = body.customer as Record<string, unknown>;
			const lineItems = body.line_items as Array<Record<string, unknown>>;

			return {
				customer_info: {
					name: `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim(),
					phone: (shipping.phone || customer?.phone || "") as string,
					wilaya: (shipping.province || shipping.city || "") as string,
					commune: (shipping.city || "") as string,
					address: `${shipping.address1 || ""} ${shipping.city || ""}`.trim(),
				},
				order_data: {
					seller_id: sellerId,
					status: "pending",
					source: "shopify",
					wilaya: (shipping.province || shipping.city || "") as string,
					commune: (shipping.city || "") as string,
					address: `${shipping.address1 || ""} ${shipping.city || ""}`.trim(),
					items: lineItems.map((item) => ({
						product_name: item.title, // Fixed to product_name
						quantity: item.quantity,
						unit_price: parseFloat(item.price as string) || 0, // Fixed to unit_price
					})),
					total_price: parseFloat(body.total_price as string) || 0,
					delivery_cost: Number(
						(body as { shipping?: { price?: number } }).shipping?.price ?? 0,
					),
					notes: `Shopify order #${body.order_number || ""}`,
					external_id: String(body.id),
				},
			};
		}

		// WooCommerce
		if (body.billing && body.line_items) {
			const billing = body.billing as Record<string, unknown>;
			const lineItems = body.line_items as Array<Record<string, unknown>>;

			return {
				customer_info: {
					name: `${billing.first_name || ""} ${billing.last_name || ""}`.trim(),
					phone: (billing.phone || "") as string,
					wilaya: (billing.state || billing.city || "") as string,
					commune: (billing.city || "") as string,
					address: `${billing.address_1 || ""} ${billing.city || ""}`.trim(),
				},
				order_data: {
					seller_id: sellerId,
					status: "pending",
					source: "woocommerce",
					wilaya: (billing.state || billing.city || "") as string,
					commune: (billing.city || "") as string,
					address: `${billing.address_1 || ""} ${billing.city || ""}`.trim(),
					items: lineItems.map((item) => ({
						product_name: item.name, // Fixed to product_name
						quantity: item.quantity,
						unit_price: parseFloat(item.price as string) || 0, // Fixed to unit_price
					})),
					total_price: parseFloat(body.total as string) || 0,
					delivery_cost: Number(
						(body as { shipping_total?: number }).shipping_total ?? 0,
					),
					notes: `WooCommerce order #${body.number || ""}`,
					external_id: String(body.id),
				},
			};
		}

		// YouCan
		if (body.variants && body.shipping && body.payment) {
			const variants = body.variants as Array<Record<string, unknown>>;
			const shipping = body.shipping as Record<string, unknown>;
			const shippingAddress = Array.isArray(shipping.address)
				? (shipping.address as Array<Record<string, unknown>>)[0]
				: null;
			const payment = body.payment as Record<string, unknown>;
			const paymentAddress = Array.isArray(payment.address)
				? (payment.address as Array<Record<string, unknown>>)[0]
				: null;

			const customerSource = shippingAddress || paymentAddress || {};

			let commune = "";
			if (customerSource.city && customerSource.state && customerSource.city !== customerSource.state) {
				commune = customerSource.city as string;
			}

			return {
				customer_info: {
					name: `${customerSource.name || ""}`.trim(),
					phone: (customerSource.phone || "") as string,
					wilaya: (customerSource.city || customerSource.state || "") as string,
					commune,
					address:
						`${customerSource.address || customerSource.address_1 || ""} ${customerSource.city || ""}`.trim(),
				},
				order_data: {
					seller_id: sellerId,
					status: "pending",
					source: "youcan",
					wilaya: (customerSource.city || customerSource.state || "") as string,
					commune,
					address:
						`${customerSource.address || customerSource.address_1 || ""} ${customerSource.city || ""}`.trim(),
					items: variants.map((v) => {
						const variant = (v.variant || {}) as Record<string, unknown>;
						const product = (variant.product || {}) as Record<string, unknown>;
						return {
							product_name: product.name || "Product",
							quantity: Number(v.quantity || 1),
							unit_price: Number(v.price || product.price || 0),
						};
					}),
					total_price: Number(body.total || 0),
					delivery_cost: Number((shipping as { price?: number }).price ?? 0),
					notes: `YouCan order #${body.ref || body.id || ""}`,
					external_id: String(body.id),
				},
			};
		}

		// Custom / Generic SahelFlow format
		if (body.customer_name || body.phone) {
			return {
				customer_info: {
					name: (body.customer_name || "") as string,
					phone: (body.phone || "") as string,
					wilaya: (body.wilaya || "") as string,
					commune: (body.commune || "") as string,
					address: (body.address || "") as string,
				},
				order_data: {
					seller_id: sellerId,
					status: "pending",
					source: "custom",
					wilaya: (body.wilaya || "") as string,
					commune: (body.commune || "") as string,
					address: (body.address || "") as string,
					items: (body.items as Array<Record<string, unknown>>) || [],
					total_price: (body.total || 0) as number,
					notes: (body.notes || "") as string,
					external_id: body.id ? String(body.id) : undefined,
				},
			};
		}

		return null;
	} catch {
		return null;
	}
}
