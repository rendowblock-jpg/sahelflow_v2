import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	getDeliveryAdapter,
	getAllDeliveryAdapters,
	YalidineAdapter,
	ZRExpressAdapter,
	MaystroAdapter,
	type ShipmentRequest,
} from "../adapters";

const mockShipment: ShipmentRequest = {
	orderId: "ord-123",
	orderNumber: "SF-001",
	customer: {
		name: "Ahmed Ben",
		phone: "0555123456",
		wilaya: "Algiers",
		commune: "Bab Ezzouar",
		address: "123 Main St",
	},
	items: [{ name: "T-Shirt", quantity: 2, unitPrice: 1500 }],
	totalPrice: 3000,
	weight: 1.5,
};

describe("Delivery Adapters", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = vi.fn(() =>
			Promise.resolve({
				ok: false,
				status: 500,
				text: () => Promise.resolve("mock error"),
			} as Response),
		);
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe("Registry", () => {
		it("registers all 3 adapters", () => {
			const adapters = getAllDeliveryAdapters();
			expect(adapters.length).toBe(3);
			const ids = adapters.map((a) => a.id);
			expect(ids).toContain("yalidine");
			expect(ids).toContain("zrexpress");
			expect(ids).toContain("maystro");
		});

		it("does NOT register iCom", () => {
			const adapters = getAllDeliveryAdapters();
			const ids = adapters.map((a) => a.id);
			expect(ids).not.toContain("icom");
		});

		it("returns adapter by id", () => {
			const yalidine = getDeliveryAdapter("yalidine");
			expect(yalidine).toBeDefined();
			expect(yalidine?.name).toBe("Yalidine");
		});

		it("returns undefined for unknown adapter", () => {
			expect(getDeliveryAdapter("nonexistent")).toBeUndefined();
		});
	});

	describe("YalidineAdapter", () => {
		const adapter = new YalidineAdapter();

		it("has correct metadata", () => {
			expect(adapter.id).toBe("yalidine");
			expect(adapter.name).toBe("Yalidine");
			expect(adapter.logo).toBe("📦");
		});

		it("fails gracefully without credentials", async () => {
			const result = await adapter.createShipment(mockShipment, {});
			expect(result.success).toBe(false);
			expect(result.error).toContain("Missing Yalidine API credentials");
		});

		it("returns 0 cost without credentials", async () => {
			const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, {});
			expect(cost).toBe(0);
		});

		it("returns pending tracking without credentials", async () => {
			const tracking = await adapter.getTracking("TRK123", {});
			expect(tracking.status).toBe("pending");
			expect(tracking.deliveryCompany).toBe("Yalidine");
			expect(tracking.events).toEqual([]);
		});
	});

	describe("ZRExpressAdapter (Procolis)", () => {
		const adapter = new ZRExpressAdapter();

		it("has correct metadata", () => {
			expect(adapter.id).toBe("zrexpress");
			expect(adapter.name).toBe("ZR Express");
			expect(adapter.logo).toBe("✈️");
		});

		it("fails gracefully without api_id or api_key", async () => {
			const result = await adapter.createShipment(mockShipment, {});
			expect(result.success).toBe(false);
			expect(result.error).toContain("Missing ZR Express API credentials");
		});

		it("accepts api_id + api_key credentials", async () => {
			const result = await adapter.createShipment(mockShipment, {
				api_id: "test-id",
				api_key: "test-key",
			});
			// Will fail at network level but should not error on credentials check
			expect(result.error).not.toContain("Missing ZR Express API credentials");
		});

		it("returns 0 cost without credentials", async () => {
			const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, {});
			expect(cost).toBe(0);
		});

		it("returns pending tracking without credentials", async () => {
			const tracking = await adapter.getTracking("TRK123", {});
			expect(tracking.status).toBe("pending");
			expect(tracking.deliveryCompany).toBe("ZR Express");
		});
	});

	describe("MaystroAdapter", () => {
		const adapter = new MaystroAdapter();

		it("has correct metadata", () => {
			expect(adapter.id).toBe("maystro");
			expect(adapter.name).toBe("Maystro Delivery");
			expect(adapter.logo).toBe("🚚");
		});

		it("fails gracefully without api_token", async () => {
			const result = await adapter.createShipment(mockShipment, {});
			expect(result.success).toBe(false);
			expect(result.error).toContain("Missing Maystro API token");
		});

		it("accepts api_token credential", async () => {
			const result = await adapter.createShipment(mockShipment, {
				api_token: "test-token",
			});
			expect(result.error).not.toContain("Missing Maystro API token");
		});

		it("returns 0 cost without credentials", async () => {
			const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, {});
			expect(cost).toBe(0);
		});

		it("returns pending tracking without credentials", async () => {
			const tracking = await adapter.getTracking("TRK123", {});
			expect(tracking.status).toBe("pending");
			expect(tracking.deliveryCompany).toBe("Maystro");
		});
	});
});
