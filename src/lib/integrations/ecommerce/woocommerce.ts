import { classifyOutboundHost, outboundFetch } from "../outbound-http";
import type {
  EcommerceAdapter,
  EcommerceCredentials,
  NormalizedOrder,
  SyncFetchResult,
  SyncPageRequest,
  SyncPageResult,
  WooCommerceCredentials,
} from "./types";

const PAGE_SIZE = 100;
const MAX_429_RETRIES = 5;
const BACKOFF_BASE_MS = 2000;

interface WooOrder {
  id: number;
  number: string;
  status: string;
  total: string;
  shipping_total?: string;
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
    variation_id?: number;
    quantity: number;
    price: string | number;
    total: string;
    sku: string;
  }>;
  payment_method: string;
  payment_method_title: string;
}

function isWooCreds(
  credentials: EcommerceCredentials,
): credentials is WooCommerceCredentials {
  return "siteUrl" in credentials && "consumerKey" in credentials;
}

function normalizeOrder(order: WooOrder): NormalizedOrder {
  const billing = order.billing;
  const shipping = order.shipping;
  const customerName =
    `${billing.first_name} ${billing.last_name}`.trim() || "Client";
  const addressParts = [
    shipping.address_1,
    shipping.address_2,
    shipping.postcode,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    sourceOrderId: String(order.id),
    orderNumber: order.number || String(order.id),
    customerName,
    customerPhone: billing.phone ?? "",
    wilaya: shipping.state ?? billing.state ?? null,
    commune: shipping.city ?? billing.city ?? null,
    address: addressParts || billing.address_1 || "Adresse non renseignée",
    items: order.line_items.map((line) => ({
      productName: line.name,
      catalogSku: line.sku || null,
      quantity: line.quantity,
      unitPrice:
        typeof line.price === "number"
          ? line.price
          : Number.parseFloat(line.price) || 0,
    })),
    totalPrice: Number.parseFloat(order.total) || 0,
    deliveryCost: Number.parseFloat(order.shipping_total ?? "0") || 0,
    source: "woocommerce",
    sourceRevision: order.date_modified_gmt || order.date_modified,
    sourceMetadata: {
      wooOrderId: order.id,
      wooStatus: order.status,
      paymentMethod: order.payment_method,
      paymentMethodTitle: order.payment_method_title,
      currency: order.currency,
      rawDateCreated: order.date_created,
      rawDateModified: order.date_modified,
      rawDateModifiedGmt: order.date_modified_gmt,
    },
    createdAt: order.date_created,
  };
}

/**
 * Literal-address check on the host the seller typed. The shared classifier
 * (outbound-http.ts) also covers carrier-grade NAT, benchmarking, multicast,
 * NAT64/6to4 embeddings, trailing-dot and `.local`/`.internal` names; the name
 * is checked again at connect time against the address actually used.
 */
function classifyBlockedHost(hostname: string): "localhost" | "private" | null {
  const reason = classifyOutboundHost(hostname);
  if (reason === null) return null;
  return reason === "loopback" || reason === "unspecified" ? "localhost" : "private";
}

function validateSiteUrl(siteUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(siteUrl);
  } catch {
    throw new Error("Invalid WooCommerce site URL: not a valid URL");
  }
  if (
    !(["http:", "https:"] as const).includes(
      parsed.protocol as "http:" | "https:",
    )
  ) {
    throw new Error(
      "Invalid WooCommerce site URL: protocol must be http or https",
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error("WooCommerce site URL cannot point to a private or link-local IP address");
  }

  const blocked = classifyBlockedHost(parsed.hostname);
  if (blocked === "localhost") {
    throw new Error("WooCommerce site URL cannot point to localhost");
  }
  if (blocked === "private") {
    throw new Error(
      "WooCommerce site URL cannot point to a private or link-local IP address",
    );
  }
  return parsed;
}

const MAX_REDIRECTS = 3;

async function fetchWoo(
  url: string,
  init: { headers: { Authorization: string }; signal: AbortSignal },
): Promise<Response> {
  let current = validateSiteUrl(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await outboundFetch(current.toString(), {
      ...init,
      redirect: "manual",
      allowHttp: true,
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("Location") ?? response.headers.get("location");
    if (!location || hop === MAX_REDIRECTS) {
      throw new Error("WooCommerce site URL redirect was refused");
    }
    const next = validateSiteUrl(new URL(location, current).toString());
    if (next.hostname !== current.hostname) {
      throw new Error("WooCommerce site URL redirect was refused");
    }
    current = next;
  }
  throw new Error("WooCommerce site URL redirect was refused");
}

export const woocommerceAdapter: EcommerceAdapter = {
  platform: "woocommerce",
  displayName: "WooCommerce",

  async fetchOrderPage(
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
    const page = request.cursor ? Number.parseInt(request.cursor, 10) : 1;
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
        response = await fetchWoo(`${baseApi}?${params.toString()}`, {
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
        throw new Error(
          `WooCommerce API ${response.status}: ${body.slice(0, 200)}`,
        );
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
        page < totalPages && data.length === PAGE_SIZE
          ? String(page + 1)
          : null;
      return {
        orders: data.map(normalizeOrder),
        nextCursor,
        candidateWatermark,
      };
    }
  },

  async listOrdersSince(
    credentials: EcommerceCredentials,
    watermark: string,
    maxPages = 10,
  ): Promise<SyncFetchResult> {
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
    let allOrders: NormalizedOrder[] = [];
    let nextWatermark = watermark;
    let page = 1;
    let hasMore = false;
    let retriesThisPage = 0;

    while (page <= maxPages) {
      const params = new URLSearchParams({
        per_page: String(PAGE_SIZE),
        status: "any",
        orderby: "modified",
        order: "asc",
        page: String(page),
      });
      if (watermark) {
        params.set("modified_after", watermark);
        params.set("dates_are_gmt", "true");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      let response: Response;
      try {
        response = await fetchWoo(`${baseApi}?${params.toString()}`, {
          headers: { Authorization: auth },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 429) {
        if (retriesThisPage >= MAX_429_RETRIES) {
          throw new Error(
            `WooCommerce API rate-limited (429) on page ${page} after ${MAX_429_RETRIES} retries`,
          );
        }
        const retryAfter = Number.parseFloat(
          response.headers.get("Retry-After") ?? "",
        );
        const delay = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : BACKOFF_BASE_MS * 2 ** retriesThisPage;
        await new Promise((resolve) => setTimeout(resolve, delay));
        retriesThisPage += 1;
        continue;
      }
      retriesThisPage = 0;
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `WooCommerce API ${response.status}: ${body.slice(0, 200)}`,
        );
      }

      const data = (await response.json()) as WooOrder[];
      if (!Array.isArray(data) || data.length === 0) {
        hasMore = false;
        break;
      }
      allOrders = allOrders.concat(data.map(normalizeOrder));
      for (const order of data) {
        if (!nextWatermark || order.date_modified_gmt > nextWatermark) {
          nextWatermark = order.date_modified_gmt;
        }
      }

      const totalPages = Number.parseInt(
        response.headers.get("X-WP-TotalPages") ?? "1",
        10,
      );
      if (page < totalPages && data.length === PAGE_SIZE) {
        page += 1;
        hasMore = true;
      } else {
        hasMore = false;
        break;
      }
    }

    if (page > maxPages) hasMore = true;
    return { orders: allOrders, nextWatermark, hasMore };
  },
};
