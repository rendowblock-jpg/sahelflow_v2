/**
 * Webhook Signature Verification Utilities
 * Shopify HMAC-SHA256 + WooCommerce HMAC-SHA256 + YouCan HMAC-SHA256
 */

import { createHmac, timingSafeEqual as nodeTimingSafeEqual } from "crypto";

/** Verify Shopify HMAC-SHA256 signature (base64 digest) */
export function verifyShopifyHmac(
	body: string,
	hmacHeader: string,
	secret: string,
): boolean {
	const computed = createHmac("sha256", secret)
		.update(body, "utf8")
		.digest("base64");
	const a = Buffer.from(computed, "utf8");
	const b = Buffer.from(hmacHeader, "utf8");
	if (a.length !== b.length) return false;
	return nodeTimingSafeEqual(a, b);
}

/** Verify WooCommerce HMAC-SHA256 signature (hex digest, X-WC-Webhook-Signature) */
export function verifyWooCommerceHmac(
	body: string,
	signatureHeader: string,
	secret: string,
): boolean {
	const computed = createHmac("sha256", secret)
		.update(body, "utf8")
		.digest("hex");
	const a = Buffer.from(computed, "utf8");
	const b = Buffer.from(signatureHeader, "utf8");
	if (a.length !== b.length) return false;
	return nodeTimingSafeEqual(a, b);
}

/** Verify YouCan HMAC-SHA256 signature (hex digest, x-youcan-signature) */
export function verifyYouCanHmac(
	body: string,
	signatureHeader: string,
	secret: string,
): boolean {
	const computed = createHmac("sha256", secret)
		.update(body, "utf8")
		.digest("hex");
	const a = Buffer.from(computed, "utf8");
	const b = Buffer.from(signatureHeader, "utf8");
	if (a.length !== b.length) return false;
	return nodeTimingSafeEqual(a, b);
}

/** Detect platform from headers (explicit + payload fallback) */
export function detectPlatform(
	headers: Headers,
	body?: Record<string, unknown>,
): "shopify" | "woocommerce" | "youcan" | "custom" | null {
	// Explicit header detection
	const topic = headers.get("x-woocommerce-topic");
	if (topic) return "woocommerce";

	const shopifyTopic = headers.get("x-shopify-topic");
	if (shopifyTopic) return "shopify";

	const youcanSignature = headers.get("x-youcan-signature");
	if (youcanSignature) return "youcan";

	// Payload shape fallback
	if (body) {
		if (body.line_items && body.shipping_address) return "shopify";
		if (body.billing && body.line_items) return "woocommerce";
		if (body.variants && body.shipping && body.payment) return "youcan";
		if (body.customer_name || body.phone) return "custom";
	}

	return null;
}
