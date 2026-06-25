/**
 * WooCommerce REST API v3 adapter.
 *
 * Docs: https://developer.woocommerce.com/docs/apis/rest-api/
 *
 * Auth: HTTP Basic Auth (consumer_key:consumer_secret).
 * Polling: modified_after (ISO 8601 UTC) + dates_are_gmt=true + status=any.
 *   Catches both new orders and status updates.
 * Pagination: page-based (?page=N) with Link header. per_page=100 (max).
 * Rate limit: no built-in limit (host/plugin dependent). Handle 429 with backoff.
 */

import type {
  EcommerceAdapter,
  EcommerceCredentials,
  WooCommerceCredentials,
  NormalizedOrder,
  SyncFetchResult,
} from "./types";

const PAGE_SIZE = 100;

interface WooOrder {
  id: number;
  number: string;
  status: string;
  total: string;
  currency: string;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  billing: {
    first_name: string;
    last_name: string;
    phone: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    email: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  line_items: Array<{
    name: string;
    product_id: number;
    quantity: number;
    price: string | number;
    total: string;
    sku: string;
  }>;
  payment_method: string;
  payment_method_title: string;
}

function isWooCreds(c: EcommerceCredentials): c is WooCommerceCredentials {
  return "siteUrl" in c && "consumerKey" in c;
}

function normalizeOrder(order: WooOrder): NormalizedOrder {
  const b = order.billing;
  const s = order.shipping;
  const customerName = `${b.first_name} ${b.last_name}`.trim() || "Client";

  // Use shipping address for delivery, billing phone (Woo shipping has no phone)
  const addressParts = [s.address_1, s.address_2, s.postcode]
    .filter(Boolean)
    .join(", ");

  return {
    sourceOrderId: String(order.id),
    orderNumber: order.number || String(order.id),
    customerName,
    customerPhone: b.phone ?? "",
    wilaya: s.state ?? b.state ?? null,
    commune: s.city ?? b.city ?? null,
    address: addressParts || b.address_1 || "Adresse non renseignée",
    items: order.line_items.map((li) => ({
      productName: li.name,
      quantity: li.quantity,
      unitPrice: typeof li.price === "number" ? li.price : parseFloat(li.price) || 0,
    })),
    totalPrice: parseFloat(order.total) || 0,
    source: "woocommerce",
    sourceMetadata: {
      wooOrderId: order.id,
      wooStatus: order.status,
      paymentMethod: order.payment_method,
      paymentMethodTitle: order.payment_method_title,
      currency: order.currency,
      rawDateCreated: order.date_created,
      rawDateModified: order.date_modified,
    },
    createdAt: order.date_created,
  };
}

/**
 * Validate a WooCommerce site URL to prevent SSRF attacks.
 * Rejects: non-HTTP(S) protocols, localhost, private IPs, link-local addresses.
 */
function validateSiteUrl(siteUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(siteUrl);
  } catch {
    throw new Error("Invalid WooCommerce site URL: not a valid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid WooCommerce site URL: protocol must be http or https");
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1"
  ) {
    throw new Error("WooCommerce site URL cannot point to localhost");
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    const parts = hostname.split(".").map(Number);
    const isPrivate =
      parts[0] === 10 ||
      (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      parts[0] === 0;
    if (isPrivate) {
      throw new Error("WooCommerce site URL cannot point to a private or link-local IP address");
    }
  }

  return parsed;
}

export const woocommerceAdapter: EcommerceAdapter = {
  platform: "woocommerce",
  displayName: "WooCommerce",

  async listOrdersSince(
    credentials: EcommerceCredentials,
    watermark: string,
    maxPages = 10,
  ): Promise<SyncFetchResult> {
    if (!isWooCreds(credentials)) {
      throw new Error("Invalid credentials for WooCommerce adapter");
    }

    const { siteUrl, consumerKey, consumerSecret } = credentials;

    const validatedUrl = validateSiteUrl(siteUrl as string);
    const baseApi = `${validatedUrl.origin}/wp-json/wc/v3/orders`;
    const auth = "Basic " + Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

    let allOrders: NormalizedOrder[] = [];
    let nextWatermark = watermark;
    let page = 1;
    let hasMore = false;

    while (page <= maxPages) {
      const params = new URLSearchParams({
        per_page: String(PAGE_SIZE),
        status: "any",
        orderby: "modified",
        order: "asc",
        page: String(page),
      });
      // Use modified_after to catch new + updated orders since last sync
      if (watermark) {
        params.set("modified_after", watermark);
        params.set("dates_are_gmt", "true");
      }

      const url = `${baseApi}?${params.toString()}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Authorization: auth },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Handle rate limit (host/plugin)
      if (res.status === 429) {
        const retryAfter = parseFloat(res.headers.get("Retry-After") ?? "2");
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue; // retry same page
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`WooCommerce API ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = (await res.json()) as WooOrder[];
      if (!Array.isArray(data) || data.length === 0) {
        hasMore = false;
        break;
      }

      const normalized = data.map(normalizeOrder);
      allOrders = allOrders.concat(normalized);

      // Advance watermark to the latest date_modified_gmt
      for (const o of data) {
        if (!nextWatermark || o.date_modified_gmt > nextWatermark) {
          nextWatermark = o.date_modified_gmt;
        }
      }

      // Check if there are more pages
      const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1", 10);
      if (page < totalPages && data.length === PAGE_SIZE) {
        page++;
        hasMore = true;
      } else {
        hasMore = false;
        break;
      }
    }

    if (page > maxPages) {
      hasMore = true; // hit the safety cap
    }

    return { orders: allOrders, nextWatermark, hasMore };
  },
};
