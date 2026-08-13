import { beforeEach, describe, expect, it, vi } from "vitest";

import { ecoTrackAdapter } from "../ecotrack";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const credentials = {
  carrierName: "Courier Test",
  apiToken: "token",
  userGuid: "guid",
  createOrderUrl: "https://merchant.ecotrack.example/create",
  validateOrderUrl: "https://merchant.ecotrack.example/validate",
  trackingsUrl: "https://merchant.ecotrack.example/api/public/get/trackings/info",
  feesUrl: "https://merchant.ecotrack.example/fees",
};

const shipment = {
  orderId: "order-1",
  orderNumber: "SF-001",
  customer: {
    name: "Client Test",
    phone: "0550000000",
    wilaya: "Alger",
    commune: "Hydra",
    address: "Rue test",
  },
  items: [{ name: "Produit", quantity: 2, unitPrice: 1000 }],
  totalPrice: 2000,
  weight: 1,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("EcoTrack courier adapter", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("never guesses missing courier endpoints", async () => {
    const result = await ecoTrackAdapter.estimateCost(
      { wilaya: "Alger", weight: 1, codAmount: 2000 },
      { apiToken: "token", userGuid: "guid" },
    );
    expect(result).toMatchObject({ provider: "ecotrack", available: false });
    expect(result.error).toMatch(/URL is not configured/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses to forward credentials across mixed endpoint origins", async () => {
    const result = await ecoTrackAdapter.estimateCost(
      { wilaya: "Alger", weight: 1, codAmount: 2000 },
      { ...credentials, feesUrl: "https://other.example/fees" },
    );
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/share one HTTPS origin/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("reads EcoTrack tariffs and returns the canonical provider identity", async () => {
    mockFetch.mockResolvedValueOnce(
      response({ tarifs: { delivery: { "16": { tarif: "750" } } } }),
    );
    const result = await ecoTrackAdapter.estimateCost(
      { wilaya: "Alger", weight: 1, codAmount: 2000 },
      credentials,
    );
    expect(result).toEqual({ provider: "ecotrack", cost: 750, available: true });
    expect(String((mockFetch.mock.calls[0]?.[1] as RequestInit).body)).toContain("api_token=token");
  });

  it("creates then validates one shipment before reporting success", async () => {
    mockFetch
      .mockResolvedValueOnce(response({ success: true, tracking: "TRACK-123" }))
      .mockResolvedValueOnce(response({ success: true }));
    const result = await ecoTrackAdapter.createShipment(shipment, credentials);
    expect(result).toEqual({ success: true, trackingId: "TRACK-123", cost: 0 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("keeps validation uncertainty ambiguous instead of retrying a parcel create", async () => {
    mockFetch
      .mockResolvedValueOnce(response({ success: true, tracking: "TRACK-123" }))
      .mockRejectedValue(new Error("connection reset"));
    await expect(
      ecoTrackAdapter.createShipment(shipment, credentials),
    ).rejects.toMatchObject({ code: "ECOTRACK_VALIDATION_OUTCOME_AMBIGUOUS" });
    expect(mockFetch.mock.calls[0]?.[0]).toBe(credentials.createOrderUrl);
  });

  it("projects configured courier identity below the EcoTrack transport", async () => {
    mockFetch.mockResolvedValueOnce(
      response({
        "TRACK-123": {
          OrderInfo: { tracking: "TRACK-123" },
          activity: [
            { event_key: "customer_validation", event: "Validé", date: "2026-08-01" },
            { event_key: "livre", event: "Livré", date: "2026-08-02" },
          ],
        },
      }),
    );
    const result = await ecoTrackAdapter.syncTracking("TRACK-123", credentials);
    expect(result.deliveryCompany).toBe("Courier Test");
    expect(result.events.map((event) => event.status)).toEqual(["created", "delivered"]);
  });

  it("never classifies non livré as delivered", async () => {
    mockFetch.mockResolvedValueOnce(
      response({
        "TRACK-123": {
          OrderInfo: { tracking: "TRACK-123" },
          activity: [
            { event_key: "non_livre", event: "Non livré", date: "2026-08-03" },
          ],
        },
      }),
    );
    const result = await ecoTrackAdapter.syncTracking("TRACK-123", credentials);
    expect(result.status).toBe("refused");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.status).toBe("refused");
    expect(result.events.some((event) => event.status === "delivered")).toBe(false);
  });
});