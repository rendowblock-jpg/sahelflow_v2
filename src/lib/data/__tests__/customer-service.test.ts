import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	getCustomers,
	getCustomer,
	createCustomer,
	updateCustomer,
	deleteCustomer,
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
	});

	describe("updateCustomer", () => {
		it("updates and returns customer", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: { id: "c1", name: "Updated" }, error: null }),
			);
			const result = await updateCustomer("c1", { name: "Updated" });
			expect(result.name).toBe("Updated");
		});
	});

	describe("deleteCustomer", () => {
		it("soft-deletes without error", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ error: null }),
			);
			await expect(deleteCustomer("c1")).resolves.toBeUndefined();
		});
	});

	describe("findOrCreateCustomer", () => {
		it("throws when not authenticated", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue(null);
			await expect(
				findOrCreateCustomer({ phone: "0555123456" }),
			).rejects.toThrow("Not authenticated");
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
	});

	describe("getOrdersByCustomer", () => {
		it("returns orders for customer", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: [{ id: "o1" }], error: null }),
			);
			const result = await getOrdersByCustomer("c1");
			expect(result).toEqual([{ id: "o1" }]);
		});
	});
});
