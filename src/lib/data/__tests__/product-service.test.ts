import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	getCategories,
	createCategory,
	updateCategory,
	deleteCategory,
	getProducts,
	getProduct,
	createProduct,
	updateProduct,
	deleteProduct,
} from "@/lib/data/product-service";

function chain(selectResult: any) {
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
		ilike: () => c,
		single: () => Promise.resolve(selectResult),
		then: (resolve: any) => Promise.resolve(selectResult).then(resolve),
	};
	return c;
}

vi.mock("@/lib/data/supabase-helpers", () => ({
	getSupabase: vi.fn(),
}));
vi.mock("@/lib/data/auth-service", () => ({
	getCurrentUser: vi.fn(),
}));

import { getSupabase } from "@/lib/data/supabase-helpers";
import { getCurrentUser } from "@/lib/data/auth-service";

describe("product-service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("getCategories", () => {
		it("returns sorted categories", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: [{ id: "cat1" }], error: null }),
			);
			const result = await getCategories();
			expect(result).toEqual([{ id: "cat1" }]);
		});
	});

	describe("createCategory", () => {
		it("throws when not authenticated", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue(null);
			await expect(
				createCategory({ name: "Electronics", slug: "electronics" }),
			).rejects.toThrow("Not authenticated");
		});

		it("creates category with seller_id", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue({ id: "seller-1" } as any);
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: { id: "cat1", name: "Electronics" }, error: null }),
			);
			const result = await createCategory({
				name: "Electronics",
				slug: "electronics",
			});
			expect(result.name).toBe("Electronics");
		});
	});

	describe("updateCategory", () => {
		it("updates category", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: { id: "cat1", name: "Updated" }, error: null }),
			);
			const result = await updateCategory("cat1", { name: "Updated" });
			expect(result.name).toBe("Updated");
		});
	});

	describe("deleteCategory", () => {
		it("deletes without error", async () => {
			const eqMock = vi.fn().mockResolvedValue({ error: null });
			vi.mocked(getSupabase).mockReturnValue({
				from: () => ({ delete: () => ({ eq: eqMock }) }),
			} as any);
			await expect(deleteCategory("cat1")).resolves.toBeUndefined();
		});
	});

	describe("getProducts", () => {
		it("returns products with pagination", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: [{ id: "p1" }], error: null, count: 1 }),
			);
			const result = await getProducts({ limit: 10, offset: 0 });
			expect(result.data).toEqual([{ id: "p1" }]);
			expect(result.total).toBe(1);
		});

		it("applies search filter", async () => {
			let capturedIlike = false;
			const c = chain({ data: [], error: null, count: 0 });
			c.ilike = (...args: any[]) => {
				if (args[0] === "name" && args[1] === "%parfum%") capturedIlike = true;
				return c;
			};
			vi.mocked(getSupabase).mockReturnValue(c);
			await getProducts({ search: "parfum" });
			expect(capturedIlike).toBe(true);
		});

		it("applies category filter", async () => {
			let capturedEq = false;
			const c = chain({ data: [], error: null, count: 0 });
			c.eq = (...args: any[]) => {
				if (args[0] === "category_id" && args[1] === "cat-1") capturedEq = true;
				return c;
			};
			vi.mocked(getSupabase).mockReturnValue(c);
			await getProducts({ category: "cat-1" });
			expect(capturedEq).toBe(true);
		});
	});

	describe("getProduct", () => {
		it("returns single product", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: { id: "p1", name: "Parfum" }, error: null }),
			);
			const result = await getProduct("p1");
			expect(result.name).toBe("Parfum");
		});
	});

	describe("createProduct", () => {
		it("throws when not authenticated", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue(null);
			await expect(
				createProduct({ name: "Parfum", price: 1000 }),
			).rejects.toThrow("Not authenticated");
		});

		it("creates product with seller_id", async () => {
			vi.mocked(getCurrentUser).mockResolvedValue({ id: "seller-1" } as any);
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: { id: "p1", name: "Parfum" }, error: null }),
			);
			const result = await createProduct({ name: "Parfum", price: 1000 });
			expect(result.name).toBe("Parfum");
		});
	});

	describe("updateProduct", () => {
		it("updates and returns product", async () => {
			vi.mocked(getSupabase).mockReturnValue(
				chain({ data: { id: "p1", price: 1200 }, error: null }),
			);
			const result = await updateProduct("p1", { price: 1200 });
			expect(result.price).toBe(1200);
		});
	});

	describe("deleteProduct", () => {
		it("soft-deletes without error", async () => {
			const eqMock = vi.fn().mockReturnValue({
				is: vi.fn().mockResolvedValue({ error: null }),
			});
			vi.mocked(getSupabase).mockReturnValue({
				from: () => ({ update: () => ({ eq: eqMock }) }),
			} as any);
			await expect(deleteProduct("p1")).resolves.toBeUndefined();
		});
	});
});
