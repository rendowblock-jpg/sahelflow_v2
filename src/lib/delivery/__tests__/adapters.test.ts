import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	getDeliveryAdapter,
	getAllDeliveryAdapters,
	YalidineAdapter,
	ZRExpressAdapter,
	MaystroAdapter,
	type ShipmentRequest,
} from "../adapters";

vi.mock("../yalidine-communes", () => ({
	getCommuneCode: vi.fn().mockResolvedValue(1601),
}));

import { getCommuneCode } from "../yalidine-communes";

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
		vi.clearAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe("Registry & Base Adapter", () => {
		it("registers all 3 adapters", () => {
			const adapters = getAllDeliveryAdapters();
			expect(adapters.length).toBe(3);
			const ids = adapters.map((a) => a.id);
			expect(ids).toContain("yalidine");
			expect(ids).toContain("zrexpress");
			expect(ids).toContain("maystro");
		});

		it("returns adapter by id", () => {
			const yalidine = getDeliveryAdapter("yalidine");
			expect(yalidine).toBeDefined();
			expect(yalidine?.name).toBe("Yalidine");
		});

		it("returns undefined for unknown adapter", () => {
			expect(getDeliveryAdapter("nonexistent")).toBeUndefined();
		});

		it("maps status labels correctly in base adapter", () => {
			const yalidine = getDeliveryAdapter("yalidine")!;
			expect(yalidine.getStatusLabel("pending")).toBe("En attente");
			expect(yalidine.getStatusLabel("delivered")).toBe("Livré");
		});
	});

	describe("YalidineAdapter", () => {
		const adapter = new YalidineAdapter();
		const credentials = { api_id: "test-id", api_token: "test-token" };

		it("has correct metadata", () => {
			expect(adapter.id).toBe("yalidine");
			expect(adapter.name).toBe("Yalidine");
			expect(adapter.logo).toBe("📦");
		});

		describe("createShipment", () => {
			it("fails gracefully without credentials", async () => {
				const result = await adapter.createShipment(mockShipment, {});
				expect(result.success).toBe(false);
				expect(result.error).toContain("Missing Yalidine API credentials");
			});

			it("creates shipment successfully with resolved commune code", async () => {
				vi.mocked(getCommuneCode).mockResolvedValueOnce(1601);
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						tracking: "YAL-123",
						label_url: "http://label.pdf",
						estimated_delivery: "2 days",
						price: 500,
					}),
				} as Response);

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(true);
				expect(result.trackingId).toBe("YAL-123");
				expect(result.labelUrl).toBe("http://label.pdf");
				expect(result.estimatedDelivery).toBe("2 days");
				expect(result.cost).toBe(500);
				expect(getCommuneCode).toHaveBeenCalled();
			});

			it("creates shipment fallback to string commune on commune lookup error", async () => {
				vi.mocked(getCommuneCode).mockRejectedValueOnce(new Error("Lookup fail"));
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => [
						{
							tracking_id: "YAL-456",
							delivery_label: "http://label2.pdf",
							price: "600",
						},
					],
				} as Response);

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(true);
				expect(result.trackingId).toBe("YAL-456");
				expect(result.labelUrl).toBe("http://label2.pdf");
				expect(result.cost).toBe(600);
			});

			it("handles empty fields and falsy values in Yalidine parcel response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({}),
				} as Response);

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(true);
				expect(result.trackingId).toBe("");
				expect(result.labelUrl).toBeUndefined();
				expect(result.estimatedDelivery).toBeUndefined();
				expect(result.cost).toBe(0);
			});

			it("handles API error response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: false,
					status: 400,
					text: async () => "Bad request payload",
				} as Response);

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(false);
				expect(result.error).toContain("Yalidine API error: 400 Bad request payload");
			});

			it("handles network failure", async () => {
				vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Timeout"));

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(false);
				expect(result.error).toBe("Timeout");
			});
		});

		describe("getTracking", () => {
			it("returns pending tracking without credentials", async () => {
				const tracking = await adapter.getTracking("TRK123", {});
				expect(tracking.status).toBe("pending");
				expect(tracking.events).toEqual([]);
			});

			it("tracks successfully", async () => {
				const mockHistories = [
					{ status: "Enregistre", date: "2026-06-11T12:00:00Z", wilaya: "Alger" },
					{ status: "En transit", date: "2026-06-11T14:00:00Z", wilaya: "Oran" },
					{ status: "Livré", date: "2026-06-11T16:00:00Z", wilaya: "Oran" },
				];

				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => mockHistories,
				} as Response);

				const result = await adapter.getTracking("TRK123", credentials);
				expect(result.trackingId).toBe("TRK123");
				expect(result.status).toBe("delivered");
				expect(result.events).toHaveLength(3);
				expect(result.events[0]).toEqual({
					status: "pending",
					timestamp: "2026-06-11T12:00:00Z",
					location: "Alger",
					details: "Enregistre",
				});
				expect(result.events[1].status).toBe("in_transit");
				expect(result.events[2].status).toBe("delivered");
			});

			it("tracks successfully from wrapped data object with alternative fields", async () => {
				const mockHistories = {
					data: [
						{ current_status: "Récupéré", created_at: "2026-06-11T12:00:00Z", location: "Alger" },
						{ current_status: "Recupere", details: "Handed over", location: "Alger" },
						{ current_status: "Au hub" },
						{ current_status: "En livraison" },
						{ current_status: "Livre" },
						{ current_status: "Retourné" },
						{ current_status: "Retourne" },
						{ current_status: "Refusé" },
						{ current_status: "Refuse" },
					],
				};

				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => mockHistories,
				} as Response);

				const result = await adapter.getTracking("TRK123", credentials);
				expect(result.status).toBe("refused");
				expect(result.events[0].status).toBe("picked_up");
				expect(result.events[1].status).toBe("picked_up");
				expect(result.events[2].status).toBe("at_hub");
				expect(result.events[3].status).toBe("out_for_delivery");
				expect(result.events[4].status).toBe("delivered");
				expect(result.events[5].status).toBe("returned");
				expect(result.events[6].status).toBe("returned");
				expect(result.events[7].status).toBe("refused");
				expect(result.events[8].status).toBe("refused");
			});

			it("handles empty events histories list", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => [],
				} as Response);

				const result = await adapter.getTracking("TRK123", credentials);
				expect(result.status).toBe("pending");
				expect(result.events).toHaveLength(0);
			});

			it("handles non-ok tracking response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: false,
					status: 404,
				} as Response);

				const result = await adapter.getTracking("TRK123", credentials);
				expect(result.status).toBe("pending");
				expect(result.events).toEqual([]);
			});

			it("handles network failure", async () => {
				vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Network disconnect"));

				const result = await adapter.getTracking("TRK123", credentials);
				expect(result.status).toBe("pending");
				expect(result.events).toEqual([]);
			});
		});

		describe("cancelShipment", () => {
			it("returns false without credentials", async () => {
				const result = await adapter.cancelShipment("TRK123", {});
				expect(result.success).toBe(false);
			});

			it("cancels successfully", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
				} as Response);

				const result = await adapter.cancelShipment("TRK123", credentials);
				expect(result.success).toBe(true);
			});

			it("handles cancel failure response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: false,
				} as Response);

				const result = await adapter.cancelShipment("TRK123", credentials);
				expect(result.success).toBe(false);
			});

			it("handles cancel network failure", async () => {
				vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Cancel error"));

				const result = await adapter.cancelShipment("TRK123", credentials);
				expect(result.success).toBe(false);
			});
		});

		describe("getDeliveryCost", () => {
			it("returns 0 cost without credentials", async () => {
				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, {});
				expect(cost).toBe(0);
			});

			it("returns cost from array response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => [{ price: 450 }],
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(450);
			});

			it("returns cost from array response with cost field", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => [{ cost: 480 }],
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(480);
			});

			it("returns cost from object response with price field", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({ price: 470 }),
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(470);
			});

			it("returns cost from object response with cost field", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({ cost: 490 }),
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(490);
			});

			it("returns 0 if fields missing in response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({}),
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(0);
			});

			it("handles empty array response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => [],
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(0);
			});

			it("handles non-ok cost response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: false,
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(0);
			});

			it("handles network failure", async () => {
				vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Connection lost"));

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(0);
			});
		});
	});

	describe("ZRExpressAdapter (Procolis)", () => {
		const adapter = new ZRExpressAdapter();
		const credentials = { api_id: "test-id", api_key: "test-key" };

		it("has correct metadata", () => {
			expect(adapter.id).toBe("zrexpress");
			expect(adapter.name).toBe("ZR Express");
			expect(adapter.logo).toBe("✈️");
		});

		describe("createShipment", () => {
			it("fails gracefully without credentials", async () => {
				const result = await adapter.createShipment(mockShipment, {});
				expect(result.success).toBe(false);
				expect(result.error).toContain("Missing ZR Express API credentials");
			});

			it("creates shipment successfully", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						tracking: "ZR-123",
						label_url: "http://zr.pdf",
						frais: 600,
					}),
				} as Response);

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(true);
				expect(result.trackingId).toBe("ZR-123");
				expect(result.labelUrl).toBe("http://zr.pdf");
				expect(result.cost).toBe(600);
			});

			it("creates shipment successfully with alternative response fields", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						bordereau: "ZR-456",
						pdf_url: "http://zr-label.pdf",
						tarif: "650",
					}),
				} as Response);

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(true);
				expect(result.trackingId).toBe("ZR-456");
				expect(result.labelUrl).toBe("http://zr-label.pdf");
				expect(result.cost).toBe(650);
			});

			it("creates shipment successfully with id response field and missing label", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						id: "ZR-789",
					}),
				} as Response);

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(true);
				expect(result.trackingId).toBe("ZR-789");
				expect(result.labelUrl).toBeUndefined();
				expect(result.cost).toBe(0);
			});

			it("handles API error response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: false,
					status: 400,
					text: async () => "Bad Key",
				} as Response);

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(false);
				expect(result.error).toContain("ZR Express API: 400 Bad Key");
			});

			it("handles network failure", async () => {
				vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Timeout"));

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(false);
				expect(result.error).toBe("Timeout");
			});
		});

		describe("getTracking", () => {
			it("returns pending tracking without credentials", async () => {
				const tracking = await adapter.getTracking("TRK123", {});
				expect(tracking.status).toBe("pending");
			});

			it("tracks successfully with history and fallbacks", async () => {
				const mockZRTracking = {
					status: "Refusé",
					historique: [
						{ statut: "Nouveau", date: "2026-06-11", centre: "Alger" },
						{ statut: "Ramassé", date: "2026-06-12", wilaya: "Oran" },
						{ statut: "En transit" },
						{ statut: "Au hub" },
						{ statut: "En cours de livraison" },
						{ statut: "Livré" },
						{ statut: "Retourné" },
						{ statut: "Refusé" },
					],
				};

				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => mockZRTracking,
				} as Response);

				const result = await adapter.getTracking("TRK123", credentials);
				expect(result.status).toBe("refused");
				expect(result.events).toHaveLength(8);
				expect(result.events[0].status).toBe("pending");
				expect(result.events[1].status).toBe("picked_up");
				expect(result.events[1].location).toBe("Oran");
				expect(result.events[2].status).toBe("in_transit");
				expect(result.events[2].location).toBe("");
				expect(result.events[3].status).toBe("at_hub");
				expect(result.events[4].status).toBe("out_for_delivery");
				expect(result.events[5].status).toBe("delivered");
				expect(result.events[6].status).toBe("returned");
				expect(result.events[7].status).toBe("refused");
			});

			it("handles empty tracking history list", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({}),
				} as Response);

				const result = await adapter.getTracking("TRK123", credentials);
				expect(result.status).toBe("pending");
				expect(result.events).toHaveLength(0);
			});

			it("handles non-ok tracking response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: false,
				} as Response);

				const result = await adapter.getTracking("TRK123", credentials);
				expect(result.status).toBe("pending");
				expect(result.events).toEqual([]);
			});

			it("handles network failure", async () => {
				vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("ZR tracking error"));

				const result = await adapter.getTracking("TRK123", credentials);
				expect(result.status).toBe("pending");
			});
		});

		describe("cancelShipment", () => {
			it("returns false without credentials", async () => {
				const result = await adapter.cancelShipment("TRK123", {});
				expect(result.success).toBe(false);
			});

			it("cancels successfully", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
				} as Response);

				const result = await adapter.cancelShipment("TRK123", credentials);
				expect(result.success).toBe(true);
			});

			it("handles network failure", async () => {
				vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("ZR delete error"));

				const result = await adapter.cancelShipment("TRK123", credentials);
				expect(result.success).toBe(false);
			});
		});

		describe("getDeliveryCost", () => {
			it("returns 0 cost without credentials", async () => {
				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, {});
				expect(cost).toBe(0);
			});

			it("returns cost successfully with tarif_domicile", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({ tarif_domicile: 550 }),
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(550);
			});

			it("returns cost successfully with tarif", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({ tarif: 560 }),
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(560);
			});

			it("returns cost successfully with price", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({ price: 570 }),
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(570);
			});

			it("returns 0 cost if missing in response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({}),
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(0);
			});

			it("handles non-ok cost response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: false,
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(0);
			});

			it("handles network failure", async () => {
				vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("ZR fee error"));

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(0);
			});
		});
	});

	describe("MaystroAdapter", () => {
		const adapter = new MaystroAdapter();
		const credentials = { api_token: "test-token" };

		it("has correct metadata", () => {
			expect(adapter.id).toBe("maystro");
			expect(adapter.name).toBe("Maystro Delivery");
			expect(adapter.logo).toBe("🚚");
		});

		describe("createShipment", () => {
			it("fails gracefully without api_token", async () => {
				const result = await adapter.createShipment(mockShipment, {});
				expect(result.success).toBe(false);
				expect(result.error).toContain("Missing Maystro API token");
			});

			it("creates shipment successfully", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						tracking_number: "M-123",
						label_url: "http://maystro.pdf",
						delivery_fee: 500,
					}),
				} as Response);

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(true);
				expect(result.trackingId).toBe("M-123");
				expect(result.labelUrl).toBe("http://maystro.pdf");
				expect(result.cost).toBe(500);
			});

			it("creates shipment successfully with alternative id field", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						id: "M-456",
					}),
				} as Response);

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(true);
				expect(result.trackingId).toBe("M-456");
				expect(result.labelUrl).toBeUndefined();
				expect(result.cost).toBe(0);
			});

			it("handles API error response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: false,
					status: 401,
					text: async () => "Unauthorized",
				} as Response);

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(false);
				expect(result.error).toContain("Maystro API: 401 Unauthorized");
			});

			it("handles network failure", async () => {
				vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Timeout"));

				const result = await adapter.createShipment(mockShipment, credentials);
				expect(result.success).toBe(false);
				expect(result.error).toBe("Timeout");
			});
		});

		describe("getTracking", () => {
			it("returns pending tracking without credentials", async () => {
				const tracking = await adapter.getTracking("TRK123", {});
				expect(tracking.status).toBe("pending");
			});

			it("tracks successfully with history and fallbacks", async () => {
				const mockMaystroTracking = {
					status: "refused",
					events: [
						{ status: "pending", timestamp: "2026-06-11T12:00:00Z", location: "Alger", description: "Registered" },
						{ status: "picked_up", date: "2026-06-11T13:00:00Z" },
						{ status: "in_transit" },
						{ status: "at_hub" },
						{ status: "out_for_delivery" },
						{ status: "delivered", timestamp: "2026-06-12T12:00:00Z", location: "Oran", description: "Delivered successfully" },
						{ status: "returned" },
						{ status: "refused" },
					],
				};

				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => mockMaystroTracking,
				} as Response);

				const result = await adapter.getTracking("TRK123", credentials);
				expect(result.status).toBe("refused");
				expect(result.events).toHaveLength(8);
				expect(result.events[0].status).toBe("pending");
				expect(result.events[1].status).toBe("picked_up");
				expect(result.events[1].timestamp).toBe("2026-06-11T13:00:00Z");
				expect(result.events[1].details).toBe("picked_up");
				expect(result.events[2].status).toBe("in_transit");
				expect(result.events[2].timestamp).toBe("");
				expect(result.events[2].details).toBe("in_transit");
				expect(result.events[3].status).toBe("at_hub");
				expect(result.events[4].status).toBe("out_for_delivery");
				expect(result.events[5].status).toBe("delivered");
				expect(result.events[6].status).toBe("returned");
				expect(result.events[7].status).toBe("refused");
			});

			it("handles missing tracking status or events list", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({}),
				} as Response);

				const result = await adapter.getTracking("TRK123", credentials);
				expect(result.status).toBe("pending");
				expect(result.events).toHaveLength(0);
			});

			it("handles non-ok tracking response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: false,
				} as Response);

				const result = await adapter.getTracking("TRK123", credentials);
				expect(result.status).toBe("pending");
				expect(result.events).toEqual([]);
			});

			it("handles network failure", async () => {
				vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Maystro tracking error"));

				const result = await adapter.getTracking("TRK123", credentials);
				expect(result.status).toBe("pending");
			});
		});

		describe("cancelShipment", () => {
			it("returns false without credentials", async () => {
				const result = await adapter.cancelShipment("TRK123", {});
				expect(result.success).toBe(false);
			});

			it("cancels successfully", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
				} as Response);

				const result = await adapter.cancelShipment("TRK123", credentials);
				expect(result.success).toBe(true);
			});

			it("handles network failure", async () => {
				vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Maystro cancel error"));

				const result = await adapter.cancelShipment("TRK123", credentials);
				expect(result.success).toBe(false);
			});
		});

		describe("getDeliveryCost", () => {
			it("returns 0 cost without credentials", async () => {
				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, {});
				expect(cost).toBe(0);
			});

			it("returns cost successfully with home_delivery", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({ home_delivery: 480 }),
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(480);
			});

			it("returns cost successfully with desk_delivery fallback", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({ desk_delivery: 420 }),
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(420);
			});

			it("returns 0 cost if missing in response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: true,
					json: async () => ({}),
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(0);
			});

			it("handles non-ok cost response", async () => {
				vi.mocked(globalThis.fetch).mockResolvedValueOnce({
					ok: false,
				} as Response);

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(0);
			});

			it("handles network failure", async () => {
				vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Maystro fee error"));

				const cost = await adapter.getDeliveryCost("Algiers", "Oran", 1, credentials);
				expect(cost).toBe(0);
			});
		});
	});
});
