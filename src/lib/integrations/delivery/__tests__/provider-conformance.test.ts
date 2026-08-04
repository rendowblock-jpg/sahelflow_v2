import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShipmentRequest } from "../types";
import { maystroAdapter } from "../maystro";
import { yalidineAdapter } from "../yalidine";
import { zrExpressAdapter } from "../zr-express";

const fetchMock = vi.fn();

const shipment: ShipmentRequest = {
  orderId: "order-conformance-1",
  orderNumber: "ORDER-CONFORMANCE-1",
  customer: {
    name: "Client Conformance",
    phone: "+213 555-12-34-56",
    wilaya: "Alger",
    commune: "Hydra Conformance",
    address: "1 rue de la Conformance",
  },
  items: [{ name: "Widget Conformance", quantity: 2, unitPrice: 1_000 }],
  totalPrice: 2_500,
  weight: 1.5,
  notes: "Handle carefully",
};

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
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

describe("courier provider deterministic conformance", () => {
  it("executes the Yalidine credential, pricing, booking and tracking contract", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/wilayas/")) return json([]);
      if (url.includes("/communes/")) {
        return json([{ _id: 16001, name: "Hydra Conformance" }]);
      }
      if (url.includes("/deliveryfees/")) {
        return json([
          {
            wilaya_name: "Alger",
            home_delivery: 700,
            stopdesk_delivery: 450,
          },
        ]);
      }
      if (url.endsWith("/parcels/") && init?.method === "POST") {
        return json([
          {
            tracking_id: "YAL-CONFORMANCE-1",
            label: "https://labels.example/YAL-CONFORMANCE-1.pdf",
            parcel_status: "Créé",
          },
        ]);
      }
      if (url.includes("/parcels/YAL-CONFORMANCE-1/")) {
        return json([
          {
            parcel_status: "Non livré",
            delivery_date: "2026-08-08",
          },
        ]);
      }
      if (url.includes("/histories/")) {
        return json([
          {
            status: "Créé",
            date: "2026-08-04T08:00:00Z",
            place: "Alger",
          },
          {
            status: "Non livré",
            date: "2026-08-05T08:00:00Z",
            place: "Hydra",
            remark: "Client unavailable",
          },
        ]);
      }
      throw new Error(`Unexpected Yalidine request: ${url}`);
    });

    const credentials = { apiId: "yal-id", apiToken: "yal-token" };
    await expect(yalidineAdapter.testConnection?.(credentials)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      yalidineAdapter.estimateCost(
        { wilaya: "Alger", weight: 1.5, codAmount: 2_500 },
        credentials,
      ),
    ).resolves.toEqual({
      provider: "yalidine",
      cost: 700,
      available: true,
      estimatedDays: "2-5 jours",
    });

    const created = await yalidineAdapter.createShipment(shipment, credentials);
    expect(created).toMatchObject({
      success: true,
      trackingId: "YAL-CONFORMANCE-1",
      cost: 700,
    });
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith("/parcels/") && init?.method === "POST",
    );
    expect(createCall).toBeTruthy();
    const createInit = createCall?.[1] as RequestInit;
    expect(createInit.headers).toMatchObject({
      "X-API-ID": "yal-id",
      "X-API-TOKEN": "yal-token",
    });
    expect(JSON.parse(String(createInit.body))).toEqual([
      expect.objectContaining({
        order_id: "ORDER-CONFORMANCE-1",
        firstname: "Client Conformance",
        commune: 16001,
        phone: "+213 555-12-34-56",
        price: 2_500,
        product: "Widget Conformance x2",
      }),
    ]);

    const tracking = await yalidineAdapter.syncTracking(
      "YAL-CONFORMANCE-1",
      credentials,
    );
    expect(tracking.status).toBe("failed");
    expect(tracking.events.map((event) => event.status)).toEqual([
      "failed",
      "created",
    ]);
    expect(tracking.estimatedDelivery).toBe("2026-08-08");
  });

  it("executes the Maystro token, catalog, pricing, booking, tracking and cancellation contract", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/shared/wilayas/")) return json([[16, "Alger"]]);
      if (url.includes("/shared/communes/")) {
        return json([{ id: 16002, name: "Hydra Conformance" }]);
      }
      if (url.includes("/stores/product/?search=")) {
        return json({
          results: [{ id: "product-conformance", name: "Widget Conformance" }],
        });
      }
      if (url.includes("/stores/delivery_price/")) {
        return json({ delivery_price: 650 });
      }
      if (url.endsWith("/stores/orders/") && init?.method === "POST") {
        return json({
          id: "maystro-order-uuid",
          display_id: "MAY-CONFORMANCE-1",
          status: 4,
        });
      }
      if (url.includes("/stores/orders/?display_id=MAY-CONFORMANCE-1")) {
        return json({ results: [{ id: "maystro-order-uuid", status: 41 }] });
      }
      if (url.includes("/stores/history_order/maystro-order-uuid")) {
        return json([
          {
            status: 4,
            created_at: "2026-08-04T08:00:00Z",
            comment: "Created",
          },
          {
            status: 41,
            created_at: "2026-08-05T08:00:00Z",
            comment: "Delivered",
          },
        ]);
      }
      if (url.includes("/shared/status/maystro-order-uuid/") && init?.method === "PATCH") {
        return json({ success: true });
      }
      throw new Error(`Unexpected Maystro request: ${url}`);
    });

    const credentials = { apiToken: "maystro-token" };
    await expect(maystroAdapter.testConnection?.(credentials)).resolves.toMatchObject({
      ok: true,
    });

    const created = await maystroAdapter.createShipment(shipment, credentials);
    expect(created).toMatchObject({
      success: true,
      trackingId: "MAY-CONFORMANCE-1",
      cost: 650,
    });
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith("/stores/orders/") && init?.method === "POST",
    );
    expect(createCall).toBeTruthy();
    const createInit = createCall?.[1] as RequestInit;
    expect(createInit.headers).toMatchObject({
      Authorization: "Token maystro-token",
    });
    expect(JSON.parse(String(createInit.body))).toMatchObject({
      external_order_id: "ORDER-CONFORMANCE-1",
      wilaya: 16,
      commune: 16002,
      customer_phone: "+213 555-12-34-56",
      product_price: 2_500,
      products: [
        {
          product_id: "product-conformance",
          quantity: 2,
          logistical_description: "Widget Conformance",
        },
      ],
    });

    const tracking = await maystroAdapter.syncTracking(
      "MAY-CONFORMANCE-1",
      credentials,
    );
    expect(tracking.status).toBe("delivered");
    expect(tracking.events.map((event) => event.status)).toEqual([
      "created",
      "delivered",
    ]);

    await expect(
      maystroAdapter.cancelShipment?.("MAY-CONFORMANCE-1", credentials),
    ).resolves.toEqual({ success: true });
    const cancelCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/shared/status/maystro-order-uuid/") &&
        init?.method === "PATCH",
    );
    expect(JSON.parse(String((cancelCall?.[1] as RequestInit).body))).toEqual({
      status: 50,
      abort_reason: 21,
    });
  });

  it("executes the legacy ZR/Procolis credential, price, booking and tracking contract", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/token")) return new Response("valid", { status: 200 });
      if (url.endsWith("/tarification") && init?.method === "POST") {
        return json([
          {
            IDWilaya: "16",
            TarifLivraison: 600,
            TarifStopDesk: 400,
          },
        ]);
      }
      if (url.endsWith("/add_colis") && init?.method === "POST") {
        return json({
          Colis: [
            {
              MessageRetour: "Good",
              Tracking: "SF-ORDER-CONFORMANCE-1",
            },
          ],
        });
      }
      if (url.endsWith("/lire") && init?.method === "POST") {
        return json({
          Colis: [
            {
              Tracking: "SF-ORDER-CONFORMANCE-1",
              situation: "Non livré",
            },
          ],
        });
      }
      throw new Error(`Unexpected ZR request: ${url}`);
    });

    const credentials = { apiId: "zr-token", apiKey: "zr-key" };
    await expect(zrExpressAdapter.testConnection?.(credentials)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      zrExpressAdapter.estimateCost(
        { wilaya: "Alger", weight: 1.5, codAmount: 2_500 },
        credentials,
      ),
    ).resolves.toEqual({ provider: "zrexpress", cost: 600, available: true });

    const created = await zrExpressAdapter.createShipment(shipment, credentials);
    expect(created).toEqual({
      success: true,
      trackingId: "SF-ORDER-CONFORMANCE-1",
      cost: 600,
    });
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith("/add_colis") && init?.method === "POST",
    );
    expect(createCall).toBeTruthy();
    expect((createCall?.[1] as RequestInit).headers).toMatchObject({
      token: "zr-token",
      key: "zr-key",
    });
    expect(JSON.parse(String((createCall?.[1] as RequestInit).body))).toEqual({
      Colis: [
        expect.objectContaining({
          Tracking: "SF-ORDER-CONFORMANCE-1",
          Client: "Client Conformance",
          MobileA: "0555123456",
          IDWilaya: "16",
          Commune: "Hydra Conformance",
          Total: 2_500,
          TProduit: "2x Widget Conformance",
          id_Externe: "ORDER-CONFORMANCE-1",
        }),
      ],
    });

    const tracking = await zrExpressAdapter.syncTracking(
      "SF-ORDER-CONFORMANCE-1",
      credentials,
    );
    expect(tracking.status).toBe("failed");

    await expect(
      zrExpressAdapter.cancelShipment?.("SF-ORDER-CONFORMANCE-1", credentials),
    ).resolves.toMatchObject({
      success: false,
      cancelled: false,
      action: "open_dashboard",
      dashboardUrl: expect.stringMatching(/^https:\/\//),
    });
  });

  it("never includes provider secrets in ordinary failure results", async () => {
    fetchMock.mockResolvedValue(new Response("denied", { status: 401 }));

    const yalidine = await yalidineAdapter.estimateCost(
      { wilaya: "Alger", weight: 1, codAmount: 1_000 },
      { apiId: "secret-id", apiToken: "secret-token" },
    );
    const maystro = await maystroAdapter.estimateCost(
      {
        wilaya: "Unknown Conformance Wilaya",
        commune: "Unknown Commune",
        weight: 1,
        codAmount: 1_000,
      },
      { apiToken: "secret-maystro" },
    );
    const zr = await zrExpressAdapter.estimateCost(
      { wilaya: "Unknown Wilaya", weight: 1, codAmount: 1_000 },
      { apiId: "secret-zr-id", apiKey: "secret-zr-key" },
    );

    const serialized = JSON.stringify([yalidine, maystro, zr]);
    expect(serialized).not.toContain("secret-id");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("secret-maystro");
    expect(serialized).not.toContain("secret-zr-id");
    expect(serialized).not.toContain("secret-zr-key");
  });
});
