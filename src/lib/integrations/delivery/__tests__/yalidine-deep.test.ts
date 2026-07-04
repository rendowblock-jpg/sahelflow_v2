/**
 * Yalidine delivery adapter — deep tests (T-INTEGRATIONS).
 *
 * Companion to yalidine.test.ts (which only covers metadata). This file adds
 * full coverage of estimateCost / createShipment / syncTracking / cancelShipment
 * including: no-creds, success, API errors, network errors, malformed JSON,
 * empty arrays, and request-shape assertions (URL/headers/body). Also tests
 * the commune-code resolution path and status-string mapping.
 *
 * Mock-fetch pattern: vi.stubGlobal("fetch", mockFn) with URL-routed responses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { yalidineAdapter } from "../yalidine";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const validCreds = { apiId: "yal-id-123", apiToken: "yal-token-456" };

const sampleRequest = {
  orderId: "order-1",
  orderNumber: "ORD-001",
  customer: {
    name: "Ahmed Benali",
    phone: "0555123456",
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "123 Rue Didouche",
  },
  items: [
    { name: "Product A", quantity: 2, unitPrice: 2500 },
    { name: "Product B", quantity: 1, unitPrice: 1000 },
  ],
  totalPrice: 6000,
  weight: 1.5,
};

/** URL-routed mock for Yalidine endpoints. */
function defaultRouter(url: string, opts?: RequestInit) {
  // GET /communes/?wilaya_name=...
  if (url.includes("/communes/?wilaya_name=") || url.includes("/communes/?wilaya_name")) {
    return {
      ok: true,
      json: async () => [
        { _id: 1001, name: "Bab Ezzouar" },
        { _id: 1002, name: "Hydra" },
      ],
    };
  }
  // GET /deliveryfees/?wilaya_name=...&weight=...
  if (url.includes("/deliveryfees/")) {
    return {
      ok: true,
      json: async () => [
        { wilaya_name: "Alger", home_delivery: 400, stopdesk_delivery: 300 },
      ],
    };
  }
  // POST /parcels/
  if (url.includes("/parcels/") && opts?.method === "POST") {
    return {
      ok: true,
      json: async () => [
        {
          tracking_id: "YAL-TRACK-001",
          label: "https://api.yalidine.app/label/001.pdf",
          parcel_status: "créé",
        },
      ],
    };
  }
  // GET /parcels/{tracking}/
  if (url.includes("/parcels/") && url.includes("/parcels/YAL")) {
    return {
      ok: true,
      json: async () => [
        { parcel_status: "Livré", delivery_date: "2026-01-05" },
      ],
    };
  }
  // GET /histories/?tracking=...
  // Real Yalidine API returns history newest-first. The adapter calls
  // .reverse() to produce chronological order (oldest-first, newest-last).
  // So the mock must return newest-first for the adapter's reverse to yield
  // events[0]=created ... events[last]=delivered.
  if (url.includes("/histories/")) {
    return {
      ok: true,
      json: async () => [
        { status: "Livré", date: "2026-01-05T00:00:00Z", place: "Bab Ezzouar", remark: "Delivered" },
        { status: "Ramassé", date: "2026-01-02T00:00:00Z", place: "Hub", remark: "Picked up" },
        { status: "Créé", date: "2026-01-01T00:00:00Z", place: "Counter", remark: "Order created" },
      ],
    };
  }
  // DELETE /parcels/{tracking}/
  if (url.includes("/parcels/") && opts?.method === "DELETE") {
    return { ok: true };
  }
  return { ok: false, status: 404, text: async () => "Not found" };
}

describe("Yalidine delivery adapter (deep)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    mockFetch.mockImplementation(defaultRouter as unknown as typeof fetch);
  });

  describe("estimateCost", () => {
    it("returns unavailable when no API ID/token", async () => {
      const result = await yalidineAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        {},
      );
      expect(result.available).toBe(false);
      expect(result.provider).toBe("yalidine");
      expect(result.error).toContain("Identifiants Yalidine manquants");
    });

    it("returns unavailable when only apiId is missing", async () => {
      const result = await yalidineAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        { apiId: "x" }, // apiToken missing
      );
      expect(result.available).toBe(false);
    });

    it("returns cost + estimatedDays on success", async () => {
      const result = await yalidineAdapter.estimateCost(
        { wilaya: "Alger", weight: 1.5, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(true);
      expect(result.cost).toBe(400);
      expect(result.estimatedDays).toBe("2-5 jours");
    });

    it("calls /deliveryfees/ with wilaya_name + weight query params", async () => {
      await yalidineAdapter.estimateCost(
        { wilaya: "Alger", weight: 2.5, codAmount: 5000 },
        validCreds,
      );
      const call = mockFetch.mock.calls.find((c) =>
        String(c[0]).includes("/deliveryfees/"),
      );
      expect(call).toBeDefined();
      const url = String(call![0]);
      expect(url).toContain("wilaya_name=Alger");
      expect(url).toContain("weight=2.5");
    });

    it("sends X-API-ID + X-API-TOKEN headers", async () => {
      await yalidineAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      const call = mockFetch.mock.calls.find((c) =>
        String(c[0]).includes("/deliveryfees/"),
      );
      const opts = (call?.[1] as RequestInit) ?? {};
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-API-ID"]).toBe("yal-id-123");
      expect(headers["X-API-TOKEN"]).toBe("yal-token-456");
    });

    it("returns error on non-OK API response", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/deliveryfees/")) {
          return { ok: false, status: 401, text: async () => "Unauthorized" };
        }
        return { ok: true, json: async () => [] };
      });

      const result = await yalidineAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(false);
      expect(result.error).toContain("401");
    });

    it("returns error when API returns empty array", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/deliveryfees/")) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => [] };
      });

      const result = await yalidineAdapter.estimateCost(
        { wilaya: "Unknown Wilaya", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(false);
      expect(result.error).toContain("Pas de tarif");
    });

    it("returns error when API returns non-array", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/deliveryfees/")) {
          return { ok: true, json: async () => ({ not: "an array" }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await yalidineAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(false);
    });

    it("returns error on network failure (fetch throws)", async () => {
      mockFetch.mockImplementation(async () => {
        throw new Error("ECONNREFUSED");
      });

      const result = await yalidineAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(false);
      expect(result.error).toContain("ECONNREFUSED");
    });
  });

  describe("createShipment", () => {
    it("returns error when no API ID/token", async () => {
      const result = await yalidineAdapter.createShipment(sampleRequest, {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Identifiants Yalidine manquants");
    });

    it("creates a shipment and returns tracking + label + cost", async () => {
      const result = await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(true);
      expect(result.trackingId).toBe("YAL-TRACK-001");
      expect(result.labelUrl).toBe("https://api.yalidine.app/label/001.pdf");
      expect(result.cost).toBe(400); // fetched from deliveryfees after create
    });

    it("sends the create body as an array with correct fields", async () => {
      await yalidineAdapter.createShipment(sampleRequest, validCreds);
      const postCall = mockFetch.mock.calls.find(
        (c) => String(c[0]).includes("/parcels/") &&
          (c[1] as RequestInit)?.method === "POST",
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].order_id).toBe("ORD-001");
      expect(body[0].firstname).toBe("Ahmed Benali");
      expect(body[0].phone).toBe("0555123456");
      expect(body[0].wilaya).toBe("Alger");
      expect(body[0].price).toBe(6000);
      expect(body[0].weight).toBe(1.5);
      // commune resolved to numeric code via /communes/ endpoint
      expect(body[0].commune).toBe(1001); // Bab Ezzouar
      expect(body[0].product).toContain("Product A x2");
      expect(body[0].product).toContain("Product B x1");
    });

    it("falls back to commune name string when commune code is not found", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          return { ok: true, json: async () => [] }; // no communes returned
        }
        if (url.includes("/deliveryfees/")) {
          return { ok: true, json: async () => [{ home_delivery: 400, stopdesk_delivery: 300 }] };
        }
        if (url.includes("/parcels/") && opts?.method === "POST") {
          return { ok: true, json: async () => [{ tracking_id: "T2", label: "l", parcel_status: "créé" }] };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.createShipment(
        { ...sampleRequest, customer: { ...sampleRequest.customer, commune: "Unknown Commune" } },
        validCreds,
      );
      expect(result.success).toBe(true);
      // Verify the body had the raw commune name (not a number)
      const postCall = mockFetch.mock.calls.find(
        (c) => String(c[0]).includes("/parcels/") &&
          (c[1] as RequestInit)?.method === "POST",
      );
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body[0].commune).toBe("Unknown Commune");
    });

    it("returns error when create API returns non-OK", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          return { ok: true, json: async () => [{ _id: 1001, name: "Bab Ezzouar" }] };
        }
        if (url.includes("/deliveryfees/")) {
          return { ok: true, json: async () => [{ home_delivery: 400, stopdesk_delivery: 300 }] };
        }
        if (url.includes("/parcels/") && opts?.method === "POST") {
          return { ok: false, status: 400, text: async () => "Bad request" };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Erreur API Yalidine: 400");
    });

    it("returns error when API returns empty array", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          return { ok: true, json: async () => [{ _id: 1001, name: "Bab Ezzouar" }] };
        }
        if (url.includes("/parcels/") && opts?.method === "POST") {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => [] };
      });

      const result = await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Réponse vide");
    });

    it("returns error when parcel has an error field", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          return { ok: true, json: async () => [{ _id: 1001, name: "Bab Ezzouar" }] };
        }
        if (url.includes("/parcels/") && opts?.method === "POST") {
          return {
            ok: true,
            json: async () => [{ error: "Phone number invalid" }],
          };
        }
        return { ok: true, json: async () => [] };
      });

      const result = await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Phone number invalid");
    });

    it("returns error when fetch throws", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          return { ok: true, json: async () => [{ _id: 1001, name: "Bab Ezzouar" }] };
        }
        if (url.includes("/parcels/") && opts?.method === "POST") {
          throw new Error("connection reset");
        }
        return { ok: true, json: async () => [] };
      });

      const result = await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("connection reset");
    });
  });

  describe("syncTracking", () => {
    it("throws when no API ID/token", async () => {
      await expect(
        yalidineAdapter.syncTracking("YAL-1", {}),
      ).rejects.toThrow("Identifiants Yalidine manquants");
    });

    it("returns tracking info with events on success", async () => {
      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.trackingId).toBe("YAL-001");
      expect(result.status).toBe("delivered"); // Livré
      expect(result.deliveryCompany).toBe("Yalidine");
      expect(result.estimatedDelivery).toBe("2026-01-05");
      expect(result.events).toHaveLength(3);
      // history is reversed — newest last (since Yalidine returns newest-first)
      expect(result.events[2]!.status).toBe("delivered");
      expect(result.events[0]!.status).toBe("created");
    });

    it("calls /parcels/{tracking}/ and /histories/?tracking= in parallel", async () => {
      await yalidineAdapter.syncTracking("YAL-001", validCreds);
      const urls = mockFetch.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/parcels/YAL-001/"))).toBe(true);
      expect(urls.some((u) => u.includes("/histories/?tracking=YAL-001"))).toBe(true);
    });

    it("returns pending status when parcel endpoint fails", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/") && url.includes("YAL-001")) {
          return { ok: false, status: 500, text: async () => "err" };
        }
        if (url.includes("/histories/")) {
          return { ok: true, json: async () => [] };
        }
        return { ok: false, status: 500, text: async () => "" };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.status).toBe("pending");
      expect(result.events).toHaveLength(0);
    });

    it("returns status from parcel when history endpoint fails", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/") && url.includes("YAL-001")) {
          return { ok: true, json: async () => [{ parcel_status: "En transit", delivery_date: null }] };
        }
        if (url.includes("/histories/")) {
          return { ok: false, status: 500, text: async () => "err" };
        }
        return { ok: false, status: 500, text: async () => "" };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.status).toBe("in_transit");
      expect(result.events).toHaveLength(0);
    });

    it("handles empty parcel array gracefully", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/")) {
          return { ok: true, json: async () => [] };
        }
        if (url.includes("/histories/")) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => [] };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.status).toBe("pending");
    });

    it("handles non-array history gracefully", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/")) {
          return { ok: true, json: async () => [{ parcel_status: "Livré" }] };
        }
        if (url.includes("/histories/")) {
          return { ok: true, json: async () => ({ not: "an array" }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.status).toBe("delivered");
      expect(result.events).toHaveLength(0);
    });
  });

  describe("cancelShipment", () => {
    it("returns error when no API ID/token", async () => {
      const result = await yalidineAdapter.cancelShipment!("YAL-001", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Identifiants Yalidine manquants");
    });

    it("cancels successfully via DELETE /parcels/{tracking}/", async () => {
      const result = await yalidineAdapter.cancelShipment!("YAL-001", validCreds);
      expect(result.success).toBe(true);

      const delCall = mockFetch.mock.calls.find(
        (c) => String(c[0]).includes("/parcels/YAL-001/") &&
          (c[1] as RequestInit)?.method === "DELETE",
      );
      expect(delCall).toBeDefined();
    });

    it("returns error on non-OK API response", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/parcels/") && opts?.method === "DELETE") {
          return { ok: false, status: 404, text: async () => "Not found" };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.cancelShipment!("YAL-001", validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("404");
    });

    it("returns error when fetch throws", async () => {
      mockFetch.mockImplementation(async () => {
        throw new Error("timeout");
      });

      const result = await yalidineAdapter.cancelShipment!("YAL-001", validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("timeout");
    });
  });

  describe("status string mapping", () => {
    const cases: Array<[string, string]> = [
      ["Livré", "delivered"],
      ["delivered", "delivered"],
      ["Retour définitif", "returned"],
      ["returned", "returned"],
      ["Refusé par le client", "refused"],
      ["Échec de livraison", "failed"],
      ["echec total", "failed"],
      ["Colis ramassé", "picked_up"],
      ["En transit", "in_transit"],
      ["Au centre de tri", "at_hub"],
      ["Avec le livreur", "out_for_delivery"],
      ["Créé", "created"],
      ["unknown gibberish", "pending"],
    ];

    for (const [input, expected] of cases) {
      it(`maps "${input}" → ${expected}`, async () => {
        mockFetch.mockImplementation(async (url: string) => {
          if (url.includes("/parcels/")) {
            return { ok: true, json: async () => [{ parcel_status: input }] };
          }
          if (url.includes("/histories/")) {
            return { ok: true, json: async () => [] };
          }
          return { ok: true, json: async () => ({}) };
        });

        const result = await yalidineAdapter.syncTracking("X", validCreds);
        expect(result.status).toBe(expected);
      });
    }
  });
});
