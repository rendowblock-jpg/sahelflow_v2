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

		it("dispatches atomic_create_order RPC with the exact 18-arg payload (T1)", async () => {
			// T1: the security-critical atomic_create_order RPC (SECURITY DEFINER,
			// service_role-only, FOR UPDATE stock lock, insufficient-stock RAISE)
			// had ZERO tests asserting the call payload. Verify the 18 params
			// match the SQL signature in supabase/migrations/000_baseline.sql:962.
			const rpcMock = vi.fn().mockResolvedValue({
				data: { order_id: "ord-1", order_number: "SF-001", customer_id: "cust-1", status: "pending" },
				error: null,
			});
			// Chainable mock: .eq() returns an object that is BOTH thenable (resolves to {data,error})
			// AND has .single() / .in() / .limit() for the various call paths.
			const eqChain = () => {
				const c: any = {
					data: [],
					error: null,
					single: () => Promise.resolve({ data: null, error: null }),
					in: () => ({ eq: () => ({ neq: () => ({ gte: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }),
					then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
				};
				return c;
			};
			const supabase: any = {
				from: () => ({
					select: () => ({ eq: eqChain }),
					update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
					insert: vi.fn().mockResolvedValue({ error: null }),
				}),
				rpc: rpcMock,
			};
			const result = (await handleCreateOrder(
				{
					customer_name: "Ahmed",
					phone: "0555123456",
					wilaya: "Alger",
					commune: "Bab El Oued",
					address: "12 Rue Didouche",
					items: [{ name: "Parfum", quantity: 2, price: 1500 }],
					notes: "Livraison après 14h",
				},
				"seller-1",
				supabase,
			)) as any;

			expect(result.success).toBe(true);

			// Verify the RPC was called with the exact function name
			expect(rpcMock).toHaveBeenCalledTimes(1);
			expect(rpcMock.mock.calls[0][0]).toBe("atomic_create_order");

			// Verify the exact 18-arg payload shape (param names + values)
			const payload = rpcMock.mock.calls[0][1];
			expect(Object.keys(payload)).toHaveLength(18);
			expect(payload).toEqual({
				p_seller_id: "seller-1",
				p_customer_name: "Ahmed",
				p_customer_phone: "0555123456",
				p_customer_wilaya: "Alger",
				p_customer_commune: "Bab El Oued",
				p_customer_address: "12 Rue Didouche",
				p_items: [{ name: "Parfum", quantity: 2, price: 1500 }],
				p_total_price: 3000,
				p_delivery_cost: expect.any(Number),
				p_net_profit: 0,
				p_wilaya: "Alger",
				p_commune: "Bab El Oued",
				p_address: "12 Rue Didouche",
				p_source: "ai",
				p_external_id: null,
				p_notes: "Livraison après 14h",
				p_delivery_type: "home",
				p_status: "pending",
			});

			// Verify all 18 param names exactly match the SQL signature
			const expectedParamNames = [
				"p_seller_id", "p_customer_name", "p_customer_phone",
				"p_customer_wilaya", "p_customer_commune", "p_customer_address",
				"p_items", "p_total_price", "p_delivery_cost", "p_net_profit",
				"p_wilaya", "p_commune", "p_address", "p_source", "p_external_id",
				"p_notes", "p_delivery_type", "p_status",
			];
			expect(Object.keys(payload).sort()).toEqual([...expectedParamNames].sort());
		});

		it("propagates RPC error from atomic_create_order (T1)", async () => {
			// T1: when the RPC returns an error (e.g. insufficient stock, auth failure),
			// handleCreateOrder must surface it — not silently succeed.
			const rpcMock = vi.fn().mockResolvedValue({
				data: null,
				error: { message: "Insufficient stock for product abc. Available: 2, Requested: 5" },
			});
			const eqChain = () => {
				const c: any = {
					data: [],
					error: null,
					single: () => Promise.resolve({ data: null, error: null }),
					then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
				};
				return c;
			};
			const supabase: any = {
				from: () => ({
					select: () => ({ eq: eqChain }),
				}),
				rpc: rpcMock,
			};
			const result = (await handleCreateOrder(
				{
					customer_name: "Ahmed",
					phone: "0555123456",
					wilaya: "Alger",
					items: [{ name: "Parfum", quantity: 5, price: 1000 }],
				},
				"seller-1",
				supabase,
			)) as any;

			expect(result.success).toBeUndefined();
			expect(result.error).toContain("Failed to create order");
			expect(result.error).toContain("Insufficient stock");
			expect(rpcMock).toHaveBeenCalledTimes(1);
		});

		it("passes p_status='pending' and p_source='ai' for AI-created orders (T1)", async () => {
			// T1: verify the AI path always creates orders in 'pending' status
			// (NOT 'confirmed' — stock is only decremented on confirm).
			const rpcMock = vi.fn().mockResolvedValue({
				data: { order_id: "ord-1", order_number: "SF-001", customer_id: null, status: "pending" },
				error: null,
			});
			const eqChain = () => {
				const c: any = {
					data: [],
					error: null,
					single: () => Promise.resolve({ data: null, error: null }),
					then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
				};
				return c;
			};
			const supabase: any = {
				from: () => ({
					select: () => ({ eq: eqChain }),
				}),
				rpc: rpcMock,
			};
			await handleCreateOrder(
				{
					customer_name: "Sara",
					phone: "0661234567",
					wilaya: "Oran",
					items: [{ name: "Crème", quantity: 1, price: 800 }],
				},
				"seller-2",
				supabase,
			);

			const payload = rpcMock.mock.calls[0][1];
			expect(payload.p_status).toBe("pending");
			expect(payload.p_source).toBe("ai");
			expect(payload.p_seller_id).toBe("seller-2");
		});

		it("defaults optional fields to null when not provided (T1)", async () => {
			// T1: commune, address, external_id, notes should default to null.
			const rpcMock = vi.fn().mockResolvedValue({
				data: { order_id: "ord-1", order_number: "SF-002", customer_id: null, status: "pending" },
				error: null,
			});
			const eqChain = () => {
				const c: any = {
					data: [],
					error: null,
					single: () => Promise.resolve({ data: null, error: null }),
					then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
				};
				return c;
			};
			const supabase: any = {
				from: () => ({
					select: () => ({ eq: eqChain }),
				}),
				rpc: rpcMock,
			};
			await handleCreateOrder(
				{
					customer_name: "Karim",
					phone: "0771234567",
					wilaya: "Constantine",
					items: [{ name: "Huile", quantity: 1, price: 500 }],
				},
				"seller-1",
				supabase,
			);

			const payload = rpcMock.mock.calls[0][1];
			expect(payload.p_customer_commune).toBeNull();
			expect(payload.p_customer_address).toBeNull();
			expect(payload.p_external_id).toBeNull();
			expect(payload.p_notes).toBeNull();
			expect(payload.p_commune).toBeNull();
			expect(payload.p_address).toBeNull();
			expect(payload.p_delivery_type).toBe("home");
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
			const updateEqMock = vi
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
					update: () => ({ eq: updateEqMock }),
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
			const updateEqMock = vi
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
					update: () => ({ eq: updateEqMock }),
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
