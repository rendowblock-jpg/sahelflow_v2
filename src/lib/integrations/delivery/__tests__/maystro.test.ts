/**
 * Maystro Delivery adapter — comprehensive tests (T-INTEGRATIONS).
 *
 * Covers: estimateCost (no-token, no-commune, commune-not-found, 404, success,
 * network error), createShipment (no-token, commune-missing, product-creation
 * flow, success, API error, network error), syncTracking (no-token, order not
 * found, success with history), cancelShipment (no-token, order not found,
 * success, API error, network error), status mapping for the full numeric
 * code table, and request-shape assertions (URL/headers/body).
 *
 * Mock-fetch pattern: vi.stubGlobal("fetch", mockFn) with URL-routed responses
 * so the in-process wilaya/commune/product caches don't cause ordering issues
 * between tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { maystroAdapter } from "../maystro";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const validCreds = { apiToken: "maystro-token-abc" };

/** Standard request used across createShipment tests. */
const sampleRequest = {
  orderId: "order-1",
  orderNumber: "ORD-001",
  customer: {
    name: "Ahmed Benali",
    phone: "0555123456",
    wilaya: "Alger",
    commune: "Hydra",
    address: "123 Rue Didouche",
  },
  items: [{ name: "Test Product", quantity: 2, unitPrice: 2500 }],
  totalPrice: 5000,
  weight: 1.5,
};

/**
 * Build a URL-routed mock that returns Maystro-shaped responses based on the
 * URL. Tests can override individual routes by re-stubbing the implementation.
 */
function defaultRouter(url: string, opts?: RequestInit) {
  // GET /shared/wilayas/?language=en&country=1 → [[id, name], ...]
  if (url.includes("/shared/wilayas/")) {
    return {
      ok: true,
      json: async () => [
        [16, "Alger"],
        [31, "Oran"],
      ],
    };
  }
  // GET /shared/communes/?wilaya=16 → [{id, name}, ...]
  if (url.includes("/shared/communes/")) {
    return {
      ok: true,
      json: async () => [
        { id: 887, name: "Hydra" },
        { id: 888, name: "Bab Ezzouar" },
      ],
    };
  }
  // GET /stores/product/?search=Test%20Product → {results: []}
  if (url.includes("/stores/product?") || url.includes("/stores/product/?")) {
    return { ok: true, json: async () => ({ results: [] }) };
  }
  // POST /stores/product/ → {id: uuid}
  if (url.includes("/stores/product/") && opts?.method === "POST") {
    return { ok: true, json: async () => ({ id: "prod-uuid-1234" }) };
  }
  // GET /stores/delivery_price/?commune=887&... → {delivery_price}
  if (url.includes("/stores/delivery_price/")) {
    return { ok: true, json: async () => ({ delivery_price: 450 }) };
  }
  // GET /stores/orders/?display_id=... → {results: [{id, status}]}
  if (url.includes("/stores/orders/?") && (!opts?.method || opts.method === "GET")) {
    return {
      ok: true,
      json: async () => ({ results: [{ id: "order-uuid-1", status: 41 }] }),
    };
  }
  // POST /stores/orders/ → {id, display_id, status}
  if (url.includes("/stores/orders/") && opts?.method === "POST") {
    return {
      ok: true,
      json: async () => ({
        id: "order-uuid-1",
        display_id: "MAY-1001",
        status: 4,
      }),
    };
  }
  // GET /stores/history_order/{uuid} → array of {status, created_at, comment}
  if (url.includes("/stores/history_order/")) {
    return {
      ok: true,
      json: async () => [
        { status: 4, created_at: "2026-01-01T00:00:00Z", comment: "Order created" },
        { status: 41, created_at: "2026-01-03T00:00:00Z", comment: "Delivered" },
      ],
    };
  }
  // PATCH /shared/status/{uuid}/
  if (url.includes("/shared/status/") && opts?.method === "PATCH") {
    return { ok: true };
  }
  return { ok: false, status: 404, text: async () => "Not found" };
}

describe("Maystro delivery adapter", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    mockFetch.mockImplementation(defaultRouter as unknown as typeof fetch);
  });

  describe("metadata", () => {
    it("has correct id, name, and logo", () => {
      expect(maystroAdapter.id).toBe("maystro");
      expect(maystroAdapter.name).toBe("Maystro Delivery");
      expect(maystroAdapter.logo).toBeTruthy();
    });

    it("exposes estimateCost, createShipment, syncTracking, cancelShipment", () => {
      expect(typeof maystroAdapter.estimateCost).toBe("function");
      expect(typeof maystroAdapter.createShipment).toBe("function");
      expect(typeof maystroAdapter.syncTracking).toBe("function");
      expect(typeof maystroAdapter.cancelShipment).toBe("function");
    });
  });

  describe("estimateCost", () => {
    it("returns unavailable when no API token", async () => {
      const result = await maystroAdapter.estimateCost(
        { wilaya: "Alger", commune: "Hydra", weight: 1, codAmount: 5000 },
        {},
      );
      expect(result.available).toBe(false);
      expect(result.provider).toBe("maystro");
      expect(result.error).toContain("Token Maystro manquant");
    });

    it("returns unavailable when no commune provided", async () => {
      const result = await maystroAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(false);
      expect(result.error).toContain("Commune requise");
    });

    it("returns cost on success and calls delivery_price endpoint", async () => {
      const result = await maystroAdapter.estimateCost(
        { wilaya: "Alger", commune: "Hydra", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(true);
      expect(result.cost).toBe(450);
      expect(result.provider).toBe("maystro");

      // Verify the delivery_price endpoint was called with the resolved commune ID
      const calls = mockFetch.mock.calls.map((c) => String(c[0]));
      const priceCall = calls.find((u) => u.includes("/stores/delivery_price/"));
      expect(priceCall).toBeDefined();
      expect(priceCall).toContain("commune=887");
      expect(priceCall).toContain("delivery_type=1");
      expect(priceCall).toContain("express=false");
    });

    it("sends Authorization: Token <token> header", async () => {
      await maystroAdapter.estimateCost(
        { wilaya: "Alger", commune: "Hydra", weight: 1, codAmount: 5000 },
        validCreds,
      );
      const call = mockFetch.mock.calls.find((c) =>
        String(c[0]).includes("/stores/delivery_price/"),
      );
      const opts = (call?.[1] as RequestInit) ?? {};
      const headers = opts.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Token maystro-token-abc");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("returns unavailable when commune is not found in wilaya", async () => {
      // Override: communes endpoint returns an empty list
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/shared/wilayas/")) {
          return { ok: true, json: async () => [[16, "Alger"]] };
        }
        if (url.includes("/shared/communes/")) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await maystroAdapter.estimateCost(
        { wilaya: "Alger", commune: "Unknown", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(false);
      expect(result.error).toContain("introuvable");
    });

    it("returns unavailable on 404 from delivery_price", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/shared/wilayas/")) {
          return { ok: true, json: async () => [[16, "Alger"]] };
        }
        if (url.includes("/shared/communes/")) {
          return { ok: true, json: async () => [{ id: 887, name: "Hydra" }] };
        }
        if (url.includes("/stores/delivery_price/")) {
          return { ok: false, status: 404, text: async () => "Not found" };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await maystroAdapter.estimateCost(
        { wilaya: "Alger", commune: "Hydra", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(false);
      expect(result.error).toContain("Tarif non disponible");
    });

    it("returns unavailable on other API error (500)", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/shared/wilayas/")) {
          return { ok: true, json: async () => [[16, "Alger"]] };
        }
        if (url.includes("/shared/communes/")) {
          return { ok: true, json: async () => [{ id: 887, name: "Hydra" }] };
        }
        if (url.includes("/stores/delivery_price/")) {
          return { ok: false, status: 500, text: async () => "Server error" };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await maystroAdapter.estimateCost(
        { wilaya: "Alger", commune: "Hydra", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(false);
      expect(result.error).toContain("Erreur Maystro: 500");
    });

    it("returns unavailable on network error (fetch throws)", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/shared/wilayas/")) {
          return { ok: true, json: async () => [[16, "Alger"]] };
        }
        if (url.includes("/shared/communes/")) {
          return { ok: true, json: async () => [{ id: 887, name: "Hydra" }] };
        }
        if (url.includes("/stores/delivery_price/")) {
          throw new Error("network down");
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await maystroAdapter.estimateCost(
        { wilaya: "Alger", commune: "Hydra", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(false);
      expect(result.error).toContain("network down");
    });
  });

  describe("createShipment", () => {
    it("returns error when no API token", async () => {
      const result = await maystroAdapter.createShipment(sampleRequest, {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Token Maystro manquant");
    });

    it("creates a shipment and returns tracking + cost", async () => {
      const result = await maystroAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(true);
      expect(result.trackingId).toBe("MAY-1001");
      expect(result.cost).toBe(450); // from delivery_price

      // Verify the create-order call happened with the right shape
      const createCall = mockFetch.mock.calls.find(
        (c) => String(c[0]).includes("/stores/orders/") &&
          (c[1] as RequestInit)?.method === "POST",
      );
      expect(createCall).toBeDefined();
      const body = JSON.parse((createCall![1] as RequestInit).body as string);
      expect(body.external_order_id).toBe("ORD-001");
      expect(body.commune).toBe(887);
      expect(body.customer_phone).toBe("0555123456");
      expect(body.customer_name).toBe("Ahmed Benali");
      expect(body.product_price).toBe(5000);
      expect(body.delivery_type).toBe(1);
      expect(body.express).toBe(false);
      expect(body.products).toHaveLength(1);
      expect(body.products[0].product_id).toBe("prod-uuid-1234");
      expect(body.products[0].quantity).toBe(2);
    });

    it("returns error when commune is not found", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/shared/wilayas/")) {
          return { ok: true, json: async () => [[16, "Alger"]] };
        }
        if (url.includes("/shared/communes/")) {
          return { ok: true, json: async () => [] }; // empty
        }
        return { ok: true, json: async () => ({}) };
      });

      // Use a commune name that won't be in the in-process commune cache
      // (earlier tests populate "Hydra" → 887 for wilaya "Alger").
      const result = await maystroAdapter.createShipment(
        {
          ...sampleRequest,
          customer: { ...sampleRequest.customer, commune: `UnknownCommune_${Date.now()}` },
        },
        validCreds,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("introuvable");
    });

    it("returns error when product creation fails", async () => {
      // Use a unique product name to avoid the in-process productIdCache
      // (earlier tests cache "Test Product" → UUID).
      const uniqueProduct = `FailingProduct_${Date.now()}`;
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/shared/wilayas/")) {
          return { ok: true, json: async () => [[16, "Alger"]] };
        }
        if (url.includes("/shared/communes/")) {
          return { ok: true, json: async () => [{ id: 887, name: "Hydra" }] };
        }
        // Product search returns nothing, POST returns ok: false
        if (url.includes("/stores/product/?")) {
          return { ok: true, json: async () => ({ results: [] }) };
        }
        if (url.includes("/stores/product/") && opts?.method === "POST") {
          return { ok: false, status: 400, text: async () => "Bad product" };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await maystroAdapter.createShipment(
        {
          ...sampleRequest,
          items: [{ name: uniqueProduct, quantity: 2, unitPrice: 2500 }],
        },
        validCreds,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Impossible de créer le produit");
    });

    it("returns error when create-order API returns non-OK status", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/shared/wilayas/")) {
          return { ok: true, json: async () => [[16, "Alger"]] };
        }
        if (url.includes("/shared/communes/")) {
          return { ok: true, json: async () => [{ id: 887, name: "Hydra" }] };
        }
        if (url.includes("/stores/product")) {
          if (opts?.method === "POST") {
            return { ok: true, json: async () => ({ id: "prod-uuid-1234" }) };
          }
          return { ok: true, json: async () => ({ results: [] }) };
        }
        if (url.includes("/stores/delivery_price/")) {
          return { ok: true, json: async () => ({ delivery_price: 450 }) };
        }
        if (url.includes("/stores/orders/") && opts?.method === "POST") {
          return { ok: false, status: 400, text: async () => "Bad request" };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await maystroAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Maystro API 400");
    });

    it("returns error when create-order fetch throws", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/shared/wilayas/")) {
          return { ok: true, json: async () => [[16, "Alger"]] };
        }
        if (url.includes("/shared/communes/")) {
          return { ok: true, json: async () => [{ id: 887, name: "Hydra" }] };
        }
        if (url.includes("/stores/product")) {
          if (opts?.method === "POST") {
            return { ok: true, json: async () => ({ id: "prod-uuid-1234" }) };
          }
          return { ok: true, json: async () => ({ results: [] }) };
        }
        if (url.includes("/stores/delivery_price/")) {
          return { ok: true, json: async () => ({ delivery_price: 450 }) };
        }
        if (url.includes("/stores/orders/") && opts?.method === "POST") {
          throw new Error("connection refused");
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await maystroAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("connection refused");
    });

    it("auto-creates product when search returns no match", async () => {
      // Use a unique product name to avoid cache hits from other tests.
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/shared/wilayas/")) {
          return { ok: true, json: async () => [[16, "Alger"]] };
        }
        if (url.includes("/shared/communes/")) {
          return { ok: true, json: async () => [{ id: 887, name: "Hydra" }] };
        }
        if (url.includes("/stores/product?")) {
          return { ok: true, json: async () => ({ results: [] }) }; // no match
        }
        if (url.includes("/stores/product/") && opts?.method === "POST") {
          const body = JSON.parse((opts.body as string) ?? "{}");
          expect(body.name).toBe("Brand New Product");
          return { ok: true, json: async () => ({ id: "new-prod-uuid" }) };
        }
        if (url.includes("/stores/delivery_price/")) {
          return { ok: true, json: async () => ({ delivery_price: 450 }) };
        }
        if (url.includes("/stores/orders/") && opts?.method === "POST") {
          return {
            ok: true,
            json: async () => ({ id: "uuid-2", display_id: "MAY-1002", status: 4 }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await maystroAdapter.createShipment(
        {
          ...sampleRequest,
          items: [{ name: "Brand New Product", quantity: 1, unitPrice: 1000 }],
        },
        validCreds,
      );
      expect(result.success).toBe(true);
      expect(result.trackingId).toBe("MAY-1002");
    });

    it("reuses cached product UUID on second call (no duplicate create)", async () => {
      let productCreateCalls = 0;
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/shared/wilayas/")) {
          return { ok: true, json: async () => [[16, "Alger"]] };
        }
        if (url.includes("/shared/communes/")) {
          return { ok: true, json: async () => [{ id: 887, name: "Hydra" }] };
        }
        if (url.includes("/stores/product?")) {
          // Pretend the search never finds it
          return { ok: true, json: async () => ({ results: [] }) };
        }
        if (url.includes("/stores/product/") && opts?.method === "POST") {
          productCreateCalls++;
          return { ok: true, json: async () => ({ id: `uuid-${productCreateCalls}` }) };
        }
        if (url.includes("/stores/delivery_price/")) {
          return { ok: true, json: async () => ({ delivery_price: 450 }) };
        }
        if (url.includes("/stores/orders/") && opts?.method === "POST") {
          return {
            ok: true,
            json: async () => ({
              id: `o-${productCreateCalls}`,
              display_id: `MAY-${1000 + productCreateCalls}`,
              status: 4,
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      // Use a unique product name to avoid cache hits from other tests
      const uniqueProduct = `CacheTestProduct_${Date.now()}`;
      const req = {
        ...sampleRequest,
        items: [{ name: uniqueProduct, quantity: 1, unitPrice: 1000 }],
      };

      await maystroAdapter.createShipment(req, validCreds);
      await maystroAdapter.createShipment(req, validCreds);
      // The product-create endpoint should have been hit only ONCE — the second
      // call reuses the cached UUID.
      expect(productCreateCalls).toBe(1);
    });
  });

  describe("syncTracking", () => {
    it("throws when no API token", async () => {
      await expect(
        maystroAdapter.syncTracking("MAY-1001", {}),
      ).rejects.toThrow("Token Maystro manquant");
    });

    it("throws when order is not found (no results)", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/stores/orders/?")) {
          return { ok: true, json: async () => ({ results: [] }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      await expect(
        maystroAdapter.syncTracking("UNKNOWN", validCreds),
      ).rejects.toThrow("introuvable");
    });

    it("returns tracking info with events on success", async () => {
      const result = await maystroAdapter.syncTracking("MAY-1001", validCreds);
      expect(result.trackingId).toBe("MAY-1001");
      expect(result.status).toBe("delivered"); // status code 41 → delivered
      expect(result.deliveryCompany).toBe("Maystro Delivery");
      expect(result.events).toHaveLength(2);
      expect(result.events[0]!.status).toBe("created"); // status 4
      expect(result.events[1]!.status).toBe("delivered"); // status 41
    });

    it("fetches order UUID by display_id via /stores/orders/?display_id=", async () => {
      await maystroAdapter.syncTracking("MAY-1001", validCreds);
      const listCall = mockFetch.mock.calls.find((c) =>
        String(c[0]).includes("/stores/orders/?") &&
        String(c[0]).includes("display_id=MAY-1001"),
      );
      expect(listCall).toBeDefined();
    });

    it("fetches tracking history via /stores/history_order/{uuid}", async () => {
      await maystroAdapter.syncTracking("MAY-1001", validCreds);
      const histCall = mockFetch.mock.calls.find((c) =>
        String(c[0]).includes("/stores/history_order/order-uuid-1"),
      );
      expect(histCall).toBeDefined();
    });
  });

  describe("cancelShipment", () => {
    it("returns error when no API token", async () => {
      const result = await maystroAdapter.cancelShipment!("MAY-1001", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Token Maystro manquant");
    });

    it("returns error when order is not found", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/stores/orders/?")) {
          return { ok: true, json: async () => ({ results: [] }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await maystroAdapter.cancelShipment!("UNKNOWN", validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("introuvable");
    });

    it("cancels successfully via PATCH /shared/status/{uuid}/", async () => {
      const result = await maystroAdapter.cancelShipment!("MAY-1001", validCreds);
      expect(result.success).toBe(true);

      const patchCall = mockFetch.mock.calls.find(
        (c) => String(c[0]).includes("/shared/status/order-uuid-1/") &&
          (c[1] as RequestInit)?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body.status).toBe(50); // aborted
      expect(body.abort_reason).toBe(21);
    });

    it("returns error when cancel API returns non-OK", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/stores/orders/?")) {
          return { ok: true, json: async () => ({ results: [{ id: "u" }] }) };
        }
        if (url.includes("/shared/status/") && opts?.method === "PATCH") {
          return { ok: false, status: 403, text: async () => "Forbidden" };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await maystroAdapter.cancelShipment!("MAY-1001", validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Maystro API 403");
    });

    it("returns error when cancel fetch throws", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/stores/orders/?")) {
          return { ok: true, json: async () => ({ results: [{ id: "u" }] }) };
        }
        if (url.includes("/shared/status/") && opts?.method === "PATCH") {
          throw new Error("network down");
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await maystroAdapter.cancelShipment!("MAY-1001", validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("network down");
    });
  });

  describe("status mapping (numeric codes)", () => {
    const cases: Array<[number, string]> = [
      [4, "created"],
      [5, "picked_up"],
      [6, "created"],
      [8, "in_transit"],
      [9, "in_transit"],
      [10, "in_transit"],
      [11, "pending"],
      [12, "failed"],
      [15, "created"],
      [22, "created"],
      [31, "in_transit"],
      [32, "failed"],
      [41, "delivered"],
      [42, "failed"],
      [50, "returned"],
      [51, "in_transit"],
      [52, "returned"],
      [53, "refused"],
      [99, "pending"], // unknown → default
    ];

    for (const [code, expected] of cases) {
      it(`maps status code ${code} → ${expected}`, async () => {
        mockFetch.mockImplementation(async (url: string) => {
          if (url.includes("/stores/orders/?")) {
            return { ok: true, json: async () => ({ results: [{ id: "u", status: code }] }) };
          }
          if (url.includes("/stores/history_order/")) {
            return { ok: true, json: async () => [] };
          }
          return { ok: true, json: async () => ({}) };
        });

        const result = await maystroAdapter.syncTracking("test", validCreds);
        expect(result.status).toBe(expected);
      });
    }
  });
});
