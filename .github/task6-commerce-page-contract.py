from pathlib import Path

ROOT = Path.cwd()


def replace_once(path: str, old: str, new: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"expected one exact match in {path}: {old[:100]}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/lib/integrations/ecommerce/types.ts",
    "export interface SyncFetchResult {\n",
    '''export interface SyncPageRequest {
  watermark: string;
  /** Opaque provider continuation. Null means fetch the first page. */
  cursor?: string | null;
}

export interface SyncPageResult {
  orders: NormalizedOrder[];
  /** Opaque continuation to the next provider page, or null when complete. */
  nextCursor: string | null;
  /** Candidate diagnostic watermark accumulated through this page. */
  candidateWatermark: string;
}

export interface SyncFetchResult {
''',
)

replace_once(
    "src/lib/integrations/ecommerce/types.ts",
    '''export interface EcommerceAdapter {
  platform: EcommercePlatform;
  displayName: string;
  listOrdersSince(
''',
    '''export interface EcommerceAdapter {
  platform: EcommercePlatform;
  displayName: string;
  fetchOrderPage(
    credentials: EcommerceCredentials,
    request: SyncPageRequest,
  ): Promise<SyncPageResult>;
  listOrdersSince(
''',
)

replace_once(
    "src/lib/integrations/ecommerce/shopify.ts",
    '''  NormalizedOrder,
  ShopifyCredentials,
  SyncFetchResult,
''',
    '''  NormalizedOrder,
  ShopifyCredentials,
  SyncFetchResult,
  SyncPageRequest,
  SyncPageResult,
''',
)

replace_once(
    "src/lib/integrations/ecommerce/shopify.ts",
    '''  async listOrdersSince(
''',
    '''  async fetchOrderPage(
    credentials: EcommerceCredentials,
    request: SyncPageRequest,
  ): Promise<SyncPageResult> {
    if (!isShopifyCreds(credentials)) {
      throw new Error("Invalid credentials for Shopify adapter");
    }

    const { shop, accessToken } = credentials;
    const baseHost = `${shop}.myshopify.com`;
    const watermarkIsIso = isIso8601Watermark(request.watermark);
    let url = request.cursor
      ? `https://${baseHost}/admin/api/${API_VERSION}/orders.json?page_info=${encodeURIComponent(request.cursor)}&limit=${PAGE_SIZE}`
      : `https://${baseHost}/admin/api/${API_VERSION}/orders.json?status=any&limit=${PAGE_SIZE}`;
    if (!request.cursor && watermarkIsIso) {
      url += `&updated_at_min=${encodeURIComponent(request.watermark)}`;
    }

    const max429Retries = 3;
    let retries = 0;
    while (true) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { "X-Shopify-Access-Token": accessToken },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 429) {
        if (retries >= max429Retries) {
          throw new Error(
            `Shopify API 429: rate limit exceeded after ${max429Retries} retries`,
          );
        }
        retries += 1;
        const retryAfter = Number.parseFloat(
          response.headers.get("Retry-After") ?? "1",
        );
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, retryAfter) * 1000),
        );
        continue;
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Shopify API ${response.status}: ${body.slice(0, 200)}`);
      }

      const data = (await response.json()) as ShopifyOrdersResponse;
      let candidateWatermark = watermarkIsIso ? request.watermark : "";
      for (const order of data.orders) {
        if (!candidateWatermark || order.updated_at > candidateWatermark) {
          candidateWatermark = order.updated_at;
        }
      }
      return {
        orders: data.orders.map(normalizeOrder),
        nextCursor: parseNextPageInfo(response.headers.get("Link")),
        candidateWatermark,
      };
    }
  },

  async listOrdersSince(
''',
)

replace_once(
    "src/lib/integrations/ecommerce/woocommerce.ts",
    '''  NormalizedOrder,
  SyncFetchResult,
  WooCommerceCredentials,
''',
    '''  NormalizedOrder,
  SyncFetchResult,
  SyncPageRequest,
  SyncPageResult,
  WooCommerceCredentials,
''',
)

replace_once(
    "src/lib/integrations/ecommerce/woocommerce.ts",
    '''  async listOrdersSince(
''',
    '''  async fetchOrderPage(
    credentials: EcommerceCredentials,
    request: SyncPageRequest,
  ): Promise<SyncPageResult> {
    if (!isWooCreds(credentials)) {
      throw new Error("Invalid credentials for WooCommerce adapter");
    }

    const validatedUrl = validateSiteUrl(credentials.siteUrl);
    const baseApi = `${validatedUrl.origin}/wp-json/wc/v3/orders`;
    const auth =
      "Basic " +
      Buffer.from(
        `${credentials.consumerKey}:${credentials.consumerSecret}`,
      ).toString("base64");
    const page = request.cursor
      ? Number.parseInt(request.cursor, 10)
      : 1;
    if (!Number.isInteger(page) || page < 1) {
      throw new Error("Invalid WooCommerce page cursor");
    }
    const params = new URLSearchParams({
      per_page: String(PAGE_SIZE),
      status: "any",
      orderby: "modified",
      order: "asc",
      page: String(page),
    });
    if (request.watermark) {
      params.set("modified_after", request.watermark);
      params.set("dates_are_gmt", "true");
    }

    let retries = 0;
    while (true) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      let response: Response;
      try {
        response = await fetch(`${baseApi}?${params.toString()}`, {
          headers: { Authorization: auth },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 429) {
        if (retries >= MAX_429_RETRIES) {
          throw new Error(
            `WooCommerce API rate-limited (429) on page ${page} after ${MAX_429_RETRIES} retries`,
          );
        }
        const retryAfter = Number.parseFloat(
          response.headers.get("Retry-After") ?? "",
        );
        const delay = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : BACKOFF_BASE_MS * 2 ** retries;
        await new Promise((resolve) => setTimeout(resolve, delay));
        retries += 1;
        continue;
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`WooCommerce API ${response.status}: ${body.slice(0, 200)}`);
      }

      const data = (await response.json()) as WooOrder[];
      let candidateWatermark = request.watermark;
      for (const order of data) {
        const modified = order.date_modified_gmt || order.date_modified;
        if (!candidateWatermark || modified > candidateWatermark) {
          candidateWatermark = modified;
        }
      }
      const totalPages = Number.parseInt(
        response.headers.get("X-WP-TotalPages") ?? "1",
        10,
      );
      const nextCursor =
        page < totalPages && data.length === PAGE_SIZE ? String(page + 1) : null;
      return {
        orders: data.map(normalizeOrder),
        nextCursor,
        candidateWatermark,
      };
    }
  },

  async listOrdersSince(
''',
)

replace_once(
    "src/lib/integrations/ecommerce/youcan.ts",
    '''  SyncFetchResult,
} from "./types";
''',
    '''  SyncFetchResult,
  SyncPageRequest,
  SyncPageResult,
} from "./types";
''',
)

replace_once(
    "src/lib/integrations/ecommerce/youcan.ts",
    '''  async listOrdersSince(
''',
    '''  async fetchOrderPage(
    credentials: EcommerceCredentials,
    request: SyncPageRequest,
  ): Promise<SyncPageResult> {
    if (!isYouCanCreds(credentials)) {
      throw new Error("Invalid credentials for YouCan adapter");
    }

    const page = request.cursor
      ? Number.parseInt(request.cursor, 10)
      : 1;
    if (!Number.isInteger(page) || page < 1) {
      throw new Error("Invalid YouCan page cursor");
    }
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      page: String(page),
      sort_field: "created_at",
      sort_order: "desc",
      include: "shipping,customer",
    });
    const url = `${BASE_URL}/orders?${params.toString()}`;
    let retries = 0;

    while (true) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${credentials.accessToken}` },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 429) {
        if (retries >= MAX_429_RETRIES) {
          throw new Error(
            `YouCan API rate-limited (429) on page ${page} after ${MAX_429_RETRIES} retries`,
          );
        }
        const retryAfterHeader = response.headers.get("Retry-After");
        const seconds = Number.parseFloat(retryAfterHeader ?? "");
        const delayMs = Number.isFinite(seconds)
          ? seconds * 1000
          : BACKOFF_BASE_MS * 2 ** retries;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        retries += 1;
        continue;
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`YouCan API ${response.status}: ${body.slice(0, 200)}`);
      }

      const data = (await response.json()) as YouCanOrdersResponse;
      const providerOrders = data.data ?? [];
      let candidateWatermark = request.watermark;
      for (const order of providerOrders) {
        if (!candidateWatermark || order.updated_at > candidateWatermark) {
          candidateWatermark = order.updated_at;
        }
      }
      const nextCursor =
        data.meta?.pagination?.links?.next && providerOrders.length === PAGE_SIZE
          ? String(page + 1)
          : null;
      return {
        orders: providerOrders.map(normalizeOrder),
        nextCursor,
        candidateWatermark,
      };
    }
  },

  async listOrdersSince(
''',
)

page_test = ROOT / "src/lib/integrations/ecommerce/__tests__/page-cursor-contract.test.ts"
page_test.parent.mkdir(parents=True, exist_ok=True)
page_test.write_text(
    '''import { afterEach, describe, expect, it, vi } from "vitest";

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
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("page_info=cursor-2");
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain("updated_at_min");
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
''',
    encoding="utf-8",
)

print("Task 6 commerce page cursor contract applied")
