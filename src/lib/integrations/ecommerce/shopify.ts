/**
 * Shopify Admin REST API adapter.
 *
 * Docs: https://shopify.dev/docs/api/admin-rest/latest/resources/order
 *
 * Auth: X-Shopify-Access-Token header (shpat_xxx).
 * Polling: since_id (integer, monotonically increasing) + status=any.
 * Pagination: cursor-based via Link header (page_info param).
 * Rate limit: 40-request bucket, 2 req/sec. Handle 429 with Retry-After.
 * Page size: limit=250 (max).
 */

import type {
  EcommerceAdapter,
  EcommerceCredentials,
  ShopifyCredentials,
  NormalizedOrder,
  SyncFetchResult,
} from "./types";

const API_VERSION = "2026-01";
const PAGE_SIZE = 250;

interface ShopifyOrder {
  id: number;
  name: string;
  order_number: number;
  total_price: string;
  currency: string;
  created_at: string;
  updated_at: string;
  customer: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
  shipping_address: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    province_code: string | null;
    zip: string | null;
    country: string | null;
  } | null;
  line_items: Array<{
    title: string;
    name: string;
    quantity: number;
    price: string;
    sku: string | null;
  }>;
  financial_status: string | null;
  fulfillment_status: string | null;
  cancel_reason: string | null;
}

interface ShopifyOrdersResponse {
  orders: ShopifyOrder[];
}

function isShopifyCreds(c: EcommerceCredentials): c is ShopifyCredentials {
  return "shop" in c && "accessToken" in c;
}

/** Extract the next page_info cursor from the Link header. */
function parseNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Format: <https://...?page_info=abc&limit=250>; rel="next", <...>; rel="previous"
  const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  if (!nextMatch) return null;
  const url = new URL(nextMatch[1]!);
  return url.searchParams.get("page_info");
}

function normalizeOrder(order: ShopifyOrder): NormalizedOrder {
  const addr = order.shipping_address;
  const customer = order.customer;
  const firstName = addr?.first_name ?? customer?.first_name ?? "";
  const lastName = addr?.last_name ?? customer?.last_name ?? "";
  const customerName = `${firstName} ${lastName}`.trim() || "Client";
  const phone = addr?.phone ?? customer?.phone ?? "";

  const addressParts = [addr?.address1, addr?.address2, addr?.zip]
    .filter(Boolean)
    .join(", ");

  return {
    sourceOrderId: String(order.id),
    orderNumber: order.name,
    customerName,
    customerPhone: phone,
    wilaya: addr?.province ?? addr?.province_code ?? null,
    commune: addr?.city ?? null,
    address: addressParts || "Adresse non renseignée",
    items: order.line_items.map((li) => ({
      productName: li.title,
      quantity: li.quantity,
      unitPrice: parseFloat(li.price) || 0,
    })),
    totalPrice: parseFloat(order.total_price) || 0,
    source: "shopify",
    sourceMetadata: {
      shopifyOrderId: order.id,
      shopifyOrderNumber: order.order_number,
      financialStatus: order.financial_status,
      fulfillmentStatus: order.fulfillment_status,
      cancelReason: order.cancel_reason,
      currency: order.currency,
      rawCreatedAt: order.created_at,
      rawUpdatedAt: order.updated_at,
    },
    createdAt: order.created_at,
  };
}

export const shopifyAdapter: EcommerceAdapter = {
  platform: "shopify",
  displayName: "Shopify",

  async listOrdersSince(
    credentials: EcommerceCredentials,
    watermark: string,
    maxPages = 10,
  ): Promise<SyncFetchResult> {
    if (!isShopifyCreds(credentials)) {
      throw new Error("Invalid credentials for Shopify adapter");
    }

    const { shop, accessToken } = credentials;
    const baseHost = `${shop}.myshopify.com`;
    let allOrders: NormalizedOrder[] = [];
    let nextWatermark = watermark;
    let page = 0;
    let hasMore = false;
    // I-M1: 429 retries must NOT burn a maxPages slot — otherwise under heavy
    // rate-limiting maxPages=10 + N retries = (10-N) real pages fetched. The
    // previous code did `page++` at the top of the loop, so a 429 + `continue`
    // incremented page even though no data was fetched. Now `page++` only runs
    // after a successful (non-429) fetch, and we cap 429 retries per URL to
    // avoid an infinite loop if Shopify is genuinely overloaded.
    const MAX_429_RETRIES = 3;
    let retriesThisUrl = 0;

    // First page: use since_id if we have a watermark
    let url = `https://${baseHost}/admin/api/${API_VERSION}/orders.json?status=any&limit=${PAGE_SIZE}`;
    if (watermark) {
      url += `&since_id=${encodeURIComponent(watermark)}`;
    }

    while (url && page < maxPages) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { "X-Shopify-Access-Token": accessToken },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Handle rate limit (bounded retries — see I-M1 note above)
      if (res.status === 429) {
        if (retriesThisUrl >= MAX_429_RETRIES) {
          throw new Error(
            `Shopify API 429: rate limit exceeded after ${MAX_429_RETRIES} retries`,
          );
        }
        retriesThisUrl++;
        const retryAfter = parseFloat(res.headers.get("Retry-After") ?? "1");
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue; // retry same URL — page NOT incremented
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Shopify API ${res.status}: ${body.slice(0, 200)}`);
      }

      // Success: count this page + reset the retry counter for the next URL.
      page++;
      retriesThisUrl = 0;

      const data = (await res.json()) as ShopifyOrdersResponse;
      const normalized = data.orders.map(normalizeOrder);
      allOrders = allOrders.concat(normalized);

      // Advance watermark to the highest order ID seen
      for (const o of data.orders) {
        if (!nextWatermark || o.id > parseInt(nextWatermark, 10)) {
          nextWatermark = String(o.id);
        }
      }

      // Check for next page (cursor pagination via Link header)
      const linkHeader = res.headers.get("Link");
      const pageInfo = parseNextPageInfo(linkHeader);
      if (pageInfo) {
        url = `https://${baseHost}/admin/api/${API_VERSION}/orders.json?page_info=${encodeURIComponent(pageInfo)}&limit=${PAGE_SIZE}`;
        hasMore = true;
      } else {
        url = "";
        hasMore = false;
      }
    }

    if (page >= maxPages && url) {
      hasMore = true; // hit the safety cap, there might be more
    }

    return { orders: allOrders, nextWatermark, hasMore };
  },
};
