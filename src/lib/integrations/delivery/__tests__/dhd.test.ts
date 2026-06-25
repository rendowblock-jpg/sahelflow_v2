import { describe, it, expect, vi, beforeEach } from "vitest";
import { dhdAdapter } from "../dhd";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("DHD delivery adapter", () => {
  beforeEach(() => {
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
  });
});
