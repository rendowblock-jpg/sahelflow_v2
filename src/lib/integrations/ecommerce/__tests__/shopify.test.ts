/**
 * Shopify Admin REST API adapter tests (T-INTEGRATIONS).
 *
 * Covers: invalid creds, empty result, single page, multi-page (cursor
 * pagination via Link header), since_id watermark, 429 retry, HTTP error,
 * normalization (customer name/phone/address/items), maxPages cap.
 *
 * Mock-fetch pattern: vi.stubGlobal("fetch", mockFn). Headers are stubbed
 * with a simple { get } object so Link/Retry-After lookups work.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { shopifyAdapter } from "../shopify";
import type { ShopifyCredentials, NormalizedOrder } from "../types";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const creds: ShopifyCredentials = { shop: "acme-store", accessToken: "shpat_xxx" };

/** Build a mock Response-like object. */
function res(
  body: unknown,
  opts: { status?: number; ok?: boolean; headers?: Record<string, string | null> } = {},
) {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const headers = opts.headers ?? {};
  return {
    ok,
    status,
    headers: {
      get: (key: string) => headers[key] ?? null,
    },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

/** Sample Shopify order with all fields populated. */
function sampleOrder(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 1001,
    name: "#1001",
    order_number: 1001,
    total_price: "5000.00",
    currency: "DZD",
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-02T11:00:00Z",
    customer: {
      first_name: "Ahmed",
      last_name: "Benali",
      phone: "0555123456",
    },
    shipping_address: {
      first_name: "Ahmed",
      last_name: "Benali",
      phone: "0555999888",
      address1: "123 Rue Didouche",
      address2: "Apt 4",
      city: "Bab Ezzouar",
      province: "Alger",
      province_code: "16",
      zip: "16000",
      country: "Algeria",
    },
    line_items: [
      { title: "Widget A", name: "Widget A", quantity: 2, price: "2000.00", sku: "SKU-A" },
      { title: "Widget B", name: "Widget B - Small", quantity: 1, price: "1000.00", sku: null },
    ],
    financial_status: "paid",
    fulfillment_status: "fulfilled",
    cancel_reason: null,
    ...overrides,
  };
}

describe("Shopify adapter", () => {
  beforeEach(() => { mockFetch.mockReset(); vi.stubGlobal("fetch", mockFetch); });

  describe("metadata", () => {
    it("has platform + displayName", () => {
      expect(shopifyAdapter.platform).toBe("shopify");
      expect(shopifyAdapter.displayName).toBe("Shopify");
    });
  });

  describe("listOrdersSince", () => {
    it("throws on invalid (non-Shopify) credentials", async () => {
      await expect(
        shopifyAdapter.listOrdersSince(
          { siteUrl: "x", consumerKey: "k", consumerSecret: "s" } as never,
          "",
        ),
      ).rejects.toThrow("Invalid credentials for Shopify adapter");
    });

    it("returns empty list when API returns no orders", async () => {
      mockFetch.mockResolvedValueOnce(res({ orders: [] }));
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      // nextWatermark stays at "" when no orders
      expect(result.nextWatermark).toBe("");
    });

    it("fetches a single page and normalizes orders", async () => {
      mockFetch.mockResolvedValueOnce(
        res({ orders: [sampleOrder({ id: 1001 }), sampleOrder({ id: 1002, name: "#1002" })] }),
      );
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextWatermark).toBe("1002"); // max order id
    });

    it("sends X-Shopify-Access-Token header", async () => {
      mockFetch.mockResolvedValueOnce(res({ orders: [] }));
      await shopifyAdapter.listOrdersSince(creds, "");
      const opts = mockFetch.mock.calls[0]![1] as RequestInit;
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Shopify-Access-Token"]).toBe("shpat_xxx");
    });

    it("calls the correct admin REST endpoint with status=any + limit=250", async () => {
      mockFetch.mockResolvedValueOnce(res({ orders: [] }));
      await shopifyAdapter.listOrdersSince(creds, "");
      const url = String(mockFetch.mock.calls[0]![0]);
      expect(url).toContain("acme-store.myshopify.com");
      expect(url).toContain("/admin/api/");
      expect(url).toContain("/orders.json");
      expect(url).toContain("status=any");
      expect(url).toContain("limit=250");
    });

    it("appends since_id when watermark is provided", async () => {
      mockFetch.mockResolvedValueOnce(res({ orders: [] }));
      await shopifyAdapter.listOrdersSince(creds, "1000");
      const url = String(mockFetch.mock.calls[0]![0]);
      expect(url).toContain("since_id=1000");
    });

    it("follows cursor pagination via Link header (page_info)", async () => {
      // Page 1: returns 1 order + a Link header with next cursor
      mockFetch.mockResolvedValueOnce(
        res(
          { orders: [sampleOrder({ id: 1001 })] },
          {
            headers: {
              Link: '<https://acme-store.myshopify.com/admin/api/2026-01/orders.json?page_info=CURSOR123&limit=250>; rel="next"',
            },
          },
        ),
      );
      // Page 2: returns 1 order + no Link header
      mockFetch.mockResolvedValueOnce(
        res({ orders: [sampleOrder({ id: 1002, name: "#1002" })] }),
      );

      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextWatermark).toBe("1002");

      // Verify the second URL uses page_info (not since_id)
      const secondUrl = String(mockFetch.mock.calls[1]![0]);
      expect(secondUrl).toContain("page_info=CURSOR123");
      expect(secondUrl).not.toContain("since_id=");
    });

    it("sets hasMore=true when maxPages is hit before pagination ends", async () => {
      // Always return a Link header so pagination would continue
      mockFetch.mockImplementation(async () =>
        res(
          { orders: [sampleOrder({ id: 1001 })] },
          { headers: { Link: '<https://acme-store.myshopify.com/admin/api/2026-01/orders.json?page_info=abc&limit=250>; rel="next"' } },
        ),
      );

      const result = await shopifyAdapter.listOrdersSince(creds, "", 2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.hasMore).toBe(true);
    });

    it("retries on 429 then succeeds", async () => {
      mockFetch.mockResolvedValueOnce(res("rate limited", { status: 429, headers: { "Retry-After": "0" } }));
      mockFetch.mockResolvedValueOnce(res({ orders: [sampleOrder({ id: 1001 })] }));

      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does NOT consume a maxPages slot on 429 retry (I-M1)", async () => {
      // maxPages=1 + one 429 then success: the OLD code incremented `page` at
      // the top of the loop, so the 429 burned the only slot and the success
      // never happened (loop exited with page=1, no data). The new code only
      // increments page on success — 429 retries are free.
      mockFetch.mockResolvedValueOnce(res("rate limited", { status: 429, headers: { "Retry-After": "0" } }));
      mockFetch.mockResolvedValueOnce(res({ orders: [sampleOrder({ id: 1001 })] }));

      const result = await shopifyAdapter.listOrdersSince(creds, "", 1);
      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]!.sourceOrderId).toBe("1001");
      expect(result.nextWatermark).toBe("1001");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("still fetches the full maxPages quota when each page hits one 429 (I-M1)", async () => {
      // maxPages=2, each page: 1x 429 then 1x success. Old code would have
      // exited after page 1 (429 burned slot 1, success on slot 2 — but
      // maxPages=2 meant only 2 iterations, so only 1 page of real data).
      // New code: 2 successful pages of data, 2 429 retries on the side.
      mockFetch.mockResolvedValueOnce(res("rate limited", { status: 429, headers: { "Retry-After": "0" } }));
      mockFetch.mockResolvedValueOnce(
        res(
          { orders: [sampleOrder({ id: 1001 })] },
          { headers: { Link: '<https://acme-store.myshopify.com/admin/api/2026-01/orders.json?page_info=abc&limit=250>; rel="next"' } },
        ),
      );
      mockFetch.mockResolvedValueOnce(res("rate limited", { status: 429, headers: { "Retry-After": "0" } }));
      mockFetch.mockResolvedValueOnce(res({ orders: [sampleOrder({ id: 1002, name: "#1002" })] }));

      const result = await shopifyAdapter.listOrdersSince(creds, "", 2);
      expect(result.orders).toHaveLength(2);
      expect(result.orders.map((o) => o.sourceOrderId)).toEqual(["1001", "1002"]);
      expect(result.nextWatermark).toBe("1002");
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("throws after exceeding the 429 retry cap (I-M1)", async () => {
      // Always 429 → after MAX_429_RETRIES (3 retries = 4 total fetches)
      // the adapter gives up and throws.
      mockFetch.mockImplementation(async () =>
        res("rate limited", { status: 429, headers: { "Retry-After": "0" } }),
      );
      await expect(shopifyAdapter.listOrdersSince(creds, "", 5)).rejects.toThrow(/429.*rate limit/);
      // 1 initial attempt + 3 retries = 4 total fetch calls before throwing
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("throws on non-OK HTTP status (non-429)", async () => {
      mockFetch.mockResolvedValueOnce(res("Internal Server Error", { status: 500 }));
      await expect(shopifyAdapter.listOrdersSince(creds, "")).rejects.toThrow("Shopify API 500");
    });

    it("throws on 401 unauthorized", async () => {
      mockFetch.mockResolvedValueOnce(res("Unauthorized", { status: 401 }));
      await expect(shopifyAdapter.listOrdersSince(creds, "")).rejects.toThrow("401");
    });

    it("advances watermark to the highest order id seen", async () => {
      // Out-of-order ids to verify max() not last()
      mockFetch.mockResolvedValueOnce(
        res({ orders: [sampleOrder({ id: 5000 }), sampleOrder({ id: 100 }), sampleOrder({ id: 9999 })] }),
      );
      const result = await shopifyAdapter.listOrdersSince(creds, "100");
      expect(result.nextWatermark).toBe("9999");
    });
  });

  describe("order normalization", () => {
    it("extracts customer name from shipping_address (preferred over customer)", async () => {
      mockFetch.mockResolvedValueOnce(
        res({
          orders: [
            sampleOrder({
              customer: { first_name: "Wrong", last_name: "Name", phone: "000" },
              shipping_address: {
                first_name: "Right",
                last_name: "Name",
                phone: "0555111222",
                address1: "A",
                city: "C",
                province: "P",
              },
            }),
          ],
        }),
      );
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.customerName).toBe("Right Name");
      expect(result.orders[0]!.customerPhone).toBe("0555111222");
    });

    it("falls back to customer record when shipping_address is null", async () => {
      mockFetch.mockResolvedValueOnce(
        res({
          orders: [
            sampleOrder({
              shipping_address: null,
              customer: { first_name: "Fallback", last_name: "Customer", phone: "0555000000" },
            }),
          ],
        }),
      );
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.customerName).toBe("Fallback Customer");
      expect(result.orders[0]!.customerPhone).toBe("0555000000");
    });

    it("uses 'Client' when no name is available", async () => {
      mockFetch.mockResolvedValueOnce(
        res({
          orders: [
            sampleOrder({
              customer: null,
              shipping_address: { first_name: null, last_name: null, phone: null, address1: "A", city: "C", province: "P" },
            }),
          ],
        }),
      );
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.customerName).toBe("Client");
      expect(result.orders[0]!.customerPhone).toBe("");
    });

    it("joins address1 + address2 + zip with ', '", async () => {
      mockFetch.mockResolvedValueOnce(res({ orders: [sampleOrder()] }));
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.address).toBe("123 Rue Didouche, Apt 4, 16000");
    });

    it("falls back to 'Adresse non renseignée' when address is empty", async () => {
      mockFetch.mockResolvedValueOnce(
        res({
          orders: [
            sampleOrder({
              shipping_address: { first_name: "A", last_name: "B", phone: "05", address1: null, address2: null, zip: null, city: "C", province: "P" },
            }),
          ],
        }),
      );
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.address).toBe("Adresse non renseignée");
    });

    it("maps wilaya from province, commune from city", async () => {
      mockFetch.mockResolvedValueOnce(res({ orders: [sampleOrder()] }));
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.wilaya).toBe("Alger");
      expect(result.orders[0]!.commune).toBe("Bab Ezzouar");
    });

    it("falls back to province_code when province is null", async () => {
      mockFetch.mockResolvedValueOnce(
        res({
          orders: [
            sampleOrder({
              shipping_address: { first_name: "A", last_name: "B", phone: "05", address1: "X", city: "C", province: null, province_code: "31", zip: null },
            }),
          ],
        }),
      );
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.wilaya).toBe("31");
    });

    it("parses item prices as floats", async () => {
      mockFetch.mockResolvedValueOnce(res({ orders: [sampleOrder()] }));
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      const order = result.orders[0]!;
      expect(order.items).toHaveLength(2);
      expect(order.items[0]!.productName).toBe("Widget A");
      expect(order.items[0]!.quantity).toBe(2);
      expect(order.items[0]!.unitPrice).toBe(2000);
      expect(order.items[1]!.unitPrice).toBe(1000);
    });

    it("parses total_price as float", async () => {
      mockFetch.mockResolvedValueOnce(res({ orders: [sampleOrder()] }));
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.totalPrice).toBe(5000);
    });

    it("sets source='shopify' + includes sourceMetadata", async () => {
      mockFetch.mockResolvedValueOnce(res({ orders: [sampleOrder()] }));
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      const order = result.orders[0]!;
      expect(order.source).toBe("shopify");
      expect(order.sourceMetadata.shopifyOrderId).toBe(1001);
      expect(order.sourceMetadata.financialStatus).toBe("paid");
      expect(order.sourceMetadata.fulfillmentStatus).toBe("fulfilled");
      expect(order.sourceMetadata.currency).toBe("DZD");
      expect(order.createdAt).toBe("2026-01-02T10:00:00Z");
    });

    it("sourceOrderId is stringified id", async () => {
      mockFetch.mockResolvedValueOnce(res({ orders: [sampleOrder()] }));
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.sourceOrderId).toBe("1001");
    });

    it("handles invalid price strings gracefully (NaN → 0)", async () => {
      mockFetch.mockResolvedValueOnce(
        res({
          orders: [
            sampleOrder({
              total_price: "not a number",
              line_items: [{ title: "X", name: "X", quantity: 1, price: "also not", sku: null }],
            }),
          ],
        }),
      );
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.totalPrice).toBe(0);
      expect(result.orders[0]!.items[0]!.unitPrice).toBe(0);
    });
  });

  describe("multi-page normalization", () => {
    it("concats orders across pages in order", async () => {
      mockFetch.mockResolvedValueOnce(
        res(
          { orders: [sampleOrder({ id: 1, name: "#1" }), sampleOrder({ id: 2, name: "#2" })] },
          { headers: { Link: '<https://x.myshopify.com/admin/api/2026-01/orders.json?page_info=abc&limit=250>; rel="next"' } },
        ),
      );
      mockFetch.mockResolvedValueOnce(
        res({ orders: [sampleOrder({ id: 3, name: "#3" })] }),
      );
      const result = await shopifyAdapter.listOrdersSince(creds, "");
      expect(result.orders.map((o: NormalizedOrder) => o.orderNumber)).toEqual(["#1", "#2", "#3"]);
      expect(result.nextWatermark).toBe("3");
    });
  });
});
