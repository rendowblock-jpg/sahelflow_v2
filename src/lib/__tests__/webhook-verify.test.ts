import { describe, it, expect } from "vitest";
import {
	verifyYouCanHmac,
	verifyShopifyHmac,
	verifyWooCommerceHmac,
	detectPlatform,
} from "../webhook-verify";
import { createHmac } from "crypto";

describe("Webhook Verification", () => {
	describe("verifyYouCanHmac", () => {
		it("returns true for a valid signature", () => {
			const secret = "test-oauth-client-secret";
			const body = JSON.stringify({ id: "order-123", total: 100 });
			const expected = createHmac("sha256", secret)
				.update(body, "utf8")
				.digest("hex");

			expect(verifyYouCanHmac(body, expected, secret)).toBe(true);
		});

		it("returns false for an invalid signature", () => {
			const body = JSON.stringify({ id: "order-123" });
			expect(verifyYouCanHmac(body, "bad-signature", "secret")).toBe(false);
		});

		it("returns false when secret is wrong", () => {
			const body = JSON.stringify({ id: "order-123" });
			const signature = createHmac("sha256", "correct-secret")
				.update(body, "utf8")
				.digest("hex");

			expect(verifyYouCanHmac(body, signature, "wrong-secret")).toBe(false);
		});
	});

	describe("detectPlatform", () => {
		it("detects Shopify from topic header", () => {
			const headers = new Headers({ "x-shopify-topic": "orders/create" });
			expect(detectPlatform(headers)).toBe("shopify");
		});

		it("detects WooCommerce from topic header", () => {
			const headers = new Headers({ "x-woocommerce-topic": "order.created" });
			expect(detectPlatform(headers)).toBe("woocommerce");
		});

		it("detects YouCan from signature header", () => {
			const headers = new Headers({ "x-youcan-signature": "abc123" });
			expect(detectPlatform(headers)).toBe("youcan");
		});

		it("detects YouCan from payload shape", () => {
			const headers = new Headers();
			const body = {
				variants: [],
				shipping: {},
				payment: {},
			};
			expect(detectPlatform(headers, body)).toBe("youcan");
		});

		it("detects Shopify from payload shape as fallback", () => {
			const headers = new Headers();
			const body = {
				line_items: [],
				shipping_address: {},
			};
			expect(detectPlatform(headers, body)).toBe("shopify");
		});

		it("returns null for unknown headers and body", () => {
			const headers = new Headers();
			expect(detectPlatform(headers)).toBeNull();
		});

		it("detects WooCommerce from payload shape (billing + line_items) as fallback (T4)", () => {
			const headers = new Headers();
			const body = {
				billing: { first_name: "Ahmed" },
				line_items: [{ id: 1, quantity: 2 }],
			};
			expect(detectPlatform(headers, body)).toBe("woocommerce");
		});

		it("detects custom from payload shape (customer_name + phone) as fallback (T4)", () => {
			const headers = new Headers();
			const body = {
				customer_name: "Ahmed",
				phone: "0555123456",
			};
			expect(detectPlatform(headers, body)).toBe("custom");
		});

		it("returns null for body with no recognized shape (T4)", () => {
			const headers = new Headers();
			const body = { foo: "bar", baz: 123 };
			expect(detectPlatform(headers, body)).toBeNull();
		});
	});

	// ── T4: Shopify HMAC (was completely untested) ───────────────────────────────
	describe("verifyShopifyHmac (T4)", () => {
		it("returns true for a valid Shopify base64 signature", () => {
			const secret = "shpss_xxx_shopify_secret";
			const body = JSON.stringify({
				id: 1234567890,
				email: "customer@example.com",
				total_price: "150.00",
				line_items: [{ id: 1, quantity: 2 }],
			});
			// Shopify uses HMAC-SHA256 with base64 digest, sent in X-Shopify-Hmac-Sha256 header
			const expected = createHmac("sha256", secret)
				.update(body, "utf8")
				.digest("base64");

			expect(verifyShopifyHmac(body, expected, secret)).toBe(true);
		});

		it("returns false for a tampered body (signature mismatch)", () => {
			const secret = "shopify-secret";
			const originalBody = JSON.stringify({ id: 1, total_price: "100.00" });
			const tamperedBody = JSON.stringify({ id: 1, total_price: "999.99" });
			const signature = createHmac("sha256", secret)
				.update(originalBody, "utf8")
				.digest("base64");

			expect(verifyShopifyHmac(tamperedBody, signature, secret)).toBe(false);
		});

		it("returns false for an invalid signature string", () => {
			const body = JSON.stringify({ id: 1 });
			expect(verifyShopifyHmac(body, "not-a-valid-base64-sig", "secret")).toBe(false);
		});

		it("returns false when the secret is wrong", () => {
			const body = JSON.stringify({ id: 1, total_price: "50.00" });
			const signature = createHmac("sha256", "correct-secret")
				.update(body, "utf8")
				.digest("base64");

			expect(verifyShopifyHmac(body, signature, "wrong-secret")).toBe(false);
		});

		it("returns false for empty signature header", () => {
			const body = JSON.stringify({ id: 1 });
			expect(verifyShopifyHmac(body, "", "secret")).toBe(false);
		});

		it("uses base64 digest (not hex) — distinguishes from WooCommerce/YouCan (T4)", () => {
			const secret = "shopify-secret";
			const body = JSON.stringify({ id: 1 });
			const base64Sig = createHmac("sha256", secret)
				.update(body, "utf8")
				.digest("base64");
			const hexSig = createHmac("sha256", secret)
				.update(body, "utf8")
				.digest("hex");

			// Base64 sig should verify; hex sig should NOT (different format)
			expect(verifyShopifyHmac(body, base64Sig, secret)).toBe(true);
			expect(verifyShopifyHmac(body, hexSig, secret)).toBe(false);
		});

		it("handles unicode body content (Arabic text)", () => {
			const secret = "shopify-secret";
			const body = JSON.stringify({ customer_name: "أحمد بن محمد", wilaya: "الجزائر" });
			const signature = createHmac("sha256", secret)
				.update(body, "utf8")
				.digest("base64");

			expect(verifyShopifyHmac(body, signature, secret)).toBe(true);
		});
	});

	// ── T4: WooCommerce HMAC (was completely untested) ───────────────────────────
	describe("verifyWooCommerceHmac (T4)", () => {
		it("returns true for a valid WooCommerce hex signature", () => {
			const secret = "wc_xxx_woocommerce_secret";
			const body = JSON.stringify({
				id: 100,
				billing: { first_name: "Sara", phone: "0555123456" },
				line_items: [{ id: 1, quantity: 1, total: "75.00" }],
				total: "75.00",
			});
			// WooCommerce uses HMAC-SHA256 with hex digest, sent in X-WC-Webhook-Signature header
			const expected = createHmac("sha256", secret)
				.update(body, "utf8")
				.digest("hex");

			expect(verifyWooCommerceHmac(body, expected, secret)).toBe(true);
		});

		it("returns false for a tampered body (signature mismatch)", () => {
			const secret = "wc-secret";
			const originalBody = JSON.stringify({ id: 1, total: "100.00" });
			const tamperedBody = JSON.stringify({ id: 1, total: "50.00" });
			const signature = createHmac("sha256", secret)
				.update(originalBody, "utf8")
				.digest("hex");

			expect(verifyWooCommerceHmac(tamperedBody, signature, secret)).toBe(false);
		});

		it("returns false for an invalid signature string", () => {
			const body = JSON.stringify({ id: 1 });
			expect(verifyWooCommerceHmac(body, "not-a-valid-hex-sig", "secret")).toBe(false);
		});

		it("returns false when the secret is wrong", () => {
			const body = JSON.stringify({ id: 1, total: "50.00" });
			const signature = createHmac("sha256", "correct-secret")
				.update(body, "utf8")
				.digest("hex");

			expect(verifyWooCommerceHmac(body, signature, "wrong-secret")).toBe(false);
		});

		it("returns false for empty signature header", () => {
			const body = JSON.stringify({ id: 1 });
			expect(verifyWooCommerceHmac(body, "", "secret")).toBe(false);
		});

		it("uses hex digest (not base64) — distinguishes from Shopify (T4)", () => {
			const secret = "wc-secret";
			const body = JSON.stringify({ id: 1 });
			const hexSig = createHmac("sha256", secret)
				.update(body, "utf8")
				.digest("hex");
			const base64Sig = createHmac("sha256", secret)
				.update(body, "utf8")
				.digest("base64");

			// Hex sig should verify; base64 sig should NOT (different format)
			expect(verifyWooCommerceHmac(body, hexSig, secret)).toBe(true);
			expect(verifyWooCommerceHmac(body, base64Sig, secret)).toBe(false);
		});

		it("handles unicode body content (French text)", () => {
			const secret = "wc-secret";
			const body = JSON.stringify({ customer_name: "François Müller", ville: "Alger" });
			const signature = createHmac("sha256", secret)
				.update(body, "utf8")
				.digest("hex");

			expect(verifyWooCommerceHmac(body, signature, secret)).toBe(true);
		});
	});

	// ── T4: Cross-platform verification (timing-safe comparison) ─────────────────
	describe("timing-safe comparison across all 3 platforms (T4)", () => {
		it("all 3 verifiers reject signatures of different lengths without throwing", () => {
			const body = JSON.stringify({ id: 1 });
			// Short signature vs long expected — length check returns false, no throw
			expect(verifyShopifyHmac(body, "short", "secret")).toBe(false);
			expect(verifyWooCommerceHmac(body, "short", "secret")).toBe(false);
			expect(verifyYouCanHmac(body, "short", "secret")).toBe(false);
		});

		it("all 3 verifiers return true for their respective valid signatures", () => {
			const secret = "shared-secret";
			const body = JSON.stringify({ id: 1, total: "100" });
			const shopifySig = createHmac("sha256", secret).update(body, "utf8").digest("base64");
			const wcSig = createHmac("sha256", secret).update(body, "utf8").digest("hex");
			const youcanSig = createHmac("sha256", secret).update(body, "utf8").digest("hex");

			expect(verifyShopifyHmac(body, shopifySig, secret)).toBe(true);
			expect(verifyWooCommerceHmac(body, wcSig, secret)).toBe(true);
			expect(verifyYouCanHmac(body, youcanSig, secret)).toBe(true);
		});
	});
});
