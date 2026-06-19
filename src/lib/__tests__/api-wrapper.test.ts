import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";

vi.mock("@/lib/supabase/server", () => ({
	createClient: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
	rateLimit: vi.fn().mockResolvedValue({
		allowed: true,
		remaining: 59,
		resetAt: Date.now() + 60000,
		provider: "memory",
	}),
	rateLimitHeaders: vi.fn().mockReturnValue({}),
	getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockGetUserSellerContext = vi.fn();
vi.mock("@/lib/data/team-service", () => ({
	getUserSellerContext: (...args: any[]) => mockGetUserSellerContext(...args),
}));

import { createClient } from "@/lib/supabase/server";

describe("withAuthAndRateLimit Middleware Wrapper", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("bypasses authentication when requireAuth is false", async () => {
		const mockHandler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
		const wrapped = withAuthAndRateLimit(mockHandler, { requireAuth: false });

		const req = new NextRequest("http://localhost/api/test");
		const res = await wrapped(req);

		expect(res.status).toBe(200);
		expect(mockHandler).toHaveBeenCalledTimes(1);
		const callArgs = mockHandler.mock.calls[0][1];
		expect(callArgs.user).toBeNull();
		expect(callArgs.sellerId).toBe("");
	});

	it("returns 401 when requireAuth is true and user is not authenticated", async () => {
		vi.mocked(createClient).mockResolvedValueOnce({
			auth: {
				getUser: vi.fn().mockResolvedValueOnce({ data: { user: null }, error: null }),
			},
		} as any);

		const mockHandler = vi.fn();
		const wrapped = withAuthAndRateLimit(mockHandler, { requireAuth: true });

		const req = new NextRequest("http://localhost/api/test");
		const res = await wrapped(req);

		expect(res.status).toBe(401);
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it("returns 403 when team member is suspended", async () => {
		vi.mocked(createClient).mockResolvedValueOnce({
			auth: {
				getUser: vi.fn().mockResolvedValueOnce({
					data: { user: { id: "suspended-user-id", email: "test@team.com" } },
					error: null,
				}),
			},
		} as any);

		mockGetUserSellerContext.mockResolvedValueOnce({
			sellerId: "seller-id-123",
			role: "member",
			status: "suspended",
		});

		const mockHandler = vi.fn();
		const wrapped = withAuthAndRateLimit(mockHandler, { requireAuth: true });

		const req = new NextRequest("http://localhost/api/test");
		const res = await wrapped(req);

		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error).toBe("Forbidden: Your team member account has been suspended");
		expect(mockHandler).not.toHaveBeenCalled();
	});

	it("resolves sellerId and status successfully for active team member", async () => {
		vi.mocked(createClient).mockResolvedValueOnce({
			auth: {
				getUser: vi.fn().mockResolvedValueOnce({
					data: { user: { id: "active-member-id", email: "active@team.com" } },
					error: null,
				}),
			},
		} as any);

		mockGetUserSellerContext.mockResolvedValueOnce({
			sellerId: "seller-id-123",
			role: "admin",
			status: "active",
		});

		const mockHandler = vi.fn().mockResolvedValue(NextResponse.json({ success: true }));
		const wrapped = withAuthAndRateLimit(mockHandler, { requireAuth: true });

		const req = new NextRequest("http://localhost/api/test");
		const res = await wrapped(req);

		expect(res.status).toBe(200);
		expect(mockHandler).toHaveBeenCalledTimes(1);
		const callArgs = mockHandler.mock.calls[0][1];
		expect(callArgs.user.id).toBe("active-member-id");
		expect(callArgs.sellerId).toBe("seller-id-123");
	});

	it("defaults sellerId to user.id if no team context exists", async () => {
		vi.mocked(createClient).mockResolvedValueOnce({
			auth: {
				getUser: vi.fn().mockResolvedValueOnce({
					data: { user: { id: "solo-seller-id", email: "solo@seller.com" } },
					error: null,
				}),
			},
		} as any);

		mockGetUserSellerContext.mockResolvedValueOnce(null);

		const mockHandler = vi.fn().mockResolvedValue(NextResponse.json({ success: true }));
		const wrapped = withAuthAndRateLimit(mockHandler, { requireAuth: true });

		const req = new NextRequest("http://localhost/api/test");
		const res = await wrapped(req);

		expect(res.status).toBe(200);
		expect(mockHandler).toHaveBeenCalledTimes(1);
		const callArgs = mockHandler.mock.calls[0][1];
		expect(callArgs.user.id).toBe("solo-seller-id");
		expect(callArgs.sellerId).toBe("solo-seller-id");
	});
});
