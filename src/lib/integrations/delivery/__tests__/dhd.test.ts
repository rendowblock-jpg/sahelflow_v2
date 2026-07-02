import { describe, it, expect, vi, beforeEach } from "vitest";
import { dhdAdapter } from "../dhd";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("DHD delivery adapter", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  const validCreds = { apiToken: "test-dhd-token" };

  describe("estimateCost", () => {
    it("returns unavailable when no API token", async () => {
      const result = await dhdAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        {},
      );
      expect(result.available).toBe(false);
      expect(result.error).toContain("not configured");
    });

    it("returns cost on successful API call", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prix: 450 }),
      });

      const result = await dhdAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(true);
      expect(result.cost).toBe(450);
      expect(result.provider).toBe("dhd");
    });

    it("returns error on API failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      const result = await dhdAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(false);
      expect(result.error).toContain("401");
    });

    it("sends Bearer auth + French field names to /tarification", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prix: 450 }),
      });

      await dhdAdapter.estimateCost(
        { wilaya: "Alger", commune: "Hydra", weight: 2.5, codAmount: 5000 },
        validCreds,
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://platform.dhd-dz.com/api/tarification");
      const init = opts as RequestInit;
      expect(init.method).toBe("POST");
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-dhd-token");
      const body = JSON.parse(init.body as string);
      expect(body.wilaya).toBe("Alger");
      expect(body.commune).toBe("Hydra");
      expect(body.poids).toBe(2.5);
      expect(body.montant).toBe(5000);
    });

    it("falls back to tarif or price when prix is absent", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tarif: 380 }),
      });
      const r = await dhdAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(r.cost).toBe(380);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ price: 520 }),
      });
      const r2 = await dhdAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(r2.cost).toBe(520);
    });

    it("returns estimatedDays when present", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prix: 450, estimated_days: "2-4" }),
      });
      const r = await dhdAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(r.estimatedDays).toBe("2-4");
    });

    it("returns error on network failure (fetch throws)", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const r = await dhdAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(r.available).toBe(false);
      expect(r.error).toContain("ECONNREFUSED");
    });
  });

  describe("createShipment", () => {
    it("returns error when no API token", async () => {
      const result = await dhdAdapter.createShipment(
        {
          orderId: "order-1",
          orderNumber: "ORD-001",
          customer: { name: "Test", phone: "0600000000", wilaya: "Alger", commune: "Alger", address: "Test" },
          items: [{ name: "Product", quantity: 1, unitPrice: 5000 }],
          totalPrice: 5000,
          weight: 1,
        },
        {},
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
    });

    it("creates shipment successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracking: "DHD123456", prix: 450 }),
      });

      const result = await dhdAdapter.createShipment(
        {
          orderId: "order-1",
          orderNumber: "ORD-001",
          customer: { name: "Test", phone: "0600000000", wilaya: "Alger", commune: "Alger", address: "Test" },
          items: [{ name: "Product", quantity: 1, unitPrice: 5000 }],
          totalPrice: 5000,
          weight: 1,
        },
        validCreds,
      );
      expect(result.success).toBe(true);
      expect(result.trackingId).toBe("DHD123456");
      expect(result.cost).toBe(450);
    });

    it("sends POST /add_colis with French field body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracking: "T1", prix: 100 }),
      });

      await dhdAdapter.createShipment(
        {
          orderId: "o1",
          orderNumber: "ORD-001",
          customer: { name: "Alice", phone: "0555111222", wilaya: "Alger", commune: "Hydra", address: "1 Rue" },
          items: [{ name: "Widget", quantity: 2, unitPrice: 1000 }],
          totalPrice: 2000,
          weight: 0.5,
          notes: "livrer apres 18h",
        },
        validCreds,
      );

      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://platform.dhd-dz.com/api/add_colis");
      const init = opts as RequestInit;
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body.nom).toBe("Alice");
      expect(body.telephone).toBe("0555111222");
      expect(body.wilaya).toBe("Alger");
      expect(body.commune).toBe("Hydra");
      expect(body.adresse).toBe("1 Rue");
      expect(body.montant).toBe(2000);
      expect(body.poids).toBe(0.5);
      expect(body.note).toBe("livrer apres 18h");
      expect(body.produits).toContain("Widget x2");
      expect(body.type).toBe("livraison");
    });

    it("sets type to 'echange' when isExchange=true", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tracking: "T2" }),
      });

      await dhdAdapter.createShipment(
        {
          orderId: "o2",
          orderNumber: "ORD-002",
          customer: { name: "Bob", phone: "0555333444", wilaya: "Oran", commune: "Hydra", address: "2 Rue" },
          items: [{ name: "X", quantity: 1, unitPrice: 100 }],
          totalPrice: 100,
          weight: 1,
          isExchange: true,
        },
        validCreds,
      );

      const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.type).toBe("echange");
    });

    it("falls back to code_suivi or id when tracking is absent", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code_suivi: "CS-001" }),
      });
      const r = await dhdAdapter.createShipment(
        {
          orderId: "o", orderNumber: "O",
          customer: { name: "T", phone: "0555", wilaya: "Alger", commune: "A", address: "A" },
          items: [{ name: "P", quantity: 1, unitPrice: 1 }],
          totalPrice: 1, weight: 1,
        },
        validCreds,
      );
      expect(r.trackingId).toBe("CS-001");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 42 }),
      });
      const r2 = await dhdAdapter.createShipment(
        {
          orderId: "o", orderNumber: "O",
          customer: { name: "T", phone: "0555", wilaya: "Alger", commune: "A", address: "A" },
          items: [{ name: "P", quantity: 1, unitPrice: 1 }],
          totalPrice: 1, weight: 1,
        },
        validCreds,
      );
      expect(r2.trackingId).toBe("42");
    });

    it("returns error when response has an error field", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: "Out of delivery zone" }),
      });
      const r = await dhdAdapter.createShipment(
        {
          orderId: "o", orderNumber: "O",
          customer: { name: "T", phone: "0555", wilaya: "Alger", commune: "A", address: "A" },
          items: [{ name: "P", quantity: 1, unitPrice: 1 }],
          totalPrice: 1, weight: 1,
        },
        validCreds,
      );
      expect(r.success).toBe(false);
      expect(r.error).toBe("Out of delivery zone");
    });

    it("returns error on non-OK API response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Server error",
      });
      const r = await dhdAdapter.createShipment(
        {
          orderId: "o", orderNumber: "O",
          customer: { name: "T", phone: "0555", wilaya: "Alger", commune: "A", address: "A" },
          items: [{ name: "P", quantity: 1, unitPrice: 1 }],
          totalPrice: 1, weight: 1,
        },
        validCreds,
      );
      expect(r.success).toBe(false);
      expect(r.error).toContain("500");
    });

    it("returns error on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network down"));
      const r = await dhdAdapter.createShipment(
        {
          orderId: "o", orderNumber: "O",
          customer: { name: "T", phone: "0555", wilaya: "Alger", commune: "A", address: "A" },
          items: [{ name: "P", quantity: 1, unitPrice: 1 }],
          totalPrice: 1, weight: 1,
        },
        validCreds,
      );
      expect(r.success).toBe(false);
      expect(r.error).toContain("network down");
    });
  });

  describe("syncTracking", () => {
    it("throws when no API token", async () => {
      await expect(
        dhdAdapter.syncTracking("DHD123", {}),
      ).rejects.toThrow("not configured");
    });

    it("returns tracking info on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          statut: "Livré",
          historique: [
            { statut: "Nouveau", date: "2026-01-01T00:00:00Z" },
            { statut: "Livré", date: "2026-01-02T00:00:00Z" },
          ],
        }),
      });

      const result = await dhdAdapter.syncTracking("DHD123", validCreds);
      expect(result.trackingId).toBe("DHD123");
      expect(result.status).toBe("delivered");
      expect(result.events).toHaveLength(2);
      expect(result.deliveryCompany).toBe("DHD Delivery");
    });

    it("sends GET /lire/{tracking} with Bearer auth", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ statut: "Livré", historique: [] }),
      });
      await dhdAdapter.syncTracking("DHD999", validCreds);
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://platform.dhd-dz.com/api/lire/DHD999");
      const init = opts as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-dhd-token");
    });

    it("throws on non-OK API response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not found",
      });
      await expect(
        dhdAdapter.syncTracking("DHD123", validCreds),
      ).rejects.toThrow("404");
    });

    it("falls back to status/situation fields when statut is absent", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "Returned", historique: [] }),
      });
      const r = await dhdAdapter.syncTracking("X", validCreds);
      expect(r.status).toBe("returned");
    });

    it("uses events array when historique is absent", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          statut: "Livré",
          events: [
            { status: "Nouveau", timestamp: "2026-01-01T00:00:00Z", location: "Hub" },
            { status: "Livré", timestamp: "2026-01-02T00:00:00Z", location: "Customer" },
          ],
        }),
      });
      const r = await dhdAdapter.syncTracking("X", validCreds);
      expect(r.events).toHaveLength(2);
      expect(r.events[0]!.location).toBe("Hub");
    });

    it("adds a synthetic event when history is empty", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ statut: "En transit", historique: [] }),
      });
      const r = await dhdAdapter.syncTracking("X", validCreds);
      expect(r.events).toHaveLength(1);
      expect(r.events[0]!.status).toBe("in_transit");
      expect(r.events[0]!.details).toBe("En transit");
    });
  });

  describe("cancelShipment", () => {
    it("returns error when no API token", async () => {
      const result = await dhdAdapter.cancelShipment!("DHD123", {});
      expect(result.success).toBe(false);
    });

    it("cancels successfully", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const result = await dhdAdapter.cancelShipment!("DHD123", validCreds);
      expect(result.success).toBe(true);
    });

    it("sends PUT /cancel/{tracking} with Bearer auth", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await dhdAdapter.cancelShipment!("DHD123", validCreds);
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://platform.dhd-dz.com/api/cancel/DHD123");
      const init = opts as RequestInit;
      expect(init.method).toBe("PUT");
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-dhd-token");
    });

    it("returns error on non-OK API response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      });
      const r = await dhdAdapter.cancelShipment!("DHD123", validCreds);
      expect(r.success).toBe(false);
      expect(r.error).toContain("403");
    });

    it("returns error on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNRESET"));
      const r = await dhdAdapter.cancelShipment!("DHD123", validCreds);
      expect(r.success).toBe(false);
      expect(r.error).toContain("ECONNRESET");
    });
  });

  describe("status mapping", () => {
    it("maps French status strings correctly", async () => {
      const statuses = [
        { input: "Nouveau", expected: "created" },
        { input: "Ramassé", expected: "picked_up" },
        { input: "En transit", expected: "in_transit" },
        { input: "Livré", expected: "delivered" },
        { input: "Retour", expected: "returned" },
        { input: "Refusé", expected: "refused" },
      ];

      for (const { input, expected } of statuses) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ statut: input, historique: [] }),
        });
        const result = await dhdAdapter.syncTracking("test", validCreds);
        expect(result.status).toBe(expected);
      }
    });

    it("maps English status strings correctly", async () => {
      const statuses = [
        { input: "picked up", expected: "picked_up" },
        { input: "out for delivery", expected: "out_for_delivery" },
        { input: "delivered", expected: "delivered" },
        { input: "returned", expected: "returned" },
        { input: "refused", expected: "refused" },
        { input: "cancelled", expected: "failed" },
        { input: "failed", expected: "failed" },
        { input: "at hub", expected: "in_transit" },
      ];
      for (const { input, expected } of statuses) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ statut: input, historique: [] }),
        });
        const result = await dhdAdapter.syncTracking("test", validCreds);
        expect(result.status).toBe(expected);
      }
    });

    it("defaults to in_transit for unknown statuses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ statut: "weird status", historique: [] }),
      });
      const r = await dhdAdapter.syncTracking("X", validCreds);
      expect(r.status).toBe("in_transit");
    });
  });
});
