import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	getCustomers,
	getCustomer,
	createCustomer,
	updateCustomer,
	deleteCustomer,
	restoreCustomer,
	findOrCreateCustomer,
	getOrdersByCustomer,
} from "@/lib/data/customer-service";

function chain(result: any) {
	const c: any = {
		from: () => c,
		select: () => c,
		insert: () => c,
		update: () => c,
		delete: () => c,
		eq: () => c,
		is: () => c,
		not: () => c,
		order: () => c,
		range: () => c,
		upsert: () => c,
		single: () => Promise.resolve(result),
		then: (resolve: any) => Promise.resolve(result).then(resolve),
	};
	return c;
}

vi.mock("@/lib/data/supabase-helpers", () => ({
	getSupabase: vi.fn(),
}));
vi.mock("@/lib/data/auth-service", () => {
	const mockGetCurrentUser = vi.fn();
	return {
		getCurrentUser: mockGetCurrentUser,
		getActiveSellerId: vi.fn(async () => {
			const user = await mockGetCurrentUser();
			if (!user) throw new Error("Not authenticated");
			return user.id;
		}),
	};
});

import { getSupabase } from "@/lib/data/supabase-helpers";
import { getCurrentUser } from "@/lib/data/auth-service";

describe("customer-service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getCurrentUser).mockResolvedValue({ id: "seller-1" } as any);
	});

	describe("getCustomers", () => {
		it("returns customers with pagination", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: [{ id: "c1" }], error: null, count: 1 }),
			);
			const result = await getCustomers({ limit: 10, offset: 0 });
			expect(result.data).toEqual([{ id: "c1" }]);
			expect(result.total).toBe(1);
		});

		it("returns empty array and 0 total when data is null", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: null, error: null, count: null }),
			);
			const result = await getCustomers();
			expect(result.data).toEqual([]);
			expect(result.total).toBe(0);
		});

		it("throws on error", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: null, error: new Error("fetch fail") }),
			);
			await expect(getCustomers()).rejects.toThrow("fetch fail");
		});
	});

	describe("getCustomer", () => {
		it("returns a single customer", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: { id: "c1", name: "Ahmed" }, error: null }),
			);
			const result = await getCustomer("c1");
			expect(result.name).toBe("Ahmed");
		});

		it("throws on error", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: null, error: new Error("not found") }),
			);
			await expect(getCustomer("c1")).rejects.toThrow("not found");
		});
	});

	describe("createCustomer", () => {
		it("throws when not authenticated", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue(null);
			await expect(createCustomer({ name: "Ahmed" })).rejects.toThrow(
				"Not authenticated",
			);
		});

		it("creates customer with seller_id", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue({ id: "seller-1" } as any);
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: { id: "c1", name: "Ahmed" }, error: null }),
			);
			const result = await createCustomer({
				name: "Ahmed",
				phone: "0555123456",
			});
			expect(result.id).toBe("c1");
		});

		it("throws on error", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue({ id: "seller-1" } as any);
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: null, error: new Error("create fail") }),
			);
			await expect(createCustomer({ name: "Ahmed" })).rejects.toThrow("create fail");
		});
	});

	describe("updateCustomer", () => {
		it("updates and returns customer", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: { id: "c1", name: "Updated" }, error: null }),
			);
			const result = await updateCustomer("c1", { name: "Updated" });
			expect(result.name).toBe("Updated");
		});

		it("throws on error", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: null, error: new Error("update fail") }),
			);
			await expect(updateCustomer("c1", { name: "Updated" })).rejects.toThrow("update fail");
		});
	});

	describe("deleteCustomer", () => {
		it("soft-deletes without error", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ error: null }),
			);
			await expect(deleteCustomer("c1")).resolves.toBeUndefined();
		});

		it("throws on error", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ error: new Error("delete fail") }),
			);
			await expect(deleteCustomer("c1")).rejects.toThrow("delete fail");
		});
	});

	describe("restoreCustomer", () => {
		it("restores customer successfully", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: { id: "c1", name: "Ahmed", deleted_at: null }, error: null }),
			);
			const result = await restoreCustomer("c1");
			expect(result.id).toBe("c1");
		});

		it("throws on error", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: null, error: new Error("restore fail") }),
			);
			await expect(restoreCustomer("c1")).rejects.toThrow("restore fail");
		});
	});

	describe("findOrCreateCustomer", () => {
		it("throws when not authenticated", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue(null);
			await expect(
				findOrCreateCustomer({ phone: "0555123456" }),
			).rejects.toThrow("Not authenticated");
		});

		it("inserts when phone is missing or empty", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue({ id: "seller-1" } as any);
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: { id: "c1", phone: null }, error: null }),
			);
			const result = await findOrCreateCustomer({ name: "No Phone" });
			expect(result.id).toBe("c1");
		});

		it("throws when phone is missing and insert fails", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue({ id: "seller-1" } as any);
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: null, error: new Error("insert fail") }),
			);
			await expect(findOrCreateCustomer({ name: "No Phone" })).rejects.toThrow("insert fail");
		});

		it("upserts customer atomically", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue({ id: "seller-1" } as any);
			let upsertArgs: any;
			const c = chain({ data: { id: "c1", phone: "0555123456" }, error: null });
			c.upsert = (...args: any[]) => {
				upsertArgs = args;
				return c;
			};
			vi.mocked(getSupabase).mockReturnValue(c);
			const result = await findOrCreateCustomer({
				phone: "0555123456",
				name: "Ahmed",
			});
			expect(result.phone).toBe("0555123456");
			expect(upsertArgs[0]).toMatchObject({
				seller_id: "seller-1",
				phone: "0555123456",
			});
			expect(upsertArgs[1]).toMatchObject({ onConflict: "seller_id,phone" });
		});

		it("throws when upsert fails", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue({ id: "seller-1" } as any);
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: null, error: new Error("upsert fail") }),
			);
			await expect(findOrCreateCustomer({ phone: "0555123456" })).rejects.toThrow("upsert fail");
		});
	});

	describe("getOrdersByCustomer", () => {
		it("returns orders for customer", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: [{ id: "o1" }], error: null }),
			);
			const result = await getOrdersByCustomer("c1");
			expect(result).toEqual([{ id: "o1" }]);
		});

		it("returns empty array when data is null", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: null, error: null }),
			);
			const result = await getOrdersByCustomer("c1");
			expect(result).toEqual([]);
		});

		it("throws on error", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: null, error: new Error("fetch fail") }),
			);
			await expect(getOrdersByCustomer("c1")).rejects.toThrow("fetch fail");
		});
	});
});
