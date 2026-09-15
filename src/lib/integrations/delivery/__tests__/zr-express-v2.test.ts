import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { zrExpressAdapter } from "../zr-express";
import type { ShipmentRequest } from "../types";

const fetchMock = vi.fn();

// New-platform credentials (apiToken = "API Key", tenant = "Tenant ID").
// Every test uses a UNIQUE tenant so the module-level per-tenant territory
// and hub caches never bleed between cases.
function v2Creds(tenant = `tenant-${Math.random().toString(36).slice(2, 8)}`) {
  return { apiToken: `zk-${tenant}`, tenant };
}

const shipment: ShipmentRequest = {
  orderId: "order-v2-1",
  orderNumber: "ORDER-V2-1",
  customer: {
    name: "Client V2",
    phone: "0551234500",
    wilaya: "Alger",
    commune: "Hydra",
    address: "1 rue de la V2",
  },
  items: [{ name: "Widget", quantity: 2, unitPrice: 1_000 }],
  totalPrice: 2_500,
  weight: 1.5,
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

describe("ZR Express new-platform dialect (FD-061 EX-2, CodFlow contract)", () => {
  it("routes new-platform credentials to the api.zrexpress.app probe", async () => {
    fetchMock.mockResolvedValue(json({ items: [{ id: "terr-1" }], totalPages: 1 }));
    const result = await zrExpressAdapter.testConnection?.(v2Creds());
    expect(result).toMatchObject({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.zrexpress.app/api/v1/territories/search");
    expect((init as RequestInit).headers).toMatchObject({
      "X-Api-Key": expect.any(String),
      "X-Tenant": expect.any(String),
    });
  });

  it("books through customer → territory → parcel → tracking-number resolution", async () => {
    const creds = v2Creds();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/territories/search") && method === "POST") {
        const body = JSON.parse(String(init!.body));
        if (body.keyword === "Alger") {
          return json({
            items: [{ id: "terr-city", code: 16, level: "wilaya", name: "Alger" }],
            totalPages: 1,
          });
        }
        if (body.keyword === "Hydra") {
          return json({
            items: [
              { id: "terr-dist", level: "commune", parentId: "terr-city", name: "Hydra" },
            ],
            totalPages: 1,
          });
        }
        return json({ items: [], totalPages: 1 });
      }
      if (url.endsWith("/customers/individual") && method === "POST") {
        return json({ id: "cust-1" });
      }
      if (url.endsWith("/parcels") && method === "POST") {
        // Single create returns the UUID only — the tracking number arrives
        // through the parcel GET (live-proven contract point).
        return json({ id: "parcel-uuid-1" });
      }
      if (url.endsWith("/parcels/parcel-uuid-1") && method === "GET") {
        return json({ id: "parcel-uuid-1", trackingNumber: "ZRV2-TRK-1" });
      }
      if (url.endsWith("/parcels/labels/individual/pdf") && method === "POST") {
        return json({ parcelLabelFiles: [{ fileUrl: "https://sas.example/label.pdf" }] });
      }
      throw new Error(`Unexpected ZR v2 request: ${method} ${url}`);
    });

    const created = await zrExpressAdapter.createShipment(shipment, creds);
    expect(created).toEqual({
      success: true,
      trackingId: "ZRV2-TRK-1",
      labelUrl: "https://sas.example/label.pdf",
      cost: 0,
    });

    const headers = fetchMock.mock.calls.map((call) => call[1] as RequestInit);
    for (const init of headers) {
      expect(init.headers).toMatchObject({
        "X-Api-Key": expect.stringMatching(/^zk-/),
        "X-Tenant": expect.any(String),
      });
    }

    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith("/parcels") && (init as RequestInit).method === "POST",
    );
    const payload = JSON.parse(String((createCall?.[1] as RequestInit).body));
    expect(payload).toEqual({
      customer: {
        customerId: "cust-1",
        name: "Client V2",
        phone: { number1: "+213551234500" },
      },
      deliveryAddress: {
        cityTerritoryId: "terr-city",
        districtTerritoryId: "terr-dist",
        street: "1 rue de la V2",
      },
      deliveryType: "home",
      amount: 2_500,
      description: "Widget x2",
      externalId: "ORDER-V2-1",
      orderedProducts: [
        {
          productName: "Widget x2",
          unitPrice: 2_500,
          quantity: 1,
          stockType: "none",
        },
      ],
    });
  });

  it("fails loudly for the four verified-unserved wilayas without any network call", async () => {
    const created = await zrExpressAdapter.createShipment(
      { ...shipment, customer: { ...shipment.customer, wilaya: "Illizi" } },
      v2Creds(),
    );
    expect(created).toMatchObject({
      success: false,
      error: expect.stringContaining("33"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never falls back to items[0] when the commune does not match (strict district resolution)", async () => {
    const creds = v2Creds();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/territories/search")) {
        const body = JSON.parse(String(init!.body));
        if (body.keyword === "Alger") {
          return json({
            items: [{ id: "terr-city", code: 16, level: "wilaya", name: "Alger" }],
            totalPages: 1,
          });
        }
        // Only an unrelated commune comes back — no parent match, no name match.
        return json({
          items: [{ id: "terr-other", level: "commune", parentId: "terr-xyz", name: "Bab Ezzouar" }],
          totalPages: 1,
        });
      }
      if (url.endsWith("/customers/individual")) return json({ id: "cust-1" });
      throw new Error(`Unexpected ZR v2 request: ${url}`);
    });

    const created = await zrExpressAdapter.createShipment(shipment, creds);
    expect(created).toMatchObject({
      success: false,
      error: expect.stringContaining("could not resolve commune"),
    });
  });

  it("resolves stop desks through HUBS (isPickupPoint), not territories", async () => {
    const creds = v2Creds();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/hubs/search") && method === "POST") {
        return json({
          items: [
            {
              id: "hub-9",
              isPickupPoint: true,
              address: { cityTerritoryId: "city-9", districtTerritoryId: "dist-9" },
            },
          ],
          totalPages: 1,
        });
      }
      if (url.endsWith("/customers/individual")) return json({ id: "cust-1" });
      if (url.endsWith("/parcels") && method === "POST") return json({ id: "parcel-uuid-2" });
      if (url.endsWith("/parcels/parcel-uuid-2")) {
        return json({ id: "parcel-uuid-2", trackingNumber: "ZRV2-TRK-2" });
      }
      if (url.endsWith("/parcels/labels/individual/pdf")) {
        return json({ parcelLabelFiles: [] });
      }
      throw new Error(`Unexpected ZR v2 request: ${method} ${url}`);
    });

    const created = await zrExpressAdapter.createShipment(
      { ...shipment, stopDeskId: "hub-9" },
      creds,
    );
    expect(created).toMatchObject({ success: true, trackingId: "ZRV2-TRK-2" });

    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith("/parcels") && (init as RequestInit).method === "POST",
    );
    const payload = JSON.parse(String((createCall?.[1] as RequestInit).body));
    expect(payload.deliveryType).toBe("pickup-point");
    expect(payload.hubId).toBe("hub-9");
    expect(payload.deliveryAddress).toEqual({
      cityTerritoryId: "city-9",
      districtTerritoryId: "dist-9",
      street: "1 rue de la V2",
    });
    // The hub carries its own territories — no territory search is made.
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/territories/search")),
    ).toHaveLength(0);
  });

  it("resolves the parcel UUID before reading state history and applies carry-forward", async () => {
    const creds = v2Creds();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/parcels/ZRV2-TRK-3")) {
        return json({
          id: "parcel-uuid-3",
          trackingNumber: "ZRV2-TRK-3",
          state: { name: "livre", description: "Livré au client" },
          isReturn: false,
        });
      }
      if (url.endsWith("/parcels/parcel-uuid-3/state-history")) {
        return json([
          { newState: { name: "commande_recue", description: null }, createdAt: "2026-09-13T08:00:00Z" },
          { newState: { name: "en_livraison", description: null }, createdAt: "2026-09-13T09:00:00Z" },
          // A tenant-invented state name — logged, never changes the status.
          { newState: { name: "etat_invente_par_tenant", description: null }, createdAt: "2026-09-13T09:30:00Z" },
          { newState: { name: "livre", description: null }, createdAt: "2026-09-13T10:00:00Z" },
        ]);
      }
      throw new Error(`Unexpected ZR v2 request: ${url}`);
    });

    const tracking = await zrExpressAdapter.syncTracking("ZRV2-TRK-3", creds);
    expect(tracking.status).toBe("delivered");
    // Oldest-first with carry-forward: the unmapped state keeps out_for_delivery.
    expect(tracking.events.map((event) => event.status)).toEqual([
      "created",
      "out_for_delivery",
      "out_for_delivery",
      "delivered",
    ]);
    // The history path was called with the UUID, never the tracking number.
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/parcels/ZRV2-TRK-3/state-history"),
      ),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/parcels/parcel-uuid-3/state-history"),
      ),
    ).toBe(true);
  });

  it("treats parcel.isReturn as the only fully reliable terminal return signal", async () => {
    const creds = v2Creds();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/parcels/ZRV2-TRK-4")) {
        return json({
          id: "parcel-uuid-4",
          trackingNumber: "ZRV2-TRK-4",
          state: { name: "etat_invente_par_tenant", description: null },
          isReturn: true,
        });
      }
      if (url.endsWith("/parcels/parcel-uuid-4/state-history")) {
        return json([
          { newState: { name: "commande_recue", description: null }, createdAt: "2026-09-13T08:00:00Z" },
        ]);
      }
      throw new Error(`Unexpected ZR v2 request: ${url}`);
    });

    const tracking = await zrExpressAdapter.syncTracking("ZRV2-TRK-4", creds);
    expect(tracking.status).toBe("returned");
  });

  it("cancels through DELETE /parcels/bulk/by-tracking-number with idempotent 404 truth", async () => {
    const creds = v2Creds();
    fetchMock.mockResolvedValueOnce(json({ successCount: 1, failures: [] }));
    await expect(zrExpressAdapter.cancelShipment?.("ZRV2-TRK-5", creds)).resolves.toEqual({
      success: true,
      cancelled: true,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.zrexpress.app/api/v1/parcels/bulk/by-tracking-number");
    expect((init as RequestInit).method).toBe("DELETE");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      trackingNumbers: ["ZRV2-TRK-5"],
    });

    // Already gone at the carrier → idempotent success.
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));
    await expect(zrExpressAdapter.cancelShipment?.("ZRV2-TRK-5", creds)).resolves.toEqual({
      success: true,
      cancelled: true,
    });

    // A carrier-side refusal is a failure, never a silent reset.
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      json({ successCount: 0, failures: [{ errorMessage: "Parcel is already validated" }] }),
    );
    await expect(zrExpressAdapter.cancelShipment?.("ZRV2-TRK-5", creds)).resolves.toMatchObject({
      success: false,
      cancelled: false,
      error: expect.stringContaining("already validated"),
    });
  });

  it("reports honest fee unavailability — the extracted contract has no pricing endpoint", async () => {
    const estimate = await zrExpressAdapter.estimateCost(
      { wilaya: "Alger", weight: 1, codAmount: 2_500 },
      v2Creds(),
    );
    expect(estimate).toMatchObject({ provider: "zrexpress", cost: 0, available: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps legacy credentials on the Procolis dialect (no v2 headers)", async () => {
    fetchMock.mockResolvedValue(new Response("valid", { status: 200 }));
    const result = await zrExpressAdapter.testConnection?.({
      apiId: "legacy-token",
      apiKey: "legacy-key",
    });
    expect(result).toMatchObject({ ok: true });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://procolis.com/api_v1/token");
  });
});
