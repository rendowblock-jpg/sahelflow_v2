import { afterEach, describe, expect, it, vi } from "vitest";

import { shopifyAdapter } from "../shopify";
import { woocommerceAdapter } from "../woocommerce";
import { youcanAdapter } from "../youcan";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("commerce page cursor contract", () => {
  it("returns and consumes Shopify page_info without advancing from an incomplete page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            orders: [
              {
                id: 1,
                name: "#1",
                order_number: 1,
                total_price: "10",
                currency: "DZD",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-02T00:00:00Z",
                customer: null,
                shipping_address: null,
                line_items: [],
                financial_status: "pending",
                fulfillment_status: null,
                cancel_reason: null,
              },
            ],
          }),
          {
            status: 200,
            headers: {
              Link: '<https://demo.myshopify.com/admin/api/2026-01/orders.json?page_info=cursor-2>; rel="next"',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ orders: [] }), { status: 200 }),
      );
    global.fetch = fetchMock as typeof fetch;

    const first = await shopifyAdapter.fetchOrderPage(
      { shop: "demo", accessToken: "token" },
      { watermark: "2026-01-01T00:00:00Z" },
    );
    expect(first.nextCursor).toBe("cursor-2");
    expect(first.candidateWatermark).toBe("2026-01-02T00:00:00Z");

    await shopifyAdapter.fetchOrderPage(
      { shop: "demo", accessToken: "token" },
      { watermark: first.candidateWatermark, cursor: first.nextCursor },
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "page_info=cursor-2",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain(
      "updated_at_min",
    );
  });

  it("uses the persisted WooCommerce page cursor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "X-WP-TotalPages": "3" },
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    await woocommerceAdapter.fetchOrderPage(
      {
        siteUrl: "https://shop.example.com",
        consumerKey: "key",
        consumerSecret: "secret",
      },
      { watermark: "2026-01-01T00:00:00Z", cursor: "3" },
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("page=3");
  });

  it("uses the persisted YouCan page cursor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          meta: {
            pagination: {
              total: 0,
              count: 0,
              per_page: 100,
              current_page: 4,
              total_pages: 4,
              links: { next: null },
            },
          },
        }),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    await youcanAdapter.fetchOrderPage(
      { accessToken: "token" },
      { watermark: "", cursor: "4" },
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("page=4");
  });
});
