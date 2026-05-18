import { createHmac } from "crypto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
	createClient: vi.fn(),
}));

vi.mock("@/lib/rate-limit", async () => {
	const actual =
		await vi.importActual<typeof import("@/lib/rate-limit")>(
			"@/lib/rate-limit",
		);
	return {
		...actual,
		rateLimit: vi
			.fn()
			.mockResolvedValue({
				allowed: true,
				remaining: 29,
				resetAt: Date.now() + 60000,
				provider: "memory",
			}),
		rateLimitHeaders: vi.fn().mockReturnValue({}),
	};
});

vi.mock("@/lib/data/order-service", () => ({
	findExistingOrderByExternalId: vi.fn().mockResolvedValue(null),
}));

import { createClient } from "@supabase/supabase-js";
import { findExistingOrderByExternalId } from "@/lib/data/order-service";
import { POST, GET } from "./route";

function createMockSupabase(dataOverrides: Record<string, unknown> = {}) {
	const chain = {
		select: vi.fn(() => chain),
		from: vi.fn(() => chain),
		insert: vi.fn(() => chain),
		update: vi.fn(() => chain),
		upsert: vi.fn(() => chain),
		eq: vi.fn(() => chain),
		neq: vi.fn(() => chain),
		is: vi.fn(() => chain),
		not: vi.fn(() => chain),
		limit: vi.fn(() => chain),
		order: vi.fn(() => chain),
		rpc: vi.fn(() =>
			Promise.resolve({
				data: dataOverrides.rpc ?? null,
				error: dataOverrides.rpcError ?? null,
			}),
		),
		single: vi.fn(() =>
			Promise.resolve({
				data: dataOverrides.single ?? null,
				error: dataOverrides.singleError ?? null,
			}),
		),
		maybeSingle: vi.fn(() =>
			Promise.resolve({ data: dataOverrides.maybeSingle ?? null, error: null }),
		),
	};
	return chain;
}

describe("POST /api/webhooks/store/[token]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
		vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", "shopify-secret");
		vi.mocked(createClient).mockReturnValue(createMockSupabase() as never);
		vi.mocked(findExistingOrderByExternalId).mockResolvedValue(null);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 200 for test mode", async () => {
		const req = new Request("http://localhost/api/webhooks/store/test-token", {
			method: "POST",
			headers: { "X-SahelFlow-Test": "true" },
			body: JSON.stringify({}),
		});
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "test-token" }),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true, test: true });
	});

	it("returns 429 when rate limited", async () => {
		const { rateLimit } = await import("@/lib/rate-limit");
		vi.mocked(rateLimit).mockResolvedValueOnce({
			allowed: false,
			remaining: 0,
			resetAt: Date.now() + 60000,
			provider: "memory",
		});

		const req = new Request("http://localhost/api/webhooks/store/test-token", {
			method: "POST",
			body: JSON.stringify({}),
		});
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "test-token" }),
		});
		expect(res.status).toBe(429);
		expect(await res.json()).toEqual({ error: "Too many requests" });
	});

	it("returns 401 for invalid token", async () => {
		const mockSupabase = createMockSupabase({
			single: null,
			singleError: { message: "not found" },
		});
		vi.mocked(createClient).mockReturnValue(mockSupabase as never);

		const req = new Request(
			"http://localhost/api/webhooks/store/invalid-token",
			{
				method: "POST",
				body: JSON.stringify({}),
			},
		);
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "invalid-token" }),
		});
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Invalid token" });
	});

	it("returns 400 for invalid JSON", async () => {
		const mockSupabase = createMockSupabase();
		vi.mocked(createClient).mockReturnValue(mockSupabase as never);

		const req = new Request("http://localhost/api/webhooks/store/test-token", {
			method: "POST",
			body: "not-json",
		});
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "test-token" }),
		});
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "Invalid JSON" });
	});

	it("returns 401 for invalid Shopify HMAC", async () => {
		const mockSupabase = createMockSupabase({
			single: {
				id: "seller-1",
				webhook_token: "test-token",
				webhook_orders_count: 0,
			},
		});
		vi.mocked(createClient).mockReturnValue(mockSupabase as never);

		const req = new Request("http://localhost/api/webhooks/store/test-token", {
			method: "POST",
			headers: { "X-Shopify-Hmac-Sha256": "invalid-signature" },
			body: JSON.stringify({ id: 1, line_items: [] }),
		});
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "test-token" }),
		});
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Invalid HMAC signature" });
	});

	it("accepts valid Shopify HMAC and creates order", async () => {
		const body = JSON.stringify({
			id: 1,
			line_items: [{ title: "T-Shirt", quantity: 1, price: "1500" }],
			shipping_address: {
				first_name: "Ahmed",
				last_name: "Ben",
				phone: "0555123456",
				province: "Algiers",
				city: "Algiers",
				address1: "123 Main St",
			},
			total_price: "1500",
			order_number: "1001",
		});
		const signature = createHmac("sha256", "shopify-secret")
			.update(body, "utf8")
			.digest("base64");

		const mockSupabase = createMockSupabase({
			single: {
				id: "seller-1",
				webhook_token: "test-token",
				webhook_orders_count: 0,
			},
			maybeSingle: { id: "customer-1" },
		});
		vi.mocked(createClient).mockReturnValue(mockSupabase as never);

		const req = new Request("http://localhost/api/webhooks/store/test-token", {
			method: "POST",
			headers: { "X-Shopify-Hmac-Sha256": signature },
			body,
		});
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "test-token" }),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
	});

	it("returns 401 for invalid WooCommerce HMAC", async () => {
		vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", "");
		const mockSupabase = createMockSupabase({
			single: {
				id: "seller-1",
				webhook_token: "test-token",
				webhook_orders_count: 0,
			},
			maybeSingle: { credentials: { webhook_secret: "wc-secret" } },
		});
		vi.mocked(createClient).mockReturnValue(mockSupabase as never);

		const req = new Request("http://localhost/api/webhooks/store/test-token", {
			method: "POST",
			headers: {
				"X-WC-Webhook-Signature": "invalid-signature",
				"x-woocommerce-topic": "order.created",
			},
			body: JSON.stringify({ id: 1, billing: {}, line_items: [] }),
		});
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "test-token" }),
		});
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({
			error: "Invalid WooCommerce signature",
		});
	});

	it("deduplicates existing orders by external_id", async () => {
		vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", "");
		const mockSupabase = createMockSupabase({
			single: {
				id: "seller-1",
				webhook_token: "test-token",
				webhook_orders_count: 5,
			},
		});
		vi.mocked(createClient).mockReturnValue(mockSupabase as never);
		vi.mocked(findExistingOrderByExternalId).mockResolvedValue({
			id: "existing-order",
		} as never);

		const req = new Request("http://localhost/api/webhooks/store/test-token", {
			method: "POST",
			body: JSON.stringify({
				id: "external-123",
				line_items: [{ title: "T-Shirt", quantity: 1, price: "1500" }],
				shipping_address: {
					first_name: "A",
					last_name: "B",
					phone: "0555",
					province: "Algiers",
					city: "Algiers",
					address1: "123",
				},
				total_price: "1500",
			}),
		});
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "test-token" }),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			success: true,
			message: "Order already exists",
		});
	});

	it("returns 400 for unparseable order data", async () => {
		vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", "");
		const mockSupabase = createMockSupabase({
			single: {
				id: "seller-1",
				webhook_token: "test-token",
				webhook_orders_count: 0,
			},
		});
		vi.mocked(createClient).mockReturnValue(mockSupabase as never);

		const req = new Request("http://localhost/api/webhooks/store/test-token", {
			method: "POST",
			body: JSON.stringify({ unknown_field: "value" }),
		});
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "test-token" }),
		});
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "Could not parse order data" });
	});

	it("accepts valid WooCommerce HMAC and creates order", async () => {
		vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", "");
		const body = JSON.stringify({
			id: 2,
			billing: {
				first_name: "Fatima",
				last_name: "Zohra",
				phone: "0666123456",
				state: "Oran",
				city: "Oran",
				address_1: "456 Rue Centrale",
			},
			line_items: [{ name: "Hijab", quantity: 2, price: "800" }],
			total: "1600",
			shipping_total: "300",
			number: "42",
		});
		const signature = createHmac("sha256", "wc-secret")
			.update(body, "utf8")
			.digest("hex");

		const mockSupabase = createMockSupabase({
			single: {
				id: "seller-1",
				webhook_token: "test-token",
				webhook_orders_count: 0,
			},
			maybeSingle: { credentials: { webhook_secret: "wc-secret" } },
		});
		vi.mocked(createClient).mockReturnValue(mockSupabase as never);

		const req = new Request("http://localhost/api/webhooks/store/test-token", {
			method: "POST",
			headers: {
				"X-WC-Webhook-Signature": signature,
				"x-woocommerce-topic": "order.created",
			},
			body,
		});
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "test-token" }),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
	});

	it("accepts YouCan webhook and creates order", async () => {
		vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", "");
		const body = JSON.stringify({
			id: "yc-123",
			ref: "YC-001",
			total: 2500,
			shipping: {
				price: 400,
				address: [{ name: "Karim", phone: "0777123456", city: "Constantine" }],
			},
			payment: { payload: { gateway: "cod" } },
			variants: [
				{
					price: 2500,
					quantity: 1,
					variant: {
						product: { name: "Karakou", price: 2500 },
					},
				},
			],
		});

		const mockSupabase = createMockSupabase({
			single: {
				id: "seller-1",
				webhook_token: "test-token",
				webhook_orders_count: 0,
			},
		});
		vi.mocked(createClient).mockReturnValue(mockSupabase as never);

		const req = new Request("http://localhost/api/webhooks/store/test-token", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body,
		});
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "test-token" }),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
	});

	it("deduplicates by event_id on retry", async () => {
		vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", "");
		const mockSupabase = createMockSupabase({
			single: {
				id: "seller-1",
				webhook_token: "test-token",
				webhook_orders_count: 0,
			},
			maybeSingle: { id: "existing-event-999" },
		});
		vi.mocked(createClient).mockReturnValue(mockSupabase as never);

		const req = new Request("http://localhost/api/webhooks/store/test-token", {
			method: "POST",
			headers: { "X-Shopify-Event-Id": "evt-999" },
			body: JSON.stringify({
				id: 99,
				line_items: [{ title: "Shoes", quantity: 1, price: "3000" }],
				shipping_address: {
					first_name: "A",
					last_name: "B",
					phone: "0555",
					province: "Algiers",
					city: "Algiers",
					address1: "123",
				},
				total_price: "3000",
			}),
		});
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "test-token" }),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			success: true,
			message: "Event already processed",
		});
	});

	it("extracts Shopify delivery_cost from shipping.price", async () => {
		const body = JSON.stringify({
			id: 3,
			line_items: [{ title: "Jacket", quantity: 1, price: "5000" }],
			shipping_address: {
				first_name: "Sofiane",
				last_name: "M",
				phone: "0555999888",
				province: "Tlemcen",
				city: "Tlemcen",
				address1: "789 Boulevard",
			},
			shipping: { price: "500" },
			total_price: "5500",
			order_number: "1003",
		});
		const signature = createHmac("sha256", "shopify-secret")
			.update(body, "utf8")
			.digest("base64");

		const mockSupabase = createMockSupabase({
			single: {
				id: "seller-1",
				webhook_token: "test-token",
				webhook_orders_count: 0,
			},
			maybeSingle: { id: "customer-1" },
		});
		vi.mocked(createClient).mockReturnValue(mockSupabase as never);

		const req = new Request("http://localhost/api/webhooks/store/test-token", {
			method: "POST",
			headers: { "X-Shopify-Hmac-Sha256": signature },
			body,
		});
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "test-token" }),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
	});

	it("returns 500 on unexpected error", async () => {
		vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", "");
		vi.mocked(createClient).mockImplementation(() => {
			throw new Error("DB connection failed");
		});

		const req = new Request("http://localhost/api/webhooks/store/test-token", {
			method: "POST",
			body: JSON.stringify({}),
		});
		const res = await POST(req as never, {
			params: Promise.resolve({ token: "test-token" }),
		});
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: "Internal error" });
	});
});

describe("GET /api/webhooks/store/[token]", () => {
	it("returns ok for health check", async () => {
		const res = await GET();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			status: "ok",
			service: "SahelFlow Webhook",
		});
	});
});
