/**
 * YouCan Store Admin API adapter.
 *
 * Docs: https://developer.youcan.shop
 *
 * Auth: OAuth2 Bearer token.
 * Polling: no API-level created_at_min filter — scan newest-first + dedup by id,
 *   and short-circuit per-page when an order older than the watermark is hit
 *   (I-M2: avoids re-fetching the entire catalog every sync). Must pass
 *   ?include=shipping,customer to get the address + phone (empty by default).
 * Pagination: page-based (?page=N, ?limit=100) with meta.pagination.links.next.
 * Rate limit: undocumented — be conservative.
 *
 * GOTCHA: order ID is a UUID string (not monotonic). Dedup by sourceOrderId.
 */

import type {
  EcommerceAdapter,
  EcommerceCredentials,
  YouCanCredentials,
  NormalizedOrder,
  SyncFetchResult,
} from "./types";

const PAGE_SIZE = 100;
const BASE_URL = "https://api.youcan.shop";

interface YouCanOrder {
  id: string; // UUID
  ref: string; // human order ref
  total: number;
  currency: string;
  status: number;
  status_new: string;
  payment_status: number;
  payment_status_new: string;
  shipping_status: string;
  created_at: string;
  updated_at: string;
  payment: {
    gateway_type_text: string;
  };
  shipping: {
    status_text: string;
    price: number;
    tracking_number: string;
    address: YouCanAddress | unknown[]; // empty array if not included
  };
  variants: Array<{
    price: number;
    quantity: number;
    variant: {
      product: {
        name: string;
      };
    };
  }>;
}

interface YouCanAddress {
  first_name: string;
  last_name: string;
  full_name: string;
  first_line: string;
  second_line: string;
  phone: string;
  city: string;
  region: string;
  state: string | null;
  zip_code: string;
  country_code: string;
}

interface YouCanOrdersResponse {
  data: YouCanOrder[];
  meta: {
    pagination: {
      total: number;
      count: number;
      per_page: number;
      current_page: number;
      total_pages: number;
      links: { next: string | null };
    };
  };
}

function isYouCanCreds(c: EcommerceCredentials): c is YouCanCredentials {
  return "accessToken" in c && !("shop" in c) && !("siteUrl" in c);
}

function isAddress(addr: YouCanAddress | unknown[]): addr is YouCanAddress {
  return !Array.isArray(addr);
}

function normalizeOrder(order: YouCanOrder): NormalizedOrder {
  const addr = isAddress(order.shipping.address) ? order.shipping.address : null;
  const customerName =
    addr?.full_name ??
    (addr ? `${addr.first_name} ${addr.last_name}`.trim() : null) ??
    "Client";
  const phone = addr?.phone ?? "";

  const addressParts = [addr?.first_line, addr?.second_line, addr?.zip_code]
    .filter(Boolean)
    .join(", ");

  return {
    sourceOrderId: order.id,
    orderNumber: order.ref || order.id,
    customerName,
    customerPhone: phone,
    wilaya: addr?.region ?? addr?.state ?? null,
    commune: addr?.city ?? null,
    address: addressParts || "Adresse non renseignée",
    items: order.variants.map((v) => ({
      productName: v.variant.product.name,
      quantity: v.quantity,
      unitPrice: v.price,
    })),
    totalPrice: order.total,
    source: "youcan",
    sourceMetadata: {
      youcanOrderId: order.id,
      youcanRef: order.ref,
      statusNew: order.status_new,
      paymentStatusNew: order.payment_status_new,
      shippingStatus: order.shipping_status,
      gateway: order.payment.gateway_type_text,
      currency: order.currency,
      shippingPrice: order.shipping.price,
      rawCreatedAt: order.created_at,
      rawUpdatedAt: order.updated_at,
    },
    createdAt: order.created_at,
  };
}

export const youcanAdapter: EcommerceAdapter = {
  platform: "youcan",
  displayName: "YouCan",

  async listOrdersSince(
    credentials: EcommerceCredentials,
    watermark: string, // I-M2: now used as a short-circuit threshold (orders older than this are skipped)
    maxPages = 10,
  ): Promise<SyncFetchResult> {
    if (!isYouCanCreds(credentials)) {
      throw new Error("Invalid credentials for YouCan adapter");
    }

    const { accessToken } = credentials;
    let allOrders: NormalizedOrder[] = [];
    let page = 1;
    let hasMore = false;
    let latestCreatedAt = watermark; // watermark is the floor; only newer orders raise it

    while (page <= maxPages) {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        page: String(page),
        sort_field: "created_at",
        sort_order: "desc",
        include: "shipping,customer",
      });

      const url = `${BASE_URL}/orders?${params.toString()}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (res.status === 429) {
        const retryAfter = parseFloat(res.headers.get("Retry-After") ?? "2");
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`YouCan API ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = (await res.json()) as YouCanOrdersResponse;
      if (!data.data || data.data.length === 0) {
        hasMore = false;
        break;
      }

      // I-M2: short-circuit on watermark. Orders are sorted DESC by created_at,
      // so once we encounter an order whose created_at is <= the watermark,
      // every subsequent order on this page (and all later pages) is also
      // older — stop fetching, drop the rest of this page, and exit the loop.
      // Previously every sync re-fetched up to maxPages*PAGE_SIZE orders
      // (1000 by default) even when the catalog hadn't changed.
      let shortCircuited = false;
      const normalized: NormalizedOrder[] = [];
      for (const o of data.data) {
        if (watermark && o.created_at <= watermark) {
          shortCircuited = true;
          break;
        }
        normalized.push(normalizeOrder(o));
        if (!latestCreatedAt || o.created_at > latestCreatedAt) {
          latestCreatedAt = o.created_at;
        }
      }
      allOrders = allOrders.concat(normalized);

      if (shortCircuited) {
        // We've reached orders we've already seen — no more pages to fetch.
        hasMore = false;
        break;
      }

      // Check for next page
      const nextLink = data.meta?.pagination?.links?.next;
      if (nextLink && data.data.length === PAGE_SIZE) {
        page++;
        hasMore = true;
      } else {
        hasMore = false;
        break;
      }
    }

    if (page > maxPages) {
      hasMore = true;
    }

    return { orders: allOrders, nextWatermark: latestCreatedAt, hasMore };
  },
};
