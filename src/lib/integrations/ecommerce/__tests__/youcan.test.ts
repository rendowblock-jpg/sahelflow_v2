/**
 * YouCan Store Admin API adapter tests (T-INTEGRATIONS).
 *
 * Covers: invalid creds, empty result, single page, multi-page pagination
 * (meta.pagination.links.next), 429 retry, HTTP error, normalization
 * (customer name/phone/wilaya/items from shipping address), UUID sourceOrderId,
 * maxPages cap, Bearer auth header.
 *
 * YouCan-specific gotchas tested:
 *   - Order ID is a UUID string (not monotonic) → dedup by sourceOrderId
 *   - shipping.address can be an empty array if `include=shipping` not passed
 *   - YouCan has no updated_at_min server-side filter → every sync re-fetches
 *     ALL orders and the sync-engine dedup handles duplicates (fix-B5). The
 *     watermark is informational only — it does NOT filter server-side.
 *   - Updated/cancelled orders ARE re-fetched (the previous created_at
 *     short-circuit silently dropped them — fix-B5 / dive-5 data-loss bug).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { youcanAdapter } from "../youcan";
import type { YouCanCredentials } from "../types";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const creds: YouCanCredentials = { accessToken: "yc-token-abc" };

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
    id: "ord-uuid-0001",
    ref: "ORD-1001",
    total: 5000,
    currency: "DZD",
    status: 1,
    status_new: "new",
    payment_status: 0,
    payment_status_new: "unpaid",
    shipping_status: "pending",
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-02T11:00:00Z",
    payment: { gateway_type_text: "cod" },
    shipping: {
      status_text: "Pending",
      price: 400,
      tracking_number: "YC-TRACK-001",
      address: {
        first_name: "Ahmed",
        last_name: "Benali",
        full_name: "Ahmed Benali",
        first_line: "123 Rue Didouche",
        second_line: "Apt 4",
        phone: "0555123456",
        city: "Bab Ezzouar",
        region: "Alger",
        state: null,
        zip_code: "16000",
        country_code: "DZ",
      },
    },
    variants: [
      {
        price: 2000,
        quantity: 2,
        variant: { product: { name: "Widget A" } },
      },
      {
        price: 1000,
        quantity: 1,
        variant: { product: { name: "Widget B" } },
      },
    ],
    ...overrides,
  };
}

function youcanResponse(orders: Record<string, unknown>[], nextLink: string | null = null) {
  return {
    data: orders,
    meta: {
      pagination: {
        total: orders.length,
        count: orders.length,
        per_page: 100,
        current_page: 1,
        total_pages: nextLink ? 2 : 1,
        links: { next: nextLink },
      },
    },
  };
}

describe("YouCan adapter", () => {
  beforeEach(() => { mockFetch.mockReset(); vi.stubGlobal("fetch", mockFetch); });

  describe("metadata", () => {
    it("has platform + displayName", () => {
      expect(youcanAdapter.platform).toBe("youcan");
      expect(youcanAdapter.displayName).toBe("YouCan");
    });
  });

  describe("listOrdersSince — input validation", () => {
    it("throws on Shopify-shaped credentials", async () => {
      await expect(
        youcanAdapter.listOrdersSince({ shop: "x", accessToken: "y" } as never, ""),
      ).rejects.toThrow("Invalid credentials for YouCan adapter");
    });

    it("throws on WooCommerce-shaped credentials", async () => {
      await expect(
        youcanAdapter.listOrdersSince(
          { siteUrl: "x", consumerKey: "k", consumerSecret: "s" } as never,
          "",
        ),
      ).rejects.toThrow("Invalid credentials for YouCan adapter");
    });
  });

  describe("listOrdersSince — happy path", () => {
    it("returns empty list when API returns empty data", async () => {
      mockFetch.mockResolvedValueOnce(res(youcanResponse([])));
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextWatermark).toBe("");
    });

    it("fetches a single page and normalizes orders", async () => {
      mockFetch.mockResolvedValueOnce(
        res(youcanResponse([sampleOrder(), sampleOrder({ id: "ord-uuid-0002", ref: "ORD-1002" })])),
      );
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      // nextWatermark is the latest updated_at across fetched orders
      expect(result.nextWatermark).toBe("2026-01-02T11:00:00Z");
    });

    it("sends Authorization: Bearer <token> header", async () => {
      mockFetch.mockResolvedValueOnce(res(youcanResponse([])));
      await youcanAdapter.listOrdersSince(creds, "");
      const opts = mockFetch.mock.calls[0]![1] as RequestInit;
      const headers = opts.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer yc-token-abc");
    });

    it("calls /orders with limit + page + sort + include params", async () => {
      mockFetch.mockResolvedValueOnce(res(youcanResponse([])));
      await youcanAdapter.listOrdersSince(creds, "");
      const url = String(mockFetch.mock.calls[0]![0]);
      expect(url).toContain("api.youcan.shop/orders");
      expect(url).toContain("limit=100");
      expect(url).toContain("page=1");
      expect(url).toContain("sort_field=created_at");
      expect(url).toContain("sort_order=desc");
      expect(url).toContain("include=shipping%2Ccustomer");
    });
  });

  describe("listOrdersSince — pagination", () => {
    it("follows meta.pagination.links.next for multi-page", async () => {
      // Page 1: full page (100 items) + next link
      const page1 = Array.from({ length: 100 }, (_, i) =>
        sampleOrder({ id: `ord-${i}`, ref: `R${i}` }),
      );
      mockFetch.mockResolvedValueOnce(
        res(youcanResponse(page1, "https://api.youcan.shop/orders?page=2")),
      );
      // Page 2: 1 item, no next
      mockFetch.mockResolvedValueOnce(
        res(youcanResponse([sampleOrder({ id: "ord-100", ref: "R100" })])),
      );

      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(101);
      expect(result.hasMore).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify second URL was the next link
      const secondUrl = String(mockFetch.mock.calls[1]![0]);
      expect(secondUrl).toContain("page=2");
    });

    it("stops when page returns less than PAGE_SIZE (no next link)", async () => {
      mockFetch.mockResolvedValueOnce(
        res(youcanResponse([sampleOrder()], null)),
      );
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.hasMore).toBe(false);
    });

    it("stops when next link is null even if page is full", async () => {
      const page1 = Array.from({ length: 100 }, (_, i) =>
        sampleOrder({ id: `ord-${i}`, ref: `R${i}` }),
      );
      mockFetch.mockResolvedValueOnce(
        res(youcanResponse(page1, null)), // 100 items but no next link
      );
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(100);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.hasMore).toBe(false);
    });

    it("respects maxPages cap and sets hasMore=true", async () => {
      // Always return full page with next link
      const page = Array.from({ length: 100 }, (_, i) =>
        sampleOrder({ id: `ord-${i}`, ref: `R${i}` }),
      );
      mockFetch.mockImplementation(async () =>
        res(youcanResponse(page, "https://api.youcan.shop/orders?page=99")),
      );
      const result = await youcanAdapter.listOrdersSince(creds, "", 2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.hasMore).toBe(true);
    });
  });

  describe("listOrdersSince — error handling", () => {
    it("retries on 429 then succeeds", async () => {
      mockFetch.mockResolvedValueOnce(res("rate limited", { status: 429, headers: { "Retry-After": "0" } }));
      mockFetch.mockResolvedValueOnce(res(youcanResponse([])));
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(0);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("W3-7: caps 429 retries at 5 then throws (infinite-loop guard)", async () => {
      // Mock a permanently-429'ing API (no Retry-After → exponential
      // backoff path). Without the cap, this loop would run forever.
      mockFetch.mockResolvedValue(
        res("rate limited", { status: 429 }),
      );

      // Speed up the test by stubbing setTimeout to resolve immediately.
      vi.spyOn(global, "setTimeout").mockImplementation((cb: TimerHandler) => {
        queueMicrotask(() => (cb as () => void)());
        return 0 as unknown as NodeJS.Timeout;
      });

      try {
        await expect(
          youcanAdapter.listOrdersSince(creds, ""),
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
        sampleOrder({ id: `ord-uuid-${String(i + 1).padStart(4, "0")}`, ref: `ORD-${1000 + i}` }),
      );
      mockFetch.mockResolvedValueOnce(res("rate limited", { status: 429, headers: { "Retry-After": "0" } }));
      mockFetch.mockResolvedValueOnce(res(youcanResponse(fullPage, "next-page-url")));
      mockFetch.mockResolvedValueOnce(res("rate limited", { status: 429, headers: { "Retry-After": "0" } }));
      mockFetch.mockResolvedValueOnce(res(youcanResponse([sampleOrder({ id: "ord-uuid-0002", ref: "ORD-1002" })])));

      const result = await youcanAdapter.listOrdersSince(creds, "", 2);
      expect(result.orders).toHaveLength(101); // 100 + 1
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("throws on non-OK HTTP status", async () => {
      mockFetch.mockResolvedValueOnce(res("Server error", { status: 500 }));
      await expect(youcanAdapter.listOrdersSince(creds, "")).rejects.toThrow("YouCan API 500");
    });

    it("throws on 401 unauthorized", async () => {
      mockFetch.mockResolvedValueOnce(res("Unauthorized", { status: 401 }));
      await expect(youcanAdapter.listOrdersSince(creds, "")).rejects.toThrow("401");
    });
  });

  describe("listOrdersSince — watermark (fix-B5: informational, no filtering)", () => {
    it("tracks the latest updated_at as the watermark hint", async () => {
      mockFetch.mockResolvedValueOnce(
        res(
          youcanResponse([
            sampleOrder({ id: "a", updated_at: "2026-01-01T00:00:00Z" }),
            sampleOrder({ id: "b", updated_at: "2026-03-01T00:00:00Z" }),
            sampleOrder({ id: "c", updated_at: "2026-02-01T00:00:00Z" }),
          ]),
        ),
      );
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.nextWatermark).toBe("2026-03-01T00:00:00Z");
    });

    it("fetches ALL orders on a page even when a watermark is set (fix-B5: no short-circuit)", async () => {
      // The previous implementation short-circuited on
      // `created_at <= watermark` and DROPPED the 2 older orders on this page
      // (and skipped any subsequent pages). That silently lost platform-side
      // cancellations on existing orders. We now normalise every fetched
      // order and rely on the sync-engine dedup + I-M3 update path.
      mockFetch.mockResolvedValueOnce(
        res(
          youcanResponse(
            [
              sampleOrder({ id: "new1", created_at: "2026-02-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z" }),
              sampleOrder({ id: "old1", created_at: "2025-12-01T00:00:00Z", updated_at: "2025-12-01T00:00:00Z" }),
              sampleOrder({ id: "old2", created_at: "2025-11-01T00:00:00Z", updated_at: "2025-11-01T00:00:00Z" }),
            ],
            null, // no next link — single page
          ),
        ),
      );

      const result = await youcanAdapter.listOrdersSince(creds, "2026-01-01T00:00:00Z");
      // ALL 3 orders returned — the 2 older ones were NOT dropped by a
      // short-circuit (the old code would have returned only `new1`).
      expect(result.orders).toHaveLength(3);
      expect(result.orders.map((o) => o.sourceOrderId)).toEqual(["new1", "old1", "old2"]);
      expect(result.hasMore).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      // Watermark advances to the latest updated_at
      expect(result.nextWatermark).toBe("2026-02-01T00:00:00Z");
    });

    it("fetches subsequent pages even when older orders are present (fix-B5: no short-circuit across pages)", async () => {
      // Page 1 is full (PAGE_SIZE=100) + has a next link. The 2nd page
      // contains older orders. The old short-circuit would have stopped at
      // page 1 as soon as it saw an order older than the watermark; we now
      // follow the next link and fetch page 2 too.
      const page1 = Array.from({ length: 100 }, (_, i) =>
        sampleOrder({
          id: `old-${i}`,
          created_at: "2025-11-01T00:00:00Z",
          updated_at: "2025-11-01T00:00:00Z",
        }),
      );
      mockFetch.mockResolvedValueOnce(
        res(youcanResponse(page1, "https://api.youcan.shop/orders?page=2")),
      );
      mockFetch.mockResolvedValueOnce(
        res(youcanResponse([
          sampleOrder({ id: "page2-1", created_at: "2025-10-01T00:00:00Z", updated_at: "2025-10-01T00:00:00Z" }),
        ])),
      );

      const result = await youcanAdapter.listOrdersSince(creds, "2026-01-01T00:00:00Z");
      // 100 from page 1 + 1 from page 2 = 101 — no short-circuit dropped any
      expect(result.orders).toHaveLength(101);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("re-fetches a cancelled old order so the sync-engine can propagate the cancellation (fix-B5)", async () => {
      // Core regression: an existing YouCan order whose platform state changed
      // (cancellation) MUST be re-fetched. The old short-circuit dropped it
      // because its created_at was older than the watermark — the seller would
      // have shipped an already-cancelled order.
      mockFetch.mockResolvedValueOnce(
        res(
          youcanResponse([
            sampleOrder({
              id: "old-cancelled",
              created_at: "2025-11-01T00:00:00Z", // old created_at
              updated_at: "2026-02-15T14:00:00Z", // but updated_at moved
              status_new: "cancelled", // platform cancelled it
            }),
          ]),
        ),
      );

      const result = await youcanAdapter.listOrdersSince(creds, "2026-01-01T00:00:00Z");
      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]!.sourceOrderId).toBe("old-cancelled");
      expect(result.orders[0]!.sourceMetadata.statusNew).toBe("cancelled");
    });

    it("fetches all orders on first sync (empty watermark)", async () => {
      // No watermark = fetch everything.
      const oldOrders = Array.from({ length: 5 }, (_, i) =>
        sampleOrder({ id: `old-${i}`, created_at: `2024-0${i + 1}-01T00:00:00Z` }),
      );
      mockFetch.mockResolvedValueOnce(res(youcanResponse(oldOrders, null)));

      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders).toHaveLength(5);
    });

    it("advances watermark past the existing value when a newer updated_at is seen", async () => {
      // Even though YouCan has no server-side filter, the persisted watermark
      // should reflect the latest updated_at across all fetched orders — this
      // is useful for diagnostics + a future incremental optimisation.
      mockFetch.mockResolvedValueOnce(
        res(
          youcanResponse([
            sampleOrder({ id: "a", updated_at: "2026-06-01T00:00:00Z" }),
            sampleOrder({ id: "b", updated_at: "2025-01-01T00:00:00Z" }),
          ]),
        ),
      );
      const result = await youcanAdapter.listOrdersSince(creds, "2026-01-01T00:00:00Z");
      expect(result.nextWatermark).toBe("2026-06-01T00:00:00Z");
    });
  });

  describe("order normalization", () => {
    it("uses full_name when present", async () => {
      mockFetch.mockResolvedValueOnce(res(youcanResponse([sampleOrder()])));
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.customerName).toBe("Ahmed Benali");
    });

    it("falls back to first_name + last_name when full_name is empty", async () => {
      mockFetch.mockResolvedValueOnce(
        res(
          youcanResponse([
            sampleOrder({
              shipping: {
                status_text: "x",
                price: 0,
                tracking_number: "",
                address: {
                  first_name: "First",
                  last_name: "Last",
                  full_name: null as unknown as string,
                  first_line: "A",
                  second_line: "",
                  phone: "05",
                  city: "C",
                  region: "R",
                  state: null,
                  zip_code: "",
                  country_code: "DZ",
                },
              },
            }),
          ]),
        ),
      );
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.customerName).toBe("First Last");
    });

    it("uses 'Client' when no name is available (empty address array)", async () => {
      mockFetch.mockResolvedValueOnce(
        res(
          youcanResponse([
            sampleOrder({
              shipping: {
                status_text: "x",
                price: 0,
                tracking_number: "",
                address: [], // empty array (include=shipping missing)
              },
            }),
          ]),
        ),
      );
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.customerName).toBe("Client");
      expect(result.orders[0]!.customerPhone).toBe("");
      expect(result.orders[0]!.wilaya).toBeNull();
      expect(result.orders[0]!.commune).toBeNull();
      expect(result.orders[0]!.address).toBe("Adresse non renseignée");
    });

    it("extracts phone from address", async () => {
      mockFetch.mockResolvedValueOnce(res(youcanResponse([sampleOrder()])));
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.customerPhone).toBe("0555123456");
    });

    it("maps wilaya from region (state is null fallback)", async () => {
      mockFetch.mockResolvedValueOnce(
        res(
          youcanResponse([
            sampleOrder({
              shipping: {
                status_text: "x",
                price: 0,
                tracking_number: "",
                address: {
                  first_name: "A",
                  last_name: "B",
                  full_name: "A B",
                  first_line: "X",
                  second_line: "",
                  phone: "05",
                  city: "C",
                  region: null,
                  state: "StateCode",
                  zip_code: "",
                  country_code: "DZ",
                },
              },
            }),
          ]),
        ),
      );
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.wilaya).toBe("StateCode");
    });

    it("joins first_line + second_line + zip_code", async () => {
      mockFetch.mockResolvedValueOnce(res(youcanResponse([sampleOrder()])));
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.address).toBe("123 Rue Didouche, Apt 4, 16000");
    });

    it("maps variants to items (name + quantity + price)", async () => {
      mockFetch.mockResolvedValueOnce(res(youcanResponse([sampleOrder()])));
      const result = await youcanAdapter.listOrdersSince(creds, "");
      const order = result.orders[0]!;
      expect(order.items).toHaveLength(2);
      expect(order.items[0]!.productName).toBe("Widget A");
      expect(order.items[0]!.quantity).toBe(2);
      expect(order.items[0]!.unitPrice).toBe(2000);
      expect(order.items[1]!.productName).toBe("Widget B");
      expect(order.items[1]!.unitPrice).toBe(1000);
    });

    it("total is a number (not string)", async () => {
      mockFetch.mockResolvedValueOnce(res(youcanResponse([sampleOrder()])));
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.totalPrice).toBe(5000);
    });

    it("sourceOrderId is the UUID (not ref)", async () => {
      mockFetch.mockResolvedValueOnce(res(youcanResponse([sampleOrder()])));
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.sourceOrderId).toBe("ord-uuid-0001");
    });

    it("orderNumber is ref (falls back to id when empty)", async () => {
      mockFetch.mockResolvedValueOnce(
        res(youcanResponse([sampleOrder({ ref: "" })])),
      );
      const result = await youcanAdapter.listOrdersSince(creds, "");
      expect(result.orders[0]!.orderNumber).toBe("ord-uuid-0001");
    });

    it("sets source='youcan' + includes sourceMetadata", async () => {
      mockFetch.mockResolvedValueOnce(res(youcanResponse([sampleOrder()])));
      const result = await youcanAdapter.listOrdersSince(creds, "");
      const order = result.orders[0]!;
      expect(order.source).toBe("youcan");
      expect(order.sourceMetadata.youcanOrderId).toBe("ord-uuid-0001");
      expect(order.sourceMetadata.youcanRef).toBe("ORD-1001");
      expect(order.sourceMetadata.statusNew).toBe("new");
      expect(order.sourceMetadata.gateway).toBe("cod");
      expect(order.sourceMetadata.shippingPrice).toBe(400);
      expect(order.createdAt).toBe("2026-01-02T10:00:00Z");
    });
  });
});
