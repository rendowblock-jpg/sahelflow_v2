/**
 * ZR Express delivery adapter — deep tests (T-INTEGRATIONS).
 *
 * Companion to zr-express.test.ts (which only covers metadata). Full coverage
 * of estimateCost / createShipment / syncTracking / cancelShipment including:
 * no-creds, unknown wilaya, pricing cache load, success, API errors, network
 * errors, malformed responses, and request-shape assertions (URL/headers/body).
 * Also covers the phone-normalization helper and status-string mapping.
 *
 * Notes:
 *   - The pricing table is cached in-process (module-level Map). Tests use
 *     mockImplementation to control the cache-population flow.
 *   - ZR Express uses two custom headers: `token` (apiId) + `key` (apiKey).
 *   - Cancellation is NOT supported via the API (returns "not supported").
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const validCreds = { apiId: "zr-token-123", apiKey: "zr-key-456" };

const sampleRequest = {
  orderId: "order-1",
  orderNumber: "ORD-001",
  customer: {
    name: "Ahmed Benali",
    phone: "+213 555-123-456",
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "123 Rue Didouche",
  },
  items: [{ name: "Product A", quantity: 2, unitPrice: 2500 }],
  totalPrice: 5000,
  weight: 1.5,
};

/** URL-routed mock for ZR Express (Procolis) endpoints. */
function defaultRouter(url: string) {
  // POST /tarification → pricing table
  if (url.includes("/tarification")) {
    return {
      ok: true,
      json: async () => [
        { IDWilaya: 16, TarifLivraison: 450, TarifStopDesk: 350 },
        { IDWilaya: 31, TarifLivraison: 500, TarifStopDesk: 400 },
      ],
    };
  }
  // POST /add_colis → parcel creation result
  if (url.includes("/add_colis")) {
    return {
      ok: true,
      json: async () => ({
        Colis: [
          {
            MessageRetour: "Good",
            Tracking: "SF-ORD-001",
            suivi: "SF-ORD-001",
          },
        ],
      }),
    };
  }
  // POST /lire → parcel tracking read
  if (url.includes("/lire")) {
    return {
      ok: true,
      json: async () => ({
        Colis: [
          {
            Tracking: "SF-ORD-001",
            situation: "Livré",
            Client: "Ahmed Benali",
            Total: 5000,
          },
        ],
      }),
    };
  }
  return { ok: false, status: 404, text: async () => "Not found" };
}

// The pricing table cache is module-level in zr-express.ts. To keep tests
// independent (each test starts with an empty cache), we reset the module
// registry in beforeEach and dynamically re-import the adapter.
let zrExpressAdapter!: typeof import("../zr-express").zrExpressAdapter;

describe("ZR Express delivery adapter (deep)", () => {
  beforeEach(async () => {
    vi.stubGlobal("fetch", mockFetch);
    vi.resetModules();
    mockFetch.mockReset();
    mockFetch.mockImplementation(defaultRouter as unknown as typeof fetch);
    const mod = await import("../zr-express");
    zrExpressAdapter = mod.zrExpressAdapter;
  });

  describe("estimateCost", () => {
    it("returns unavailable when no credentials", async () => {
      const result = await zrExpressAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        {},
      );
      expect(result.available).toBe(false);
      expect(result.provider).toBe("zrexpress");
      expect(result.error).toContain("Identifiants ZR Express manquants");
    });

    it("returns unavailable when only apiId is missing", async () => {
      const result = await zrExpressAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        { apiKey: "x" },
      );
      expect(result.available).toBe(false);
    });

    it("returns unavailable when wilaya is not recognized", async () => {
      const result = await zrExpressAdapter.estimateCost(
        { wilaya: "Mars", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(false);
      expect(result.error).toContain("non reconnue");
    });

    it("returns cost from pricing table on success", async () => {
      const result = await zrExpressAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(true);
      expect(result.cost).toBe(450); // wilaya 16 home delivery
    });

    it("resolves wilaya via accent-folding (Oran → 31)", async () => {
      const result = await zrExpressAdapter.estimateCost(
        { wilaya: "Oran", weight: 1, codAmount: 5000 },
        validCreds,
      );
      expect(result.available).toBe(true);
      expect(result.cost).toBe(500); // wilaya 31 home delivery
    });

    it("calls POST /tarification with token + key headers", async () => {
      await zrExpressAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      const tarifCall = mockFetch.mock.calls.find((c) =>
        String(c[0]).includes("/tarification"),
      );
      expect(tarifCall).toBeDefined();
      const opts = (tarifCall![1] as RequestInit);
      expect(opts.method).toBe("POST");
      const headers = opts.headers as Record<string, string>;
      expect(headers.token).toBe("zr-token-123");
      expect(headers.key).toBe("zr-key-456");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("returns error when pricing table doesn't include the wilaya", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/tarification")) {
          // Return only wilaya 16 (Alger)
          return { ok: true, json: async () => [{ IDWilaya: 16, TarifLivraison: 450, TarifStopDesk: 350 }] };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await zrExpressAdapter.estimateCost(
        { wilaya: "Oran", weight: 1, codAmount: 5000 }, // Oran = 31, not in table
        validCreds,
      );
      expect(result.available).toBe(false);
      expect(result.error).toContain("Tarif non disponible");
    });

    it("returns error when /tarification returns non-OK", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/tarification")) {
          return { ok: false, status: 401, text: async () => "Unauthorized" };
        }
        return { ok: false, status: 401, text: async () => "" };
      });

      const result = await zrExpressAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      // pricing cache stays empty → no tarif found
      expect(result.available).toBe(false);
      expect(result.error).toContain("Tarif non disponible");
    });
  });

  describe("createShipment", () => {
    it("returns error when no credentials", async () => {
      const result = await zrExpressAdapter.createShipment(sampleRequest, {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Identifiants ZR Express manquants");
    });

    it("returns error when wilaya is not recognized", async () => {
      const result = await zrExpressAdapter.createShipment(
        { ...sampleRequest, customer: { ...sampleRequest.customer, wilaya: "Mars" } },
        validCreds,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("non reconnue");
    });

    it("creates a shipment and returns tracking + cost", async () => {
      const result = await zrExpressAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(true);
      expect(result.trackingId).toBe("SF-ORD-001");
      expect(result.cost).toBe(450); // from pricing cache (wilaya 16)
    });

    it("sends /add_colis POST with Colis array body", async () => {
      await zrExpressAdapter.createShipment(sampleRequest, validCreds);
      const postCall = mockFetch.mock.calls.find((c) =>
        String(c[0]).includes("/add_colis"),
      );
      expect(postCall).toBeDefined();
      const opts = (postCall![1] as RequestInit);
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string);
      expect(body.Colis).toHaveLength(1);
      const colis = body.Colis[0];
      expect(colis.Tracking).toBe("SF-ORD-001");
      expect(colis.Client).toBe("Ahmed Benali");
      expect(colis.IDWilaya).toBe("16");
      expect(colis.Total).toBe(5000);
      expect(colis.TProduit).toBe("2x Product A");
      expect(colis.Confrimee).toBe(1);
      expect(colis.Source).toBe("SahelFlow");
      // Phone is normalized: +213 555-123-456 → 0555123456
      expect(colis.MobileA).toBe("0555123456");
    });

    it("normalizes phone with +213 prefix", async () => {
      await zrExpressAdapter.createShipment(
        { ...sampleRequest, customer: { ...sampleRequest.customer, phone: "+213770000000" } },
        validCreds,
      );
      const postCall = mockFetch.mock.calls.find((c) =>
        String(c[0]).includes("/add_colis"),
      );
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.Colis[0].MobileA).toBe("0770000000");
    });

    it("normalizes phone with 213 prefix (no plus)", async () => {
      await zrExpressAdapter.createShipment(
        { ...sampleRequest, customer: { ...sampleRequest.customer, phone: "213661111111" } },
        validCreds,
      );
      const postCall = mockFetch.mock.calls.find((c) =>
        String(c[0]).includes("/add_colis"),
      );
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.Colis[0].MobileA).toBe("0661111111");
    });

    it("returns error when API returns non-OK status", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/tarification")) {
          return { ok: true, json: async () => [{ IDWilaya: 16, TarifLivraison: 450, TarifStopDesk: 350 }] };
        }
        if (url.includes("/add_colis")) {
          return { ok: false, status: 400, text: async () => "Bad request" };
        }
        return { ok: false, status: 400, text: async () => "" };
      });

      const result = await zrExpressAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("ZR Express API 400");
    });

    it("returns error when MessageRetour is not Good", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/tarification")) {
          return { ok: true, json: async () => [{ IDWilaya: 16, TarifLivraison: 450, TarifStopDesk: 350 }] };
        }
        if (url.includes("/add_colis")) {
          return {
            ok: true,
            json: async () => ({
              Colis: [{ MessageRetour: "Double Tracking" }],
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await zrExpressAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Double Tracking");
    });

    it("returns error when response has no Colis field", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/tarification")) {
          return { ok: true, json: async () => [{ IDWilaya: 16, TarifLivraison: 450, TarifStopDesk: 350 }] };
        }
        if (url.includes("/add_colis")) {
          return { ok: true, json: async () => ({}) }; // no Colis
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await zrExpressAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("vide");
    });

    it("returns error when fetch throws", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/tarification")) {
          return { ok: true, json: async () => [{ IDWilaya: 16, TarifLivraison: 450, TarifStopDesk: 350 }] };
        }
        if (url.includes("/add_colis")) {
          throw new Error("ECONNRESET");
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await zrExpressAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("ECONNRESET");
    });
  });

  describe("syncTracking", () => {
    it("throws when no credentials", async () => {
      await expect(
        zrExpressAdapter.syncTracking("SF-001", {}),
      ).rejects.toThrow("Identifiants ZR Express manquants");
    });

    it("returns tracking info on success", async () => {
      const result = await zrExpressAdapter.syncTracking("SF-001", validCreds);
      expect(result.trackingId).toBe("SF-001");
      expect(result.status).toBe("delivered"); // Livré
      expect(result.deliveryCompany).toBe("ZR Express");
      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.details).toBe("Livré");
    });

    it("sends POST /lire with Colis body", async () => {
      await zrExpressAdapter.syncTracking("SF-001", validCreds);
      const lireCall = mockFetch.mock.calls.find((c) =>
        String(c[0]).includes("/lire"),
      );
      expect(lireCall).toBeDefined();
      const opts = (lireCall![1] as RequestInit);
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string);
      expect(body.Colis).toHaveLength(1);
      expect(body.Colis[0].Tracking).toBe("SF-001");
    });

    it("throws when API returns non-OK", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/lire")) {
          return { ok: false, status: 500, text: async () => "Server error" };
        }
        return { ok: false, status: 500, text: async () => "" };
      });

      await expect(
        zrExpressAdapter.syncTracking("SF-001", validCreds),
      ).rejects.toThrow("ZR Express API 500");
    });

    it("throws when response has empty Colis", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/lire")) {
          return { ok: true, json: async () => ({ Colis: [] }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      await expect(
        zrExpressAdapter.syncTracking("SF-001", validCreds),
      ).rejects.toThrow("introuvable");
    });

    it("throws when response is null", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/lire")) {
          return { ok: true, json: async () => null };
        }
        return { ok: true, json: async () => null };
      });

      await expect(
        zrExpressAdapter.syncTracking("SF-001", validCreds),
      ).rejects.toThrow("introuvable");
    });

    it("throws when fetch throws", async () => {
      mockFetch.mockImplementation(async () => {
        throw new Error("timeout");
      });

      await expect(
        zrExpressAdapter.syncTracking("SF-001", validCreds),
      ).rejects.toThrow("timeout");
    });

    it("falls back to statut/status fields when situation is missing", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/lire")) {
          return {
            ok: true,
            json: async () => ({
              Colis: [{ Tracking: "SF-001", statut: "En livraison" }],
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await zrExpressAdapter.syncTracking("SF-001", validCreds);
      expect(result.status).toBe("out_for_delivery"); // "En livraison" → out_for_delivery
    });
  });

  describe("cancelShipment", () => {
    it("always returns 'not supported' (no fetch call)", async () => {
      const result = await zrExpressAdapter.cancelShipment!("SF-001", validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("pas supportée");
      // No fetch should have been made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns 'not supported' even without credentials", async () => {
      const result = await zrExpressAdapter.cancelShipment!("SF-001", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("pas supportée");
    });
  });

  describe("status string mapping", () => {
    const cases: Array<[string, string]> = [
      ["Livré", "delivered"],
      ["delivre", "delivered"],
      ["Retour définitif", "returned"],
      ["Refusé", "refused"],
      ["Échec de livraison", "failed"],
      ["echec", "failed"],
      ["No reponse", "failed"],
      ["Expédié", "in_transit"],
      ["expedie", "in_transit"],
      ["En livraison", "out_for_delivery"],
      ["Ramassé", "picked_up"],
      ["Pret a expedier", "in_transit"], // contains "expedie" → in_transit (matches before "pret" rule)
      ["pret", "created"],
      ["Créé", "created"],
      ["Annulé", "returned"], // cancelled → returned to seller
      ["Boite postale", "at_hub"],
      ["Reporté", "pending"],
      ["unknown gibberish", "pending"],
    ];

    for (const [input, expected] of cases) {
      it(`maps "${input}" → ${expected}`, async () => {
        mockFetch.mockImplementation(async (url: string) => {
          if (url.includes("/lire")) {
            return {
              ok: true,
              json: async () => ({ Colis: [{ Tracking: "X", situation: input }] }),
            };
          }
          return { ok: true, json: async () => ({}) };
        });

        const result = await zrExpressAdapter.syncTracking("X", validCreds);
        expect(result.status).toBe(expected);
      });
    }
  });
});
