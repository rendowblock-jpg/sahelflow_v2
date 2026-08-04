import { beforeEach, describe, expect, it, vi } from "vitest";

import { noestAdapter } from "../noest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const credentials = {
  apiToken: "token",
  userGuid: "guid",
  createOrderUrl: "https://merchant.noest.example/create",
  validateOrderUrl: "https://merchant.noest.example/validate",
  trackingsUrl: "https://merchant.noest.example/api/public/get/trackings/info",
  feesUrl: "https://merchant.noest.example/fees",
};

const request = {
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

describe("NOEST delivery adapter", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("never uses a guessed endpoint when provider URLs are missing", async () => {
    const result = await noestAdapter.estimateCost(
      { wilaya: "Alger", weight: 1, codAmount: 2000 },
      { apiToken: "token", userGuid: "guid" },
    );

    expect(result).toMatchObject({
      provider: "noest",
      available: false,
    });
    expect(result.error).toMatch(/fees URL is not configured/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("reads the documented tariff response using the configured exact URL", async () => {
    mockFetch.mockResolvedValueOnce(
      response({ tarifs: { delivery: { "16": { tarif: "750" } } } }),
    );

    const result = await noestAdapter.estimateCost(
      { wilaya: "Alger", weight: 1, codAmount: 2000 },
      credentials,
    );

    expect(result).toEqual({ provider: "noest", cost: 750, available: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(credentials.feesUrl);
    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("api_token=token");
    expect(String(init.body)).toContain("user_guid=guid");
  });

  it("creates then validates one shipment before reporting success", async () => {
    mockFetch
      .mockResolvedValueOnce(response({ success: true, tracking: "NOEST-123" }))
      .mockResolvedValueOnce(response({ success: true }));

    const result = await noestAdapter.createShipment(request, credentials);

    expect(result).toEqual({
      success: true,
      trackingId: "NOEST-123",
      cost: 0,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(credentials.createOrderUrl);
    expect(mockFetch.mock.calls[1]?.[0]).toBe(credentials.validateOrderUrl);
    expect(String((mockFetch.mock.calls[1]?.[1] as RequestInit).body)).toContain(
      "tracking=NOEST-123",
    );
  });

  it("surfaces an ambiguous outcome after creation when validation is not confirmed", async () => {
    mockFetch
      .mockResolvedValueOnce(response({ success: true, tracking: "NOEST-123" }))
      .mockRejectedValueOnce(new Error("connection reset"));

    await expect(noestAdapter.createShipment(request, credentials)).rejects.toMatchObject({
      code: "NOEST_VALIDATION_OUTCOME_AMBIGUOUS",
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("maps documented tracking activity to normalized delivery states", async () => {
    mockFetch.mockResolvedValueOnce(
      response({
        "NOEST-123": {
          OrderInfo: { tracking: "NOEST-123" },
          activity: [
            { event_key: "customer_validation", event: "Validé", date: "2026-08-01 10:00:00" },
            { event_key: "livre", event: "Livré", date: "2026-08-02 10:00:00" },
          ],
        },
      }),
    );

    const result = await noestAdapter.syncTracking("NOEST-123", credentials);

    expect(result.status).toBe("delivered");
    expect(result.events.map((event) => event.status)).toEqual([
      "created",
      "delivered",
    ]);
    const body = String((mockFetch.mock.calls[0]?.[1] as RequestInit).body);
    expect(body).toContain("trackings%5B%5D=NOEST-123");
  });
});
