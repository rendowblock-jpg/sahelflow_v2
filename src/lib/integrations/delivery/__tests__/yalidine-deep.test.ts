/**
 * Yalidine delivery adapter — deep tests (T-INTEGRATIONS).
 *
 * Contract re-anchored to the live-proven Yalidine API (CodFlow @ 00f18fa):
 * create = ARRAY body + object response KEYED BY order_id, commune/wilaya as
 * NAME strings resolved against the carrier's own list, delete = HTTP 200 with
 * deleted===false meaning FAILURE, histories = paginated envelope with
 * newest-first rows and carry-forward event building.
 *
 * Mock-fetch pattern: vi.stubGlobal("fetch", mockFn) with URL-routed responses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrackingInfo } from "../types";
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

/** URL-routed mock for the corrected Yalidine endpoints. */
function defaultRouter(url: string, opts?: RequestInit) {
  // GET /communes/?wilaya_name=...
  if (url.includes("/communes/")) {
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
  // POST /parcels/ — response is an OBJECT KEYED BY order_id.
  if (url.includes("/parcels/") && opts?.method === "POST") {
    return {
      ok: true,
      json: async () => ({
        "ORD-001": {
          success: true,
          tracking: "YAL-TRACK-001",
          label: "https://api.yalidine.app/label/001.pdf",
          message: "",
        },
      }),
    };
  }
  // DELETE /parcels/{tracking}/ — HTTP 200 with deleted === true here.
  if (url.includes("/parcels/") && opts?.method === "DELETE") {
    return {
      ok: true,
      json: async () => [{ tracking: "YAL-001", deleted: true }],
    };
  }
  // GET /parcels/{tracking}/ — object envelope.
  if (url.includes("/parcels/YAL")) {
    return {
      ok: true,
      json: async () => ({ status: "Livré", delivery_date: "2026-01-05" }),
    };
  }
  // GET /histories/?tracking=... — paginated envelope, rows newest-first.
  if (url.includes("/histories/")) {
    return {
      ok: true,
      json: async () => ({
        data: [
          { status: "Livré", date_status: "2026-01-05T00:00:00Z", center_name: "Bab Ezzouar" },
          { status: "Sorti en livraison", date_status: "2026-01-04T00:00:00Z", center_name: "Alger" },
        ],
        has_more: false,
        total_count: 2,
      }),
    };
  }
  return { ok: false, status: 404, text: async () => "Not found" };
}

function requiredCall(
  match: (url: string, opts: RequestInit | undefined) => boolean,
): [string, RequestInit] {
  const call = mockFetch.mock.calls.find((c) =>
    match(String(c[0]), c[1] as RequestInit | undefined),
  );
  if (!call) throw new Error("expected fetch call not recorded");
  return call as [string, RequestInit];
}

function createBody(): Array<Record<string, unknown>> {
  const call = requiredCall(
    (url, opts) => url.includes("/parcels/") && opts?.method === "POST",
  );
  return JSON.parse(String(call[1].body));
}

function firstParcel(): Record<string, unknown> {
  const parcel = createBody()[0];
  if (!parcel) throw new Error("create body has no parcel");
  return parcel;
}

function eventAt(events: TrackingInfo["events"], index: number) {
  const event = events[index];
  if (!event) throw new Error(`no tracking event at index ${index}`);
  return event;
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
      const [url] = requiredCall((u) => u.includes("/deliveryfees/"));
      expect(url).toContain("wilaya_name=Alger");
      expect(url).toContain("weight=2.5");
    });

    it("sends X-API-ID + X-API-TOKEN headers", async () => {
      await yalidineAdapter.estimateCost(
        { wilaya: "Alger", weight: 1, codAmount: 5000 },
        validCreds,
      );
      const [, opts] = requiredCall((u) => u.includes("/deliveryfees/"));
      const requestHeaders = opts.headers as Record<string, string>;
      expect(requestHeaders["X-API-ID"]).toBe("yal-id-123");
      expect(requestHeaders["X-API-TOKEN"]).toBe("yal-token-456");
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
      mockFetch.mockImplementation(async () => ({
        ok: true,
        json: async () => [],
      }));

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

    it("creates a shipment and returns tracking + label from the keyed response", async () => {
      const result = await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(true);
      expect(result.trackingId).toBe("YAL-TRACK-001");
      expect(result.labelUrl).toBe("https://api.yalidine.app/label/001.pdf");
      expect(result.cost).toBe(400); // fetched from /deliveryfees/ after create
    });

    it("sends the live-proven create body: array of one parcel with EXACT fields", async () => {
      await yalidineAdapter.createShipment(sampleRequest, validCreds);
      const body = createBody();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(firstParcel()).toEqual({
        order_id: "ORD-001",
        from_wilaya_name: "Alger",
        firstname: "Ahmed",
        familyname: "Benali",
        contact_phone: "0555123456",
        address: "123 Rue Didouche",
        to_commune_name: "Bab Ezzouar",
        to_wilaya_name: "Alger",
        product_list: "Product A x2, Product B x1",
        price: 6000,
        do_insurance: false,
        declared_value: 6000,
        length: 1,
        width: 1,
        height: 1,
        weight: 1.5,
        freeshipping: true,
        is_stopdesk: false,
        has_exchange: false,
      });
    });

    it("duplicates a single-name customer into firstname AND familyname", async () => {
      await yalidineAdapter.createShipment(
        { ...sampleRequest, customer: { ...sampleRequest.customer, name: "Fatima" } },
        validCreds,
      );
      const parcel = firstParcel();
      expect(parcel.firstname).toBe("Fatima");
      expect(parcel.familyname).toBe("Fatima");
    });

    it("adds the optional deliveryFee to the COD price and declared_value", async () => {
      await yalidineAdapter.createShipment(
        { ...sampleRequest, deliveryFee: 600 },
        validCreds,
      );
      const parcel = firstParcel();
      expect(parcel.price).toBe(6600);
      expect(parcel.declared_value).toBe(6600);
    });

    it("rounds the COD price", async () => {
      await yalidineAdapter.createShipment(
        { ...sampleRequest, totalPrice: 2500.6 },
        validCreds,
      );
      const parcel = firstParcel();
      expect(parcel.price).toBe(2501);
      expect(parcel.declared_value).toBe(2501);
    });

    it("overrides from_wilaya_name via request.fromWilaya", async () => {
      await yalidineAdapter.createShipment(
        { ...sampleRequest, fromWilaya: "Oran" },
        validCreds,
      );
      expect(firstParcel().from_wilaya_name).toBe("Oran");
    });

    it("books a stop desk: is_stopdesk true + integer stopdesk_id", async () => {
      await yalidineAdapter.createShipment(
        { ...sampleRequest, stopDeskId: "123" },
        validCreds,
      );
      const parcel = firstParcel();
      expect(parcel.is_stopdesk).toBe(true);
      expect(parcel.stopdesk_id).toBe(123);
      expect(typeof parcel.stopdesk_id).toBe("number");
    });

    it("omits stopdesk_id entirely when no stop desk is requested", async () => {
      await yalidineAdapter.createShipment(sampleRequest, validCreds);
      const parcel = firstParcel();
      expect(parcel.is_stopdesk).toBe(false);
      expect(parcel).not.toHaveProperty("stopdesk_id");
    });

    it("sets has_exchange from request.isExchange", async () => {
      await yalidineAdapter.createShipment(
        { ...sampleRequest, isExchange: true },
        validCreds,
      );
      expect(firstParcel().has_exchange).toBe(true);
    });

    it("joins the product list as 'name xN'", async () => {
      await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(firstParcel().product_list).toBe("Product A x2, Product B x1");
    });

    it("surfaces the carrier message when the keyed entry fails", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          return { ok: true, json: async () => [{ _id: 1001, name: "Bab Ezzouar" }] };
        }
        if (url.includes("/parcels/") && opts?.method === "POST") {
          return {
            ok: true,
            json: async () => ({
              "ORD-001": {
                success: false,
                tracking: "",
                label: "",
                message: "Le numéro de téléphone est invalide",
              },
            }),
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Le numéro de téléphone est invalide");
    });

    it("tolerates the legacy bare-array response (tracking_id fallback)", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          return { ok: true, json: async () => [{ _id: 1001, name: "Bab Ezzouar" }] };
        }
        if (url.includes("/deliveryfees/")) {
          return { ok: true, json: async () => [{ home_delivery: 400 }] };
        }
        if (url.includes("/parcels/") && opts?.method === "POST") {
          return {
            ok: true,
            json: async () => [{ tracking_id: "T2", success: true, label: "l" }],
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(true);
      expect(result.trackingId).toBe("T2");
    });

    it("surfaces the array-legacy error field on failure", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          return { ok: true, json: async () => [{ _id: 1001, name: "Bab Ezzouar" }] };
        }
        if (url.includes("/parcels/") && opts?.method === "POST") {
          return {
            ok: true,
            json: async () => [{ success: false, error: "Phone invalide" }],
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Phone invalide");
    });

    it("falls back to the first entry when the response is keyed by another order_id", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          return { ok: true, json: async () => [{ _id: 1001, name: "Bab Ezzouar" }] };
        }
        if (url.includes("/deliveryfees/")) {
          return { ok: true, json: async () => [{ home_delivery: 400 }] };
        }
        if (url.includes("/parcels/") && opts?.method === "POST") {
          return {
            ok: true,
            json: async () => ({ "OTHER-1": { success: true, tracking: "T3" } }),
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(true);
      expect(result.trackingId).toBe("T3");
    });

    it("fails when success is true but tracking is empty", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          return { ok: true, json: async () => [{ _id: 1001, name: "Bab Ezzouar" }] };
        }
        if (url.includes("/parcels/") && opts?.method === "POST") {
          return {
            ok: true,
            json: async () => ({ "ORD-001": { success: true, tracking: "" } }),
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.trackingId).toBe("");
      expect(result.error).toBeTruthy();
    });

    it("returns error when create API returns non-OK", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          return { ok: true, json: async () => [{ _id: 1001, name: "Bab Ezzouar" }] };
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

    it("returns error when the response body is empty/unparseable", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          return { ok: true, json: async () => [{ _id: 1001, name: "Bab Ezzouar" }] };
        }
        if (url.includes("/parcels/") && opts?.method === "POST") {
          return { ok: true, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Réponse vide");
    });

    it("returns error when fetch throws", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          return { ok: true, json: async () => [{ _id: 1001, name: "Bab Ezzouar" }] };
        }
        if (url.includes("/parcels/") && opts?.method === "POST") {
          throw new Error("connection reset");
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await yalidineAdapter.createShipment(sampleRequest, validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("connection reset");
    });
  });

  describe("commune name resolution (create path)", () => {
    /** Commune tests use UNIQUE wilaya names: the resolved list is cached per process. */
    function communeRouter(
      wilaya: string,
      communes: Array<{ _id: number; name: string }>,
      communesOk = true,
    ) {
      const communesPath = `wilaya_name=${encodeURIComponent(wilaya)}`;
      return async (url: string, opts?: RequestInit) => {
        if (url.includes("/communes/")) {
          if (!url.includes(communesPath)) {
            return { ok: false, status: 404, text: async () => "wrong wilaya" };
          }
          return communesOk
            ? { ok: true, json: async () => communes }
            : { ok: false, status: 500, text: async () => "boom" };
        }
        if (url.includes("/deliveryfees/")) {
          return { ok: true, json: async () => [{ home_delivery: 400 }] };
        }
        if (url.includes("/parcels/") && opts?.method === "POST") {
          return {
            ok: true,
            json: async () => [{ tracking: "T9", success: true, label: "l" }],
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      };
    }

    async function createWith(wilaya: string, commune: string) {
      return yalidineAdapter.createShipment(
        {
          ...sampleRequest,
          customer: { ...sampleRequest.customer, wilaya, commune },
        },
        validCreds,
      );
    }

    it("phase 1 — exact match sends the carrier's own name", async () => {
      mockFetch.mockImplementation(
        communeRouter("Wilaya Exact 11", [{ _id: 1, name: "Bab Ezzouar" }]),
      );
      await createWith("Wilaya Exact 11", "Bab Ezzouar");
      expect(firstParcel().to_commune_name).toBe("Bab Ezzouar");
    });

    it("phase 2 — normalized match sends the carrier's spelling (bab-ezzouar → Bab Ezzouar)", async () => {
      mockFetch.mockImplementation(
        communeRouter("Wilaya Norm 12", [{ _id: 1, name: "Bab Ezzouar" }]),
      );
      await createWith("Wilaya Norm 12", "bab-ezzouar");
      expect(firstParcel().to_commune_name).toBe("Bab Ezzouar");
    });

    it("phase 2 — accent-insensitive match sends the accented carrier name (Bechar → Béchar)", async () => {
      mockFetch.mockImplementation(
        communeRouter("Wilaya Accent 13", [{ _id: 1, name: "Béchar" }]),
      );
      await createWith("Wilaya Accent 13", "Bechar");
      expect(firstParcel().to_commune_name).toBe("Béchar");
    });

    it("phase 3 — near-variant match (Aghbal → Aghabal)", async () => {
      mockFetch.mockImplementation(
        communeRouter("Wilaya Near 14", [{ _id: 1, name: "Aghabal" }]),
      );
      await createWith("Wilaya Near 14", "Aghbal");
      expect(firstParcel().to_commune_name).toBe("Aghabal");
    });

    it("falls back to the raw request commune when nothing matches", async () => {
      mockFetch.mockImplementation(
        communeRouter("Wilaya Miss 15", [{ _id: 1, name: "Hydra" }]),
      );
      await createWith("Wilaya Miss 15", "Inconnue-sur-Mer");
      expect(firstParcel().to_commune_name).toBe("Inconnue-sur-Mer");
    });

    it("falls back to the raw request commune when the communes endpoint fails", async () => {
      mockFetch.mockImplementation(communeRouter("Wilaya Fail 16", [], false));
      await createWith("Wilaya Fail 16", "Bab Ezzouar");
      expect(firstParcel().to_commune_name).toBe("Bab Ezzouar");
    });

    it("caches the commune list per process (single fetch for repeated wilaya)", async () => {
      mockFetch.mockImplementation(
        communeRouter("Wilaya Cache 17", [{ _id: 1, name: "Bab Ezzouar" }]),
      );
      await createWith("Wilaya Cache 17", "Bab Ezzouar");
      await createWith("Wilaya Cache 17", "Bab Ezzouar");
      const communeCalls = mockFetch.mock.calls.filter((c) =>
        String(c[0]).includes("/communes/"),
      );
      expect(communeCalls).toHaveLength(1);
    });
  });

  describe("syncTracking", () => {
    it("throws when no API ID/token", async () => {
      await expect(
        yalidineAdapter.syncTracking("YAL-1", {}),
      ).rejects.toThrow("Identifiants Yalidine manquants");
    });

    it("parses the paginated envelope and carries transit no-ops forward", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/YAL")) {
          return { ok: true, json: async () => ({ status: "Sorti en livraison" }) };
        }
        if (url.includes("/histories/")) {
          return {
            ok: true,
            json: async () => ({
              data: [
                { status: "Sorti en livraison", date_status: "2026-01-04T08:00:00Z", center_name: "Bab Ezzouar" },
                { status: "En transit", date_status: "2026-01-03T08:00:00Z", center_name: "Centre Alger" },
                { status: "Ramassé", date_status: "2026-01-02T08:00:00Z", center_name: "Hub Alger" },
                { status: "En préparation", date_status: "2026-01-01T08:00:00Z", center_name: "Alger" },
              ],
              has_more: false,
              total_count: 4,
            }),
          };
        }
        return { ok: false, status: 401, text: async () => "" };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      // Rows arrive newest-first; events are oldest-first with carry-forward.
      expect(result.events.map((e) => e.status)).toEqual([
        "pending",
        "pending",
        "pending",
        "out_for_delivery",
      ]);
      expect(eventAt(result.events, 0).details).toBe("En préparation");
      expect(eventAt(result.events, 0).location).toBe("Alger");
      expect(eventAt(result.events, 0).timestamp).toBe("2026-01-01T08:00:00Z");
      expect(eventAt(result.events, 2).location).toBe("Centre Alger");
      expect(result.status).toBe("out_for_delivery");
    });

    it("Ramassé (no-op) never regresses a dispatched parcel", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/YAL")) {
          return { ok: false, status: 401, text: async () => "err" };
        }
        if (url.includes("/histories/")) {
          return {
            ok: true,
            json: async () => ({
              data: [
                { status: "Ramassé", date_status: "2026-01-03T08:00:00Z", center_name: "Hub" },
                { status: "Sorti en livraison", date_status: "2026-01-02T08:00:00Z", center_name: "Alger" },
              ],
              has_more: false,
              total_count: 2,
            }),
          };
        }
        return { ok: false, status: 401, text: async () => "" };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.events.map((e) => e.status)).toEqual([
        "out_for_delivery",
        "out_for_delivery",
      ]);
      expect(result.status).toBe("out_for_delivery");
    });

    it("Retour vers centre stays a no-op: a delivered parcel stays delivered", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/YAL")) {
          return { ok: false, status: 401, text: async () => "err" };
        }
        if (url.includes("/histories/")) {
          return {
            ok: true,
            json: async () => ({
              data: [
                { status: "Retour vers centre", date_status: "2026-01-03T08:00:00Z", center_name: "Centre" },
                { status: "Livré", date_status: "2026-01-02T08:00:00Z", center_name: "Alger" },
              ],
              has_more: false,
              total_count: 2,
            }),
          };
        }
        return { ok: false, status: 401, text: async () => "" };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.events.map((e) => e.status)).toEqual([
        "delivered",
        "delivered",
      ]);
      expect(result.status).toBe("delivered");
    });

    it("Tentative échouée maps to out_for_delivery with the reason in the details", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/YAL")) {
          return { ok: false, status: 401, text: async () => "err" };
        }
        if (url.includes("/histories/")) {
          return {
            ok: true,
            json: async () => ({
              data: [
                { status: "Livré", date_status: "2026-01-04T08:00:00Z", center_name: "Alger" },
                { status: "Tentative échouée", date_status: "2026-01-03T08:00:00Z", center_name: "Hydra", reason: "Client ne répond pas" },
              ],
              has_more: false,
              total_count: 2,
            }),
          };
        }
        return { ok: false, status: 401, text: async () => "" };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.events.map((e) => e.status)).toEqual([
        "out_for_delivery",
        "delivered",
      ]);
      expect(eventAt(result.events, 0).details).toBe(
        "Tentative échouée — Client ne répond pas",
      );
      expect(result.status).toBe("delivered");
    });

    it("unmapped rows keep the carry-forward status and surface the raw status in the details", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/YAL")) {
          return { ok: false, status: 401, text: async () => "err" };
        }
        if (url.includes("/histories/")) {
          return {
            ok: true,
            json: async () => ({
              data: [
                { status: "Statut Zombie", date_status: "2026-01-03T08:00:00Z", center_name: "Alger" },
                { status: "Livré", date_status: "2026-01-02T08:00:00Z", center_name: "Alger" },
              ],
              has_more: false,
              total_count: 2,
            }),
          };
        }
        return { ok: false, status: 401, text: async () => "" };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.events.map((e) => e.status)).toEqual([
        "delivered",
        "delivered",
      ]);
      expect(eventAt(result.events, 1).details).toBe("Statut Zombie");
      expect(result.status).toBe("delivered");
    });

    it("tolerates the legacy bare-array history body", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/YAL")) {
          return { ok: true, json: async () => ({ status: "Livré" }) };
        }
        if (url.includes("/histories/")) {
          return {
            ok: true,
            json: async () => [
              { status: "Livré", date_status: "2026-01-05T00:00:00Z", center_name: "Bab Ezzouar" },
              { status: "Sorti en livraison", date_status: "2026-01-04T00:00:00Z", center_name: "Alger" },
            ],
          };
        }
        return { ok: false, status: 401, text: async () => "" };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.events.map((e) => e.status)).toEqual([
        "out_for_delivery",
        "delivered",
      ]);
      expect(result.status).toBe("delivered");
    });

    it("handles non-envelope garbage history gracefully", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/YAL")) {
          return { ok: true, json: async () => ({ status: "Livré" }) };
        }
        if (url.includes("/histories/")) {
          return { ok: true, json: async () => ({ not: "an array" }) };
        }
        return { ok: true, json: async () => ({}) };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.events).toHaveLength(0);
      expect(result.status).toBe("delivered");
    });

    it("reads the object envelope of the parcel GET (status field)", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/YAL")) {
          return { ok: true, json: async () => ({ status: "Annulé" }) };
        }
        if (url.includes("/histories/")) {
          return { ok: true, json: async () => ({ data: [], has_more: false, total_count: 0 }) };
        }
        return { ok: false, status: 401, text: async () => "" };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.status).toBe("failed"); // no cancelled state: Annulé → failed
    });

    it("reads the legacy array parcel GET (parcel_status + delivery_date)", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/YAL")) {
          return {
            ok: true,
            json: async () => [{ parcel_status: "Livré", delivery_date: "2026-01-05" }],
          };
        }
        if (url.includes("/histories/")) {
          return { ok: true, json: async () => ({ data: [], has_more: false, total_count: 0 }) };
        }
        return { ok: false, status: 401, text: async () => "" };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.status).toBe("delivered");
      expect(result.estimatedDelivery).toBe("2026-01-05");
    });

    it("an unmapped parcel-GET status falls back to the last meaningful event", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/YAL")) {
          return { ok: true, json: async () => ({ status: "Non livré" }) };
        }
        if (url.includes("/histories/")) {
          return {
            ok: true,
            json: async () => ({
              data: [
                { status: "Livré", date_status: "2026-01-05T00:00:00Z", center_name: "Alger" },
              ],
              has_more: false,
              total_count: 1,
            }),
          };
        }
        return { ok: false, status: 401, text: async () => "" };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.status).toBe("delivered");
    });

    it("returns pending when the parcel GET fails and history is empty", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/parcels/YAL")) {
          return { ok: false, status: 401, text: async () => "err" };
        }
        if (url.includes("/histories/")) {
          return { ok: true, json: async () => ({ data: [], has_more: false, total_count: 0 }) };
        }
        return { ok: false, status: 401, text: async () => "" };
      });

      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.status).toBe("pending");
      expect(result.events).toHaveLength(0);
    });

    it("calls /parcels/{tracking}/ and /histories/?tracking= in parallel", async () => {
      await yalidineAdapter.syncTracking("YAL-001", validCreds);
      const urls = mockFetch.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/parcels/YAL-001/"))).toBe(true);
      expect(urls.some((u) => u.includes("/histories/?tracking=YAL-001"))).toBe(true);
    });

    it("keeps deliveryCompany and tracking id on the info object", async () => {
      const result = await yalidineAdapter.syncTracking("YAL-001", validCreds);
      expect(result.trackingId).toBe("YAL-001");
      expect(result.deliveryCompany).toBe("Yalidine");
      expect(result.estimatedDelivery).toBe("2026-01-05");
    });
  });

  describe("cancelShipment", () => {
    it("returns error when no API ID/token", async () => {
      const result = await yalidineAdapter.cancelShipment!("YAL-001", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Identifiants Yalidine manquants");
    });

    it("succeeds only when the matching row has deleted === true", async () => {
      const result = await yalidineAdapter.cancelShipment!("YAL-001", validCreds);
      expect(result.success).toBe(true);

      const [url, opts] = requiredCall(
        (u, o) => u.includes("/parcels/YAL-001/") && o?.method === "DELETE",
      );
      expect(url).toContain("/parcels/YAL-001/");
      expect(opts.method).toBe("DELETE");
    });

    it("treats HTTP 200 with deleted === false as FAILURE, surfacing the row message", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/parcels/") && opts?.method === "DELETE") {
          return {
            ok: true,
            json: async () => [
              { tracking: "YAL-001", deleted: false, message: "Colis déjà ramassé" },
            ],
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.cancelShipment!("YAL-001", validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Colis déjà ramassé");
    });

    it("fails HTTP 200 + deleted false even without a row message", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/parcels/") && opts?.method === "DELETE") {
          return {
            ok: true,
            json: async () => [{ tracking: "YAL-001", deleted: false }],
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.cancelShipment!("YAL-001", validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it("governs by the MATCHING tracking row, not by any other row", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/parcels/") && opts?.method === "DELETE") {
          return {
            ok: true,
            json: async () => [
              { tracking: "OTHER-1", deleted: true },
              { tracking: "YAL-001", deleted: false, message: "Déjà supprimé" },
            ],
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.cancelShipment!("YAL-001", validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Déjà supprimé");
    });

    it("accepts a single-row object envelope", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/parcels/") && opts?.method === "DELETE") {
          return {
            ok: true,
            json: async () => ({ tracking: "YAL-001", deleted: true }),
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.cancelShipment!("YAL-001", validCreds);
      expect(result.success).toBe(true);
    });

    it("accepts an object envelope with a data array", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/parcels/") && opts?.method === "DELETE") {
          return {
            ok: true,
            json: async () => ({ data: [{ tracking: "YAL-001", deleted: true }] }),
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.cancelShipment!("YAL-001", validCreds);
      expect(result.success).toBe(true);
    });

    it("fails on an unparseable HTTP 200 body", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/parcels/") && opts?.method === "DELETE") {
          return {
            ok: true,
            json: async () => {
              throw new Error("unexpected token");
            },
          };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.cancelShipment!("YAL-001", validCreds);
      expect(result.success).toBe(false);
    });

    it("returns error on non-OK API response", async () => {
      mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
        if (url.includes("/parcels/") && opts?.method === "DELETE") {
          return { ok: false, status: 400, text: async () => "Bad request" };
        }
        return { ok: false, status: 404, text: async () => "" };
      });

      const result = await yalidineAdapter.cancelShipment!("YAL-001", validCreds);
      expect(result.success).toBe(false);
      expect(result.error).toContain("400");
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
});
