import { describe, it, expect, vi, beforeEach } from "vitest";

// Must reset modules because rate-limit.ts evaluates env vars at import time.
beforeEach(() => {
	vi.resetModules();
	vi.unstubAllEnvs();
});

describe("rate-limit memory", () => {
	it("allows first request", async () => {
		const { rateLimit } = await import("@/lib/rate-limit");
		const result = rateLimit("test-key", 5, 60000);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(4);
		expect(result.provider).toBe("memory");
	});

	it("blocks after max requests", async () => {
		const { rateLimit } = await import("@/lib/rate-limit");
		const key = "test-key-2";
		for (let i = 0; i < 5; i++) {
			const r = rateLimit(key, 5, 60000);
			expect(r.allowed).toBe(true);
		}
		const blocked = rateLimit(key, 5, 60000);
		expect(blocked.allowed).toBe(false);
		expect(blocked.remaining).toBe(0);
	});

	it("resets after window expires", async () => {
		const { rateLimit } = await import("@/lib/rate-limit");
		const key = "test-key-3";
		const windowMs = 50;
		for (let i = 0; i < 5; i++) rateLimit(key, 5, windowMs);
		expect(rateLimit(key, 5, windowMs).allowed).toBe(false);
		await new Promise((r) => setTimeout(r, windowMs + 20));
		const reset = rateLimit(key, 5, windowMs);
		expect(reset.allowed).toBe(true);
		expect(reset.remaining).toBe(4);
	});
});

describe("rateLimitHeaders", () => {
	it("returns correct headers", async () => {
		const { rateLimitHeaders } = await import("@/lib/rate-limit");
		const h = rateLimitHeaders({
			remaining: 3,
			resetAt: 1700000000000,
			provider: "memory",
		});
		expect(h["X-RateLimit-Remaining"]).toBe("3");
		expect(h["X-RateLimit-Reset"]).toBe("1700000000000");
		expect(h["X-RateLimit-Provider"]).toBe("memory");
	});
});
