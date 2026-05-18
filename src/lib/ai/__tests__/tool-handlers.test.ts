import { describe, it, expect, vi } from "vitest";
import {
	handleUpdateOrderStatus,
	handleCreateOrder,
	handleDeleteOrder,
	handleCreateProduct,
	handleDeleteProduct,
} from "@/lib/ai/tool-handlers";

describe("tool-handlers", () => {
	describe("handleUpdateOrderStatus", () => {
		it("returns error when params missing", async () => {
			const result = await handleUpdateOrderStatus(
				{ order_number: "", new_status: "" },
				"seller-1",
				{} as any,
			);
			expect(result.error).toContain("required");
		});

		it("returns error when order not found", async () => {
			const supabase: any = {
				from: () => ({
					select: () => ({
						eq: () => ({
							eq: () => ({
								single: vi.fn().mockResolvedValue({ data: null, error: null }),
							}),
						}),
					}),
				}),
			};
			const result = await handleUpdateOrderStatus(
				{ order_number: "SF-001", new_status: "confirmed" },
				"seller-1",
				supabase,
			);
			expect(result.error).toContain("not found");
		});

		it("returns success on valid update", async () => {
			const rpcMock = vi.fn().mockResolvedValue({ error: null });
			const supabase: any = {
				from: () => ({
					select: () => ({
						eq: () => ({
							eq: () => ({
								single: vi.fn().mockResolvedValue({
									data: { id: "ord-1", status: "pending" },
									error: null,
								}),
							}),
						}),
					}),
				}),
				rpc: rpcMock,
			};
			const result = await handleUpdateOrderStatus(
				{ order_number: "SF-001", new_status: "confirmed" },
				"seller-1",
				supabase,
			);
			expect(result.success).toBe(true);
			expect(result.previous_status).toBe("pending");
		});
	});

	describe("handleCreateOrder", () => {
		it("returns error when required fields missing", async () => {
			const result = await handleCreateOrder(
				{ customer_name: "", phone: "", wilaya: "Alger", items: [] },
				"seller-1",
				{} as any,
			);
			expect(result.error).toContain("required");
		});

		it("returns error for invalid Algerian phone", async () => {
			const result = await handleCreateOrder(
				{
					customer_name: "Ahmed",
					phone: "123456789",
					wilaya: "Alger",
					items: [{ name: "Parfum", quantity: 1, price: 1000 }],
				},
				"seller-1",
				{} as any,
			);
			expect(result.error).toContain("phone");
		});

		it("creates order with valid data", async () => {
			const rpcMock = vi.fn().mockResolvedValue({
				data: {
					order_id: "ord-1",
					order_number: "SF-001",
					customer_id: "cust-1",
				},
				error: null,
			});
			const supabase: any = {
				from: () => ({
					select: () => ({
						eq: () => ({
							data: [],
							error: null,
						}),
					}),
				}),
				rpc: rpcMock,
			};
			const result = (await handleCreateOrder(
				{
					customer_name: "Ahmed",
					phone: "0555123456",
					wilaya: "Alger",
					items: [{ name: "Parfum", quantity: 1, price: 1000 }],
				},
				"seller-1",
				supabase,
			)) as any;
			expect(result.success).toBe(true);
			expect(result.order_number).toBe("SF-001");
		});
	});

	describe("handleDeleteOrder", () => {
		it("returns error when order_number missing", async () => {
			const result = await handleDeleteOrder(
				{ order_number: "" },
				"seller-1",
				{} as any,
			);
			expect(result.error).toContain("order_number");
		});

		it("deletes order when found", async () => {
			const deleteEqMock = vi
				.fn()
				.mockResolvedValue({ data: null, error: null });
			const supabase: any = {
				from: () => ({
					select: () => ({
						eq: () => ({
							eq: () => ({
								single: vi
									.fn()
									.mockResolvedValue({ data: { id: "ord-1" }, error: null }),
							}),
						}),
					}),
					delete: () => ({ eq: deleteEqMock }),
				}),
			};
			const result = (await handleDeleteOrder(
				{ order_number: "SF-001" },
				"seller-1",
				supabase,
			)) as any;
			expect(result.success).toBe(true);
		});
	});

	describe("handleCreateProduct", () => {
		it("returns error when name missing", async () => {
			const result = await handleCreateProduct(
				{ name: "", price: 100, stock: 5 },
				"seller-1",
				{} as any,
			);
			expect(result.error).toContain("name and price");
		});

		it("creates product with valid data", async () => {
			const supabase: any = {
				from: () => ({
					insert: vi.fn().mockResolvedValue({ error: null }),
				}),
			};
			const result = await handleCreateProduct(
				{ name: "Parfum", price: 1000, stock: 10 },
				"seller-1",
				supabase,
			);
			expect(result.success).toBe(true);
		});
	});

	describe("handleDeleteProduct", () => {
		it("returns error when name missing", async () => {
			const result = await handleDeleteProduct(
				{ name: "" },
				"seller-1",
				{} as any,
			);
			expect(result.error).toContain("name");
		});

		it("deletes product when found", async () => {
			const deleteEqMock = vi
				.fn()
				.mockResolvedValue({ data: null, error: null });
			const supabase: any = {
				from: () => ({
					select: () => ({
						eq: () => ({
							ilike: () => ({
								limit: vi.fn().mockResolvedValue({
									data: [{ id: "prod-1", name: "Parfum" }],
									error: null,
								}),
							}),
						}),
					}),
					delete: () => ({ eq: deleteEqMock }),
				}),
			};
			const result = (await handleDeleteProduct(
				{ name: "Parfum" },
				"seller-1",
				supabase,
			)) as any;
			expect(result.success).toBe(true);
		});
	});
});
