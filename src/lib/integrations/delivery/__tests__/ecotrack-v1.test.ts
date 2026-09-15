import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ecoTrackAdapter } from "../ecotrack";
import { SahelFlowError } from "@/types/errors";
import type { ShipmentRequest } from "../types";

const fetchMock = vi.fn();

const CREATE_URL = "https://packers.ecotrack.dz/api/v1/create/order";
// True-EcoTrack v1 credentials: a Bearer token plus the canonical create URL.
// The NOEST-era userGuid is deliberately absent — it is not part of this
// contract (FD-061 EX-2).
const V1_CREDENTIALS = { apiToken: "eco-bearer-token", createOrderUrl: CREATE_URL };

const shipment: ShipmentRequest = {
  orderId: "order-eco-1",
  orderNumber: "ORDER-ECO-1",
  customer: {
    name: "Client Eco",
    phone: "0551234500",
    wilaya: "Alger",
    commune: "Hydra",
    address: "1 rue de l'Eco",
  },
  items: [{ name: "Widget", quantity: 2, unitPrice: 1_000 }],
  totalPrice: 2_500,
  weight: 1.5,
  notes: "Handle carefully",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("EcoTrack true-v1 dialect (FD-061 EX-2, CodFlow contract)", () => {
  it("probes GET /api/v1/validate/token with QUERY-PARAM auth (the recorded exception)", async () => {
    fetchMock.mockResolvedValue(json({ success: true, message: "VALID_TOKEN" }));
    const result = await ecoTrackAdapter.testConnection?.(V1_CREDENTIALS);
    expect(result).toMatchObject({ ok: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://packers.ecotrack.dz/api/v1/validate/token?api_token=eco-bearer-token",
    );
    expect((init as RequestInit).method).toBe("GET");
  });

  it("surfaces TOKEN_NOT_ALLOWED as public-API-disabled, not as invalid credentials", async () => {
    fetchMock.mockResolvedValue(json({ success: false, message: "TOKEN_NOT_ALLOWED" }));
    const result = await ecoTrackAdapter.testConnection?.(V1_CREDENTIALS);
    expect(result).toMatchObject({ ok: false });
    expect(result?.message).toContain("public API is disabled");
  });

  it("creates through the QUERY-STRING contract with no JSON body and a Bearer header", async () => {
    fetchMock.mockResolvedValue(json({ success: true, tracking: "ECO-TRK-1" }));

    const created = await ecoTrackAdapter.createShipment(shipment, V1_CREDENTIALS);
    expect(created).toEqual({
      success: true,
      trackingId: "ECO-TRK-1",
      labelUrl: "https://packers.ecotrack.dz/api/v1/get/order/label?tracking=ECO-TRK-1",
      cost: 0,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    const requestUrl = new URL(String(url));
    expect(requestUrl.origin + requestUrl.pathname).toBe(CREATE_URL);
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeUndefined();
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer eco-bearer-token",
    });
    const query = requestUrl.searchParams;
    expect(query.get("nom_client")).toBe("Client Eco");
    expect(query.get("telephone")).toBe("0551234500");
    expect(query.get("adresse")).toBe("1 rue de l'Eco");
    expect(query.get("code_wilaya")).toBe("16");
    expect(query.get("commune")).toBe("Hydra");
    expect(query.get("montant")).toBe("2500");
    expect(query.get("type")).toBe("1");
    expect(query.get("reference")).toBe("ORDER-ECO-1");
    expect(query.get("produit")).toBe("Widget x2");
    expect(query.get("remarque")).toBe("Handle carefully");
    expect(query.get("weight")).toBe("2");
  });

  it("types HTTP-200 business failures (10001/10002/10003) instead of failing generically", async () => {
    fetchMock.mockResolvedValue(json({ success: false, error: 10002 }));
    const created = await ecoTrackAdapter.createShipment(shipment, V1_CREDENTIALS);
    expect(created).toMatchObject({ success: false, trackingId: "" });
    expect(created.error).toContain("10002");
    expect(created.error).toContain("wilaya is not served by this EcoTrack tenant");
  });

  it("throws the typed rate-limit error on the 50/min throttle", async () => {
    fetchMock.mockResolvedValue(json({ message: "Too Many Attempts." }, 429));
    await expect(ecoTrackAdapter.createShipment(shipment, V1_CREDENTIALS)).rejects.toMatchObject({
      code: "ECOTRACK_RATE_LIMITED",
      statusCode: 429,
    });
  });

  it("flattens Laravel 422 validation bags into the failure message", async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          message: "The given data was invalid.",
          errors: { telephone: ["Le téléphone est invalide"] },
        },
        422,
      ),
    );
    const created = await ecoTrackAdapter.createShipment(shipment, V1_CREDENTIALS);
    expect(created).toMatchObject({ success: false });
    expect(created.error).toContain("telephone: Le téléphone est invalide");
  });

  it("never auto-validates: valid/order locks the order, so create stops after create", async () => {
    fetchMock.mockResolvedValue(json({ success: true, tracking: "ECO-TRK-2" }));
    await ecoTrackAdapter.createShipment(shipment, V1_CREDENTIALS);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/v1/valid/order")),
    ).toHaveLength(0);
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it("maps the activity array ({date,time,status,station}) with carry-forward", async () => {
    fetchMock.mockImplementation(async () =>
      json({
        activity: [
          {
            date: "2026-09-13",
            time: "08:00:00",
            status: "order_information_received_by_carrier",
            station: "Alger hub",
          },
          // Activity rows use the ACTIVITY key space (dispatched_to_driver,
          // livred, …) — not the order-status enum keys.
          { date: "2026-09-13", time: "09:00:00", status: "dispatched_to_driver", station: "Hydra" },
          // Unknown activity key — logged raw, status carries forward.
          { date: "2026-09-13", time: "09:30:00", status: "cle_inconnue", station: "Hydra" },
          { date: "2026-09-13", time: "10:00:00", status: "livred", station: "Hydra" },
        ],
      }),
    );

    const tracking = await ecoTrackAdapter.syncTracking("ECO-TRK-1", V1_CREDENTIALS);
    expect(tracking.status).toBe("delivered");
    expect(tracking.deliveryCompany).toBe("EcoTrack courier");
    expect(tracking.events.map((event) => event.status)).toEqual([
      "created",
      "out_for_delivery",
      "out_for_delivery",
      "delivered",
    ]);
    expect(tracking.events[0]).toMatchObject({
      timestamp: "2026-09-13 08:00:00",
      location: "Alger hub",
    });
    // The info path is GET with the tracking as a query param.
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://packers.ecotrack.dz/api/v1/get/tracking/info?tracking=ECO-TRK-1");
  });

  it("answers without activity with a pending placeholder event", async () => {
    fetchMock.mockResolvedValue(json({ activity: [] }));
    const tracking = await ecoTrackAdapter.syncTracking("ECO-TRK-EMPTY", V1_CREDENTIALS);
    expect(tracking.status).toBe("pending");
    expect(tracking.events).toHaveLength(1);
    expect(tracking.events[0]!.details).toContain("without activity");
  });

  it("reports honest fee unavailability — the extracted contract has no pricing endpoint", async () => {
    const estimate = await ecoTrackAdapter.estimateCost(
      { wilaya: "Alger", weight: 1, codAmount: 2_500 },
      V1_CREDENTIALS,
    );
    expect(estimate).toMatchObject({ provider: "ecotrack", cost: 0, available: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the NOEST-profile dialect on the historical form-body contract", async () => {
    const profileCredentials = {
      apiToken: "profile-token",
      userGuid: "profile-guid",
      createOrderUrl: "https://app.noest-dz.com/api/public/create/order",
      validateOrderUrl: "https://app.noest-dz.com/api/public/validate/order",
      trackingsUrl: "https://app.noest-dz.com/api/public/get/trackings/info",
      feesUrl: "https://app.noest-dz.com/api/public/fees",
    };
    fetchMock.mockImplementation(async () => json({ success: true, tracking: "NOEST-TRK-1" }));

    const created = await ecoTrackAdapter.createShipment(shipment, profileCredentials);
    expect(created).toMatchObject({ success: true, trackingId: "NOEST-TRK-1" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://app.noest-dz.com/api/public/create/order");
    expect(String((init as RequestInit).body)).toContain("api_token=profile-token");
    expect(String((init as RequestInit).body)).toContain("user_guid=profile-guid");
    // The profile dialect still validates right after create.
    expect(
      fetchMock.mock.calls.some(([callUrl]) =>
        String(callUrl).includes("/api/public/validate/order"),
      ),
    ).toBe(true);
  });

  it("throws the structured ambiguous-outcome error when create fails on the network", async () => {
    fetchMock.mockRejectedValue(new Error("connection reset"));
    await expect(ecoTrackAdapter.createShipment(shipment, V1_CREDENTIALS)).rejects.toMatchObject({
      code: "ECOTRACK_CREATE_OUTCOME_AMBIGUOUS",
    } as Partial<SahelFlowError>);
  });
});
