import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	getCurrentUser,
	getSellerProfile,
	updateSellerProfile,
} from "@/lib/data/auth-service";

function createMockSupabase() {
	const mock: any = {};
	mock.auth = { getUser: vi.fn() };
	mock.from = vi.fn(() => mock);
	mock.select = vi.fn(() => mock);
	mock.insert = vi.fn(() => mock);
	mock.update = vi.fn(() => mock);
	mock.delete = vi.fn(() => mock);
	mock.eq = vi.fn(() => mock);
	mock.maybeSingle = vi.fn();
	return mock;
}

vi.mock("@/lib/data/supabase-helpers", () => ({
	getSupabase: vi.fn(),
}));

import { getSupabase } from "@/lib/data/supabase-helpers";

describe("auth-service", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	describe("getCurrentUser", () => {
		it("returns user when authenticated", async () => {
			const user = { id: "user-1", email: "test@test.com" };
			const mockSupabase = createMockSupabase();
			mockSupabase.auth.getUser.mockResolvedValue({ data: { user } });
			vi.mocked(getSupabase).mockReturnValue(mockSupabase);
			const result = await getCurrentUser();
			expect(result).toEqual(user);
		});

		it("returns null when not authenticated", async () => {
			const mockSupabase = createMockSupabase();
			mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
			vi.mocked(getSupabase).mockReturnValue(mockSupabase);
			const result = await getCurrentUser();
			expect(result).toBeNull();
		});
	});

	describe("getSellerProfile", () => {
		it("returns profile when found", async () => {
			const user = { id: "user-1" };
			const profile = { id: "user-1", business_name: "Test" };
			const mockSupabase = createMockSupabase();
			mockSupabase.auth.getUser.mockResolvedValue({ data: { user } });
			mockSupabase.maybeSingle.mockResolvedValue({ data: profile });
			vi.mocked(getSupabase).mockReturnValue(mockSupabase);
			const result = await getSellerProfile();
			expect(result).toEqual(profile);
		});

		it("returns null when no user", async () => {
			const mockSupabase = createMockSupabase();
			mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
			vi.mocked(getSupabase).mockReturnValue(mockSupabase);
			const result = await getSellerProfile();
			expect(result).toBeNull();
		});
	});

	describe("updateSellerProfile", () => {
		it("updates existing row", async () => {
			const user = { id: "user-1" };
			const updated = { id: "user-1", business_name: "New" };
			const mockSupabase = createMockSupabase();
			mockSupabase.auth.getUser.mockResolvedValue({ data: { user } });
			mockSupabase.maybeSingle.mockResolvedValue({ data: updated });
			vi.mocked(getSupabase).mockReturnValue(mockSupabase);
			const result = await updateSellerProfile({ business_name: "New" });
			expect(result).toEqual(updated);
		});

		it("inserts when update misses", async () => {
			const user = { id: "user-1" };
			const inserted = { id: "user-1", business_name: "New" };
			const mockSupabase = createMockSupabase();
			mockSupabase.auth.getUser.mockResolvedValue({ data: { user } });
			mockSupabase.maybeSingle
				.mockResolvedValueOnce({ data: null })
				.mockResolvedValueOnce({ data: inserted });
			vi.mocked(getSupabase).mockReturnValue(mockSupabase);
			const result = await updateSellerProfile({ business_name: "New" });
			expect(result).toEqual(inserted);
		});

		it("throws when not authenticated", async () => {
			const mockSupabase = createMockSupabase();
			mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
			vi.mocked(getSupabase).mockReturnValue(mockSupabase);
			await expect(updateSellerProfile({ business_name: "X" })).rejects.toThrow(
				"Not authenticated",
			);
		});

		it("throws on insert error", async () => {
			const user = { id: "user-1" };
			const mockSupabase = createMockSupabase();
			mockSupabase.auth.getUser.mockResolvedValue({ data: { user } });
			mockSupabase.maybeSingle
				.mockResolvedValueOnce({ data: null })
				.mockRejectedValueOnce(new Error("DB error"));
			vi.mocked(getSupabase).mockReturnValue(mockSupabase);
			await expect(updateSellerProfile({ business_name: "X" })).rejects.toThrow(
				"DB error",
			);
		});
	});
});
