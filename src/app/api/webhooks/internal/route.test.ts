import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
	createClient: vi.fn(),
}));

vi.mock("@/lib/agents/orchestrator", () => ({
	dispatch: vi.fn().mockResolvedValue({ success: true }),
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
				remaining: 59,
				resetAt: Date.now() + 60000,
				provider: "memory",
			}),
		rateLimitHeaders: vi.fn().mockReturnValue({}),
	};
});

import { createClient } from "@supabase/supabase-js";
import { POST } from "./route";

const UUID_1 = "550e8400-e29b-41d4-a716-446655440000";
const UUID_2 = "550e8400-e29b-41d4-a716-446655440001";
const UUID_3 = "550e8400-e29b-41d4-a716-446655440002";

function createMockSupabase() {
	const chain = {
		select: vi.fn(() => chain),
		from: vi.fn(() => chain),
		insert: vi.fn(() => chain),
		eq: vi.fn(() => chain),
		maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
	};
	return chain;
}

describe("POST /api/webhooks/internal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
		vi.stubEnv("INTERNAL_WEBHOOK_SECRET", "internal-secret");
		vi.mocked(createClient).mockReturnValue(createMockSupabase() as never);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 429 when rate limited", async () => {
		const { rateLimit } = await import("@/lib/rate-limit");
		vi.mocked(rateLimit).mockResolvedValueOnce({
			allowed: false,
			remaining: 0,
			resetAt: Date.now() + 60000,
			provider: "memory",
		});

		const req = new Request("http://localhost/api/webhooks/internal", {
			method: "POST",
			headers: { "x-internal-secret": "internal-secret" },
			body: JSON.stringify({
				type: "order.created",
				orderId: UUID_1,
				sellerId: UUID_2,
			}),
		});
		const res = await POST(req as never);
		expect(res.status).toBe(429);
		expect(await res.json()).toEqual({ error: "Too many requests" });
	});

	it("returns 503 when INTERNAL_WEBHOOK_SECRET is missing", async () => {
		vi.stubEnv("INTERNAL_WEBHOOK_SECRET", "");
		const req = new Request("http://localhost/api/webhooks/internal", {
			method: "POST",
			headers: { "x-internal-secret": "any" },
			body: JSON.stringify({
				type: "order.created",
				orderId: UUID_1,
				sellerId: UUID_2,
			}),
		});
		const res = await POST(req as never);
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ error: "Service unavailable" });
	});

	it("returns 401 for invalid internal secret", async () => {
		const req = new Request("http://localhost/api/webhooks/internal", {
			method: "POST",
			headers: { "x-internal-secret": "wrong-secret" },
			body: JSON.stringify({
				type: "order.created",
				orderId: UUID_1,
				sellerId: UUID_2,
			}),
		});
		const res = await POST(req as never);
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Unauthorized" });
	});

	it("returns 400 for invalid body (missing type)", async () => {
		const req = new Request("http://localhost/api/webhooks/internal", {
			method: "POST",
			headers: { "x-internal-secret": "internal-secret" },
			body: JSON.stringify({ orderId: UUID_1, sellerId: UUID_2 }),
		});
		const res = await POST(req as never);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toBe("Invalid request");
		expect(Array.isArray(body.details)).toBe(true);
	});

	it("dispatches order.created event", async () => {
		const { dispatch } = await import("@/lib/agents/orchestrator");
		const req = new Request("http://localhost/api/webhooks/internal", {
			method: "POST",
			headers: { "x-internal-secret": "internal-secret" },
			body: JSON.stringify({
				type: "order.created",
				orderId: UUID_1,
				sellerId: UUID_2,
			}),
		});
		const res = await POST(req as never);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			ok: true,
			msg: "Dispatched to orchestrator",
		});
		expect(dispatch).toHaveBeenCalledWith({
			type: "order.created",
			orderId: UUID_1,
			sellerId: UUID_2,
		});
	});

	it("dispatches message.received event", async () => {
		const { dispatch } = await import("@/lib/agents/orchestrator");
		const req = new Request("http://localhost/api/webhooks/internal", {
			method: "POST",
			headers: { "x-internal-secret": "internal-secret" },
			body: JSON.stringify({
				type: "message.received",
				conversationId: UUID_3,
				sellerId: UUID_2,
			}),
		});
		const res = await POST(req as never);
		expect(res.status).toBe(200);
		expect(dispatch).toHaveBeenCalledWith({
			type: "message.received",
			conversationId: UUID_3,
			sellerId: UUID_2,
		});
	});

	it("returns 400 for invalid event type (Zod rejects)", async () => {
		const req = new Request("http://localhost/api/webhooks/internal", {
			method: "POST",
			headers: { "x-internal-secret": "internal-secret" },
			body: JSON.stringify({
				type: "unknown.type",
				orderId: UUID_1,
				sellerId: UUID_2,
			}),
		});
		const res = await POST(req as never);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toBe("Invalid request");
		expect(Array.isArray(body.details)).toBe(true);
	});

	it("queues retry when dispatch fails for order.created", async () => {
		const { dispatch } = await import("@/lib/agents/orchestrator");
		const mockSupabase = createMockSupabase();
		vi.mocked(createClient).mockReturnValue(mockSupabase as never);
		vi.mocked(dispatch).mockRejectedValueOnce(new Error("Dispatch failed"));

		const req = new Request("http://localhost/api/webhooks/internal", {
			method: "POST",
			headers: { "x-internal-secret": "internal-secret" },
			body: JSON.stringify({
				type: "order.created",
				orderId: UUID_1,
				sellerId: UUID_2,
			}),
		});
		const res = await POST(req as never);
		expect(res.status).toBe(200);
		expect(dispatch).toHaveBeenCalled();
		// Should have attempted to queue for retry
		expect(mockSupabase.insert).toHaveBeenCalled();
	});

	it("returns 500 on top-level error", async () => {
		const req = new Request("http://localhost/api/webhooks/internal", {
			method: "POST",
			headers: { "x-internal-secret": "internal-secret" },
			body: "not-json",
		});
		const res = await POST(req as never);
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: "Internal error" });
	});
});
