/**
 * INT-09: EcoTrack operation URLs are typed in by the seller. Before this fix
 * the adapter required HTTPS and one shared origin and nothing else, so
 * `https://localhost/...`, a LAN address or a cloud-metadata address was
 * accepted and the courier api_token was POSTed to it.
 *
 * These tests deliberately use only the global `fetch` stub: a blocked URL must
 * never reach the network layer at all, whatever transport sits behind it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ecoTrackAdapter } from "../ecotrack";

const mockFetch = vi.fn();

function credentials(base: string) {
  return {
    carrierName: "Courier Test",
    apiToken: "token-should-never-leave",
    userGuid: "guid",
    createOrderUrl: `${base}/create`,
    validateOrderUrl: `${base}/validate`,
    trackingsUrl: `${base}/api/public/get/trackings/info`,
    feesUrl: `${base}/fees`,
  };
}

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

const BLOCKED_BASES = [
  "https://localhost",
  "https://localhost.",
  "https://api.localhost",
  "https://127.0.0.1",
  "https://127.1",
  "https://2130706433",
  "https://[::1]",
  "https://[::ffff:127.0.0.1]",
  "https://10.1.2.3",
  "https://172.16.0.9",
  "https://192.168.0.10",
  "https://169.254.169.254",
  "https://[::ffff:169.254.169.254]",
  "https://100.64.0.1",
  "https://100.100.100.200",
  "https://198.18.0.1",
  "https://0.0.0.0",
  "https://224.0.0.1",
  "https://[fd00:ec2::254]",
  "https://printer.local",
  "https://metadata.google.internal",
  "https://intranet",
] as const;

describe("EcoTrack refuses seller URLs that point inside the machine or the LAN (INT-09)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(BLOCKED_BASES)("%s: the connection test sends nothing", async (base) => {
    const result = await ecoTrackAdapter.testConnection?.(credentials(base));
    expect(result?.ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each(BLOCKED_BASES)("%s: a fee estimate sends nothing", async (base) => {
    const result = await ecoTrackAdapter.estimateCost(
      { wilaya: "Alger", weight: 1, codAmount: 2000 },
      credentials(base),
    );
    expect(result.available).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each(BLOCKED_BASES)("%s: shipment creation sends nothing", async (base) => {
    const result = await ecoTrackAdapter.createShipment(shipment, credentials(base));
    expect(result.success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses a true-v1 create URL on loopback before the Bearer token is built into a request", async () => {
    const result = await ecoTrackAdapter.createShipment(shipment, {
      carrierName: "Courier Test",
      apiToken: "token-should-never-leave",
      createOrderUrl: "https://127.0.0.1/api/v1/create/order",
    });
    expect(result.success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not echo the blocked address or the token in the error it returns", async () => {
    const result = await ecoTrackAdapter.estimateCost(
      { wilaya: "Alger", weight: 1, codAmount: 2000 },
      credentials("https://169.254.169.254"),
    );
    const text = JSON.stringify(result);
    expect(text).not.toContain("169.254.169.254");
    expect(text).not.toContain("token-should-never-leave");
  });
});
