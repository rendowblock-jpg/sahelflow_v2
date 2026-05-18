import { describe, it, expect } from "vitest";
import { verifyYouCanHmac, detectPlatform } from "../webhook-verify";
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
	});
});
