/**
 * WooCommerce REST API v3 adapter tests (T-INTEGRATIONS).
 *
 * Covers: invalid creds, SSRF validation (localhost/private IPs/non-HTTP),
 * empty result, single page, multi-page pagination (X-WP-TotalPages),
 * modified_after watermark, 429 retry, HTTP error, normalization
 * (customer name/phone/wilaya/items), maxPages cap, basic auth header.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { woocommerceAdapter } from "../woocommerce";
import type { WooCommerceCredentials } from "../types";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const creds: WooCommerceCredentials = {
  siteUrl: "https://example.com",
  consumerKey: "ck_xxx",
  consumerSecret: "cs_xxx",
};

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
    headers: { get: (key: string) => headers[key] ?? null },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function sampleOrder(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 2001,
    number: "2001",
    status: "processing",
    total: "5000.00",
    currency: "DZD",
    date_created: "2026-01-02T10:00:00",
    date_created_gmt: "2026-01-02T10:00:00",
    date_modified: "2026-01-02T11:00:00",
    date_modified_gmt: "2026-01-02T11:00:00",
    billing: {
      first_name: "Ahmed",
      last_name: "Benali",
      phone: "0555123456",
      address_1: "123 Rue Didouche",
      address_2: "Apt 4",
      city: "Bab Ezzouar",
      state: "Alger",
      postcode: "16000",
      country: "DZ",
      email: "ahmed@example.com",
    },
    shipping: {
      first_name: "Ahmed",
      last_name: "Benali",
      address_1: "456 Rue Test",
      address_2: "",
      city: "Hydra",
      state: "Alger",
      postcode: "16000",
      country: "DZ",
    },
    line_items: [
      { name: "Widget A", product_id: 1, quantity: 2, price: "2000.00", total: "4000.00", sku: "A" },
      { name: "Widget B", product_id: 2, quantity: 1, price: 1000, total: "1000.00", sku: "B" },
    ],
    payment_method: "cod",
    payment_method_title: "Cash on delivery",
    ...overrides,
  };
}

describe("WooCommerce adapter", () => {
  beforeEach(() => { mockFetch.mockReset(); vi.stubGlobal("fetch", mockFetch); });

  describe("metadata", () => {
    it("has platform + displayName", () => {
      expect(woocommerceAdapter.platform).toBe("woocommerce");
      expect(woocommerceAdapter.displayName).toBe("WooCommerce");
    });
  });

  describe("listOrdersSince — input validation", () => {
    it("throws on invalid (non-WooCommerce) credentials", async () => {
      await expect(
        woocommerceAdapter.listOrdersSince(
          { shop: "x", accessToken: "y" } as never,
          "",
        ),
      ).rejects.toThrow("Invalid credentials for WooCommerce adapter");
    });

    it("rejects localhost site URLs (SSRF guard)", async () => {
      await expect(
        woocommerceAdapter.listOrdersSince(
          { ...creds, siteUrl: "http://localhost:8080" },
          "",
        ),
      ).rejects.toThrow("localhost");
    });

    it("rejects 127.0.0.1 site URLs (SSRF guard)", async () => {
      await expect(
        woocommerceAdapter.listOrdersSince(
          { ...creds, siteUrl: "http://127.0.0.1" },
          "",
        ),
      ).rejects.toThrow("localhost");
    });

    it("rejects private 10.x IP addresses (SSRF guard)", async () => {
      await expect(
        woocommerceAdapter.listOrdersSince(
          { ...creds, siteUrl: "http://10.0.0.1" },
          "",
        ),
      ).rejects.toThrow("private");
    });

    it("rejects private 192.168.x IP addresses (SSRF guard)", async () => {
      await expect(
        woocommerceAdapter.listOrdersSince(
          { ...creds, siteUrl: "https://192.168.1.1" },
          "",
        ),
      ).rejects.toThrow("private");
    });

    it("rejects link-local 169.254.x IP addresses (SSRF guard)", async () => {
      await expect(
        woocommerceAdapter.listOrdersSince(
          { ...creds, siteUrl: "http://169.254.169.254" },
          "",
        ),
      ).rejects.toThrow("private");
    });

    it("rejects non-HTTP protocols (SSRF guard)", async () => {
      await expect(
        woocommerceAdapter.listOrdersSince(
          { ...creds, siteUrl: "ftp://example.com" },
          "",
        ),
      ).rejects.toThrow("protocol");
    });

    it("rejects malformed URLs", async () => {
      await expect(
        woocommerceAdapter.listOrdersSince(
          { ...creds, siteUrl: "not a url" },
          "",
        ),
      ).rejects.toThrow("not a valid URL");
    });
  });

  describe("listOrdersSince — happy path", () => {
    it("returns empty list when API returns []", async () => {
      mockFetch.mockResolvedValueOnce(res([], { headers: { "X-WP-TotalPages": "1" } }));
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextWatermark).toBe("");
    });

    it("fetches a single page and normalizes orders", async () => {
      mockFetch.mockResolvedValueOnce(
        res([sampleOrder({ id: 2001 }), sampleOrder({ id: 2002, number: "2002" })], {
          headers: { "X-WP-TotalPages": "1" },
        }),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextWatermark).toBe("2026-01-02T11:00:00");
    });

    it("sends Basic auth header (base64 of key:secret)", async () => {
      mockFetch.mockResolvedValueOnce(res([], { headers: { "X-WP-TotalPages": "1" } }));
      await woocommerceAdapter.listOrdersSince(creds, "");
      const opts = mockFetch.mock.calls[0]![1] as RequestInit;
      const headers = opts.headers as Record<string, string>;
      const expected = "Basic " + Buffer.from("ck_xxx:cs_xxx").toString("base64");
      expect(headers.Authorization).toBe(expected);
    });

    it("calls /wp-json/wc/v3/orders with per_page=100 + status=any + orderby=modified", async () => {
      mockFetch.mockResolvedValueOnce(res([], { headers: { "X-WP-TotalPages": "1" } }));
      await woocommerceAdapter.listOrdersSince(creds, "");
      const url = String(mockFetch.mock.calls[0]![0]);
      expect(url).toContain("example.com/wp-json/wc/v3/orders");
      expect(url).toContain("per_page=100");
      expect(url).toContain("status=any");
      expect(url).toContain("orderby=modified");
      expect(url).toContain("order=asc");
    });

    it("appends modified_after + dates_are_gmt when watermark is set", async () => {
      mockFetch.mockResolvedValueOnce(res([], { headers: { "X-WP-TotalPages": "1" } }));
      await woocommerceAdapter.listOrdersSince(creds, "2026-01-01T00:00:00");
      const url = String(mockFetch.mock.calls[0]![0]);
      expect(url).toContain("modified_after=2026-01-01T00%3A00%3A00");
      expect(url).toContain("dates_are_gmt=true");
    });
  });

  describe("listOrdersSince — pagination", () => {
    it("follows X-WP-TotalPages > 1 (page-based)", async () => {
      // Page 1: full page (100 items) — X-WP-TotalPages=2
      const page1 = Array.from({ length: 100 }, (_, i) =>
        sampleOrder({ id: 1000 + i, number: String(1000 + i) }),
      );
      mockFetch.mockResolvedValueOnce(res(page1, { headers: { "X-WP-TotalPages": "2" } }));
      mockFetch.mockResolvedValueOnce(
        res([sampleOrder({ id: 2000, number: "2000" })], { headers: { "X-WP-TotalPages": "2" } }),
      );

      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(101);
      expect(result.hasMore).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify page=2 was used in the second URL
      const secondUrl = String(mockFetch.mock.calls[1]![0]);
      expect(secondUrl).toContain("page=2");
    });

    it("stops when a page returns less than PAGE_SIZE", async () => {
      mockFetch.mockResolvedValueOnce(
        res([sampleOrder({ id: 1 })], { headers: { "X-WP-TotalPages": "5" } }),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.hasMore).toBe(false);
    });

    it("stops when X-WP-TotalPages is 1 even if page is full", async () => {
      const page1 = Array.from({ length: 100 }, (_, i) =>
        sampleOrder({ id: 1000 + i, number: String(1000 + i) }),
      );
      mockFetch.mockResolvedValueOnce(res(page1, { headers: { "X-WP-TotalPages": "1" } }));
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(100);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.hasMore).toBe(false);
    });

    it("respects maxPages cap and sets hasMore=true", async () => {
      // Always returns a full page + TotalPages=10
      const page = Array.from({ length: 100 }, (_, i) =>
        sampleOrder({ id: 1000 + i, number: String(1000 + i) }),
      );
      mockFetch.mockImplementation(async () =>
        res(page, { headers: { "X-WP-TotalPages": "10" } }),
      );

      const result = await woocommerceAdapter.listOrdersSince(creds, "", 2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.hasMore).toBe(true);
    });
  });

  describe("listOrdersSince — error handling", () => {
    it("retries on 429 then succeeds", async () => {
      mockFetch.mockResolvedValueOnce(res("rate limited", { status: 429, headers: { "Retry-After": "0" } }));
      mockFetch.mockResolvedValueOnce(res([], { headers: { "X-WP-TotalPages": "1" } }));
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(0);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("W3-7: caps 429 retries at 5 then throws (infinite-loop guard)", async () => {
      // Mock a permanently-429'ing host (no Retry-After → exponential
      // backoff path). Without the cap, this loop would run forever.
      mockFetch.mockResolvedValue(
        res("rate limited", { status: 429 }),
      );

      // Speed up the test by stubbing setTimeout to resolve immediately.
      vi.spyOn(global, "setTimeout").mockImplementation((cb: TimerHandler) => {
        // Fire the timer synchronously so the test doesn't take ~62s.
        queueMicrotask(() => (cb as () => void)());
        return 0 as unknown as NodeJS.Timeout;
      });

      try {
        await expect(
          woocommerceAdapter.listOrdersSince(creds, ""),
        ).rejects.toThrow(/rate-limited.*429.*after 5 retries/);
        // 1 initial attempt + 5 retries = 6 total fetch calls before the throw.
        expect(mockFetch).toHaveBeenCalledTimes(6);
      } finally {
        vi.restoreAllMocks();
      }
    });

    it("W3-7: resets the per-page retry counter after a successful page", async () => {
      // Page 1: 429 once, then success (full 100-item page → advances).
      // Page 2: 429 once, then success. Without the per-page reset, the
      // second 429 would be retry #2 of the SAME counter and the cap (5)
      // would be hit prematurely across pages.
      const fullPage = Array.from({ length: 100 }, (_, i) =>
        sampleOrder({ id: 1000 + i, number: String(1000 + i) }),
      );
      mockFetch.mockResolvedValueOnce(res("rate limited", { status: 429, headers: { "Retry-After": "0" } }));
      mockFetch.mockResolvedValueOnce(res(fullPage, { headers: { "X-WP-TotalPages": "2" } }));
      mockFetch.mockResolvedValueOnce(res("rate limited", { status: 429, headers: { "Retry-After": "0" } }));
      mockFetch.mockResolvedValueOnce(res([sampleOrder({ id: 2002, number: "2002" })], { headers: { "X-WP-TotalPages": "2" } }));

      const result = await woocommerceAdapter.listOrdersSince(creds, "", 2);
      expect(result.orders).toHaveLength(101); // 100 + 1
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("throws on non-OK HTTP status", async () => {
      mockFetch.mockResolvedValueOnce(res("Server error", { status: 500 }));
      await expect(woocommerceAdapter.listOrdersSince(creds, "")).rejects.toThrow("WooCommerce API 500");
    });

    it("throws on 401 unauthorized", async () => {
      mockFetch.mockResolvedValueOnce(res("Unauthorized", { status: 401 }));
      await expect(woocommerceAdapter.listOrdersSince(creds, "")).rejects.toThrow("401");
    });

    it("returns empty orders when response is not an array (malformed)", async () => {
      // The adapter guards with `!Array.isArray(data) || data.length === 0`
      // and breaks out of the pagination loop, returning an empty result
      // (it does NOT throw on a non-array response).
      mockFetch.mockResolvedValueOnce(
        res({ not: "an array" }, { headers: { "X-WP-TotalPages": "1" } }),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.orders).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  describe("listOrdersSince — watermark advancement", () => {
    it("advances to the latest date_modified_gmt across multiple orders", async () => {
      mockFetch.mockResolvedValueOnce(
        res(
          [
            sampleOrder({ id: 1, date_modified_gmt: "2026-01-01T00:00:00" }),
            sampleOrder({ id: 2, date_modified_gmt: "2026-02-01T00:00:00" }),
            sampleOrder({ id: 3, date_modified_gmt: "2026-01-15T00:00:00" }),
          ],
          { headers: { "X-WP-TotalPages": "1" } },
        ),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.nextWatermark).toBe("2026-02-01T00:00:00");
    });
  });

  describe("order normalization", () => {
    it("extracts customer name from billing", async () => {
      mockFetch.mockResolvedValueOnce(
        res([sampleOrder()], { headers: { "X-WP-TotalPages": "1" } }),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.customerName).toBe("Ahmed Benali");
    });

    it("uses billing phone (shipping has no phone)", async () => {
      mockFetch.mockResolvedValueOnce(
        res([sampleOrder()], { headers: { "X-WP-TotalPages": "1" } }),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.customerPhone).toBe("0555123456");
    });

    it("uses shipping address for delivery (preferred over billing)", async () => {
      mockFetch.mockResolvedValueOnce(
        res([sampleOrder()], { headers: { "X-WP-TotalPages": "1" } }),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      // shipping address_1 = "456 Rue Test"
      expect(result.orders[0]!.address).toContain("456 Rue Test");
      // shipping city = "Hydra"
      expect(result.orders[0]!.commune).toBe("Hydra");
    });

    it("falls back to billing state/city when shipping is empty", async () => {
      // The adapter uses `s.state ?? b.state ?? null`. The `??` operator only
      // falls back on null/undefined (NOT empty string), so we use `null` for
      // shipping.state/city to exercise the billing fallback.
      mockFetch.mockResolvedValueOnce(
        res(
          [
            sampleOrder({
              shipping: { first_name: "A", last_name: "B", address_1: "", address_2: "", city: null as unknown as string, state: null as unknown as string, postcode: "", country: "DZ" },
            }),
          ],
          { headers: { "X-WP-TotalPages": "1" } },
        ),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.wilaya).toBe("Alger"); // billing state
      expect(result.orders[0]!.commune).toBe("Bab Ezzouar"); // billing city
    });

    it("uses 'Client' when billing name is empty", async () => {
      mockFetch.mockResolvedValueOnce(
        res(
          [
            sampleOrder({
              billing: { first_name: "", last_name: "", phone: "05", address_1: "A", city: "C", state: "S", postcode: "", country: "DZ", email: "e" },
            }),
          ],
          { headers: { "X-WP-TotalPages": "1" } },
        ),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.customerName).toBe("Client");
    });

    it("joins shipping address_1 + address_2 + postcode", async () => {
      mockFetch.mockResolvedValueOnce(
        res([sampleOrder()], { headers: { "X-WP-TotalPages": "1" } }),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      // shipping: address_1="456 Rue Test", address_2="", postcode="16000"
      // → "456 Rue Test, 16000" (address_2 is empty so filtered out)
      expect(result.orders[0]!.address).toBe("456 Rue Test, 16000");
    });

    it("handles both string and numeric item prices", async () => {
      mockFetch.mockResolvedValueOnce(
        res([sampleOrder()], { headers: { "X-WP-TotalPages": "1" } }),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      const order = result.orders[0]!;
      expect(order.items).toHaveLength(2);
      expect(order.items[0]!.unitPrice).toBe(2000); // string "2000.00"
      expect(order.items[1]!.unitPrice).toBe(1000); // number 1000
    });

    it("parses total as float", async () => {
      mockFetch.mockResolvedValueOnce(
        res([sampleOrder()], { headers: { "X-WP-TotalPages": "1" } }),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.totalPrice).toBe(5000);
    });

    it("sets source='woocommerce' + includes sourceMetadata", async () => {
      mockFetch.mockResolvedValueOnce(
        res([sampleOrder()], { headers: { "X-WP-TotalPages": "1" } }),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      const order = result.orders[0]!;
      expect(order.source).toBe("woocommerce");
      expect(order.sourceMetadata.wooOrderId).toBe(2001);
      expect(order.sourceMetadata.wooStatus).toBe("processing");
      expect(order.sourceMetadata.paymentMethod).toBe("cod");
      expect(order.sourceMetadata.currency).toBe("DZD");
      expect(order.createdAt).toBe("2026-01-02T10:00:00");
    });

    it("falls back to id when number is empty", async () => {
      mockFetch.mockResolvedValueOnce(
        res([sampleOrder({ number: "" })], { headers: { "X-WP-TotalPages": "1" } }),
      );
      const result = await woocommerceAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.orderNumber).toBe("2001"); // falls back to String(id)
    });
  });
});
