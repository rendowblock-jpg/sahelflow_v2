import { describe, it, expect, vi } from "vitest";
import { POST } from "./route";

// Mock Supabase so the module loads without real credentials
vi.mock("@supabase/supabase-js", () => ({
	createClient: vi.fn(() => ({
		from: vi.fn(() => ({
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					single: vi.fn(() => ({
						data: { id: "s1", form_enabled: true },
						error: null,
					})),
					limit: vi.fn(() => ({
						single: vi.fn(() => ({ data: { id: "c1" }, error: null })),
					})),
					in: vi.fn(() => ({
						data: [{ id: "p1", stock: 10, price: 2500 }],
						error: null,
					})),
				})),
			})),
			insert: vi.fn(() => ({
				select: vi.fn(() => ({
					single: vi.fn(() => ({
						data: { id: "o1", order_number: "ORD-1" },
						error: null,
					})),
				})),
			})),
		})),
		rpc: vi.fn(),
	})),
}));

describe("POST /api/form/submit", () => {
	function makeReq(body: unknown, ip = "1.2.3.4") {
		return new Request("http://localhost/api/form/submit", {
			method: "POST",
			headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
			body: JSON.stringify(body),
		});
	}

	it("returns 400 for invalid JSON body", async () => {
		const req = new Request("http://localhost/api/form/submit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "not-json",
		});
		const res = await POST(req);
		expect(res.status).toBe(400);
	});

	it("returns 400 for missing required fields", async () => {
		const res = await POST(makeReq({}));
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.error).toBe("Invalid request");
	});

	it("rate-limits after 5 requests from same IP", async () => {
		const body = {
			sellerSlug: "test",
			customer: { name: "A", phone: "0555123456" },
			items: [
				{
					product_id: "550e8400-e29b-41d4-a716-446655440000",
					name: "X",
					quantity: 1,
					price: 1,
				},
			],
		};
		// Exhaust rate limit
		for (let i = 0; i < 5; i++) {
			await POST(makeReq(body, "9.9.9.9"));
		}
		const res = await POST(makeReq(body, "9.9.9.9"));
		expect(res.status).toBe(429);
		const json = await res.json();
		expect(json.error).toContain("Rate limit exceeded");
	});
});
