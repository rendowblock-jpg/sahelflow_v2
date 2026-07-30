import type {
  EcommerceAdapter,
  EcommerceCredentials,
  NormalizedOrder,
  ShopifyCredentials,
  SyncFetchResult,
} from "./types";

const API_VERSION = "2026-01";
const PAGE_SIZE = 250;

interface ShopifyOrder {
  id: number;
  name: string;
  order_number: number;
  total_price: string;
  total_shipping_price_set?: { shop_money?: { amount?: string } };
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
    variant_title?: string | null;
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

function isShopifyCreds(
  credentials: EcommerceCredentials,
): credentials is ShopifyCredentials {
  return "shop" in credentials && "accessToken" in credentials;
}

function parseNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  if (!nextMatch?.[1]) return null;
  return new URL(nextMatch[1]).searchParams.get("page_info");
}

function normalizeOrder(order: ShopifyOrder): NormalizedOrder {
  const address = order.shipping_address;
  const customer = order.customer;
  const firstName = address?.first_name ?? customer?.first_name ?? "";
  const lastName = address?.last_name ?? customer?.last_name ?? "";
  const customerName = `${firstName} ${lastName}`.trim() || "Client";
  const addressParts = [address?.address1, address?.address2, address?.zip]
    .filter(Boolean)
    .join(", ");

  return {
    sourceOrderId: String(order.id),
    orderNumber: order.name,
    customerName,
    customerPhone: address?.phone ?? customer?.phone ?? "",
    wilaya: address?.province ?? address?.province_code ?? null,
    commune: address?.city ?? null,
    address: addressParts || "Adresse non renseignée",
    items: order.line_items.map((line) => ({
      productName: line.title,
      catalogSku: line.sku,
      variantName: line.variant_title ?? null,
      quantity: line.quantity,
      unitPrice: Number.parseFloat(line.price) || 0,
    })),
    totalPrice: Number.parseFloat(order.total_price) || 0,
    deliveryCost:
      Number.parseFloat(order.total_shipping_price_set?.shop_money?.amount ?? "0") ||
      0,
    source: "shopify",
    sourceRevision: order.updated_at,
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

function isIso8601Watermark(watermark: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(watermark);
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
    let page = 0;
    let hasMore = false;
    const max429Retries = 3;
    let retriesThisUrl = 0;
    const watermarkIsIso = isIso8601Watermark(watermark);
    let nextWatermark = watermarkIsIso ? watermark : "";
    let url = `https://${baseHost}/admin/api/${API_VERSION}/orders.json?status=any&limit=${PAGE_SIZE}`;
    if (watermarkIsIso) {
      url += `&updated_at_min=${encodeURIComponent(watermark)}`;
    }

    while (url && page < maxPages) {
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
        if (retriesThisUrl >= max429Retries) {
          throw new Error(
            `Shopify API 429: rate limit exceeded after ${max429Retries} retries`,
          );
        }
        retriesThisUrl += 1;
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

      page += 1;
      retriesThisUrl = 0;
      const data = (await response.json()) as ShopifyOrdersResponse;
      allOrders = allOrders.concat(data.orders.map(normalizeOrder));
      for (const order of data.orders) {
        if (!nextWatermark || order.updated_at > nextWatermark) {
          nextWatermark = order.updated_at;
        }
      }

      const pageInfo = parseNextPageInfo(response.headers.get("Link"));
      if (pageInfo) {
        url = `https://${baseHost}/admin/api/${API_VERSION}/orders.json?page_info=${encodeURIComponent(pageInfo)}&limit=${PAGE_SIZE}`;
        hasMore = true;
      } else {
        url = "";
        hasMore = false;
      }
    }

    if (page >= maxPages && url) hasMore = true;
    return { orders: allOrders, nextWatermark, hasMore };
  },
};
