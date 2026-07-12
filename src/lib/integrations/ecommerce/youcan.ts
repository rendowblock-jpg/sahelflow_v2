/**
 * YouCan Store Admin API adapter.
 *
 * Docs: https://developer.youcan.shop
 *
 * Auth: OAuth2 Bearer token.
 * Polling: YouCan's order list endpoint does NOT support an updated_at_min
 *   filter (unlike Shopify/WooCommerce). The previous implementation
 *   short-circuited per-page on `created_at <= watermark` (I-M2), which
 *   silently dropped platform-side updates to old orders — a cancellation
 *   on the YouCan dashboard would never propagate to SahelFlow, and the
 *   seller would ship an already-cancelled order (fix-B5 / dive-5).
 *   We now fetch ALL orders every sync and rely on the sync-engine's dedup
 *   (unique constraint on [source, sourceOrderId] + P2002 fallback) + I-M3
 *   update path to propagate cancellations.
 *   NOTE: YouCan does not support updated_at_min filtering. We fetch all
 *   orders and rely on sync-engine dedup. For stores with >1000 orders,
 *   this should be replaced with a periodic full-scan (daily) +
 *   incremental created_at scan (hourly).
 *   Must pass ?include=shipping,customer to get the address + phone
 *   (empty by default).
 * Pagination: page-based (?page=N, ?limit=100) with meta.pagination.links.next.
 * Rate limit: undocumented — be conservative.
 *
 * W3-7 (429 retry cap): if YouCan keeps returning 429, we cap retries at
 * MAX_429_RETRIES (5) per page so an undocumented rate limit can't trap
 * the sync loop forever. Backoff is exponential (2s, 4s, 8s, 16s, 32s)
 * by default, OR the value of the `Retry-After` header if the API provides one.
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
// W3-7: max consecutive 429 retries per page before we give up + throw.
// 5 retries × exponential backoff (2s, 4s, 8s, 16s, 32s) = ~62s of waiting
// before the cap fires — long enough to ride out a transient rate-limit
// spike, short enough that a permanently-429'ing API doesn't trap the
// sync loop forever.
const MAX_429_RETRIES = 5;
// W3-7: backoff floor (ms) for the exponential schedule. The Retry-After
// header is preferred when present; this is the fallback.
const BACKOFF_BASE_MS = 2000;

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
    watermark: string, // retained for interface compatibility — no longer used as a filter (see file header).
    maxPages = 10,
  ): Promise<SyncFetchResult> {
    if (!isYouCanCreds(credentials)) {
      throw new Error("Invalid credentials for YouCan adapter");
    }

    const { accessToken } = credentials;
    let allOrders: NormalizedOrder[] = [];
    let page = 1;
    let hasMore = false;
    // W3-7: track consecutive 429s PER PAGE. Reset to 0 on any non-429
    // response (success or hard error) so a 429 on page 5 doesn't count
    // against the cap when page 6 hits a 429.
    let retriesThisPage = 0;
    // Track the latest updated_at across all fetched orders. This becomes the
    // persisted watermark for diagnostics / future optimization, but we no
    // longer use it as a server-side filter (fix-B5: YouCan has no
    // updated_at_min, so filtering on created_at silently dropped updates to
    // old orders — including cancellations). The sync-engine's dedup handles
    // the resulting duplicate fetches.
    let nextWatermark = watermark;

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

      // W3-7: Handle rate limit. Cap retries at MAX_429_RETRIES per page so
      // a permanently-429'ing API can't trap the sync loop forever.
      // Backoff: respect `Retry-After` if present, else exponential 2s, 4s,
      // 8s, 16s, 32s.
      if (res.status === 429) {
        if (retriesThisPage >= MAX_429_RETRIES) {
          throw new Error(
            `YouCan API rate-limited (429) on page ${page} after ${MAX_429_RETRIES} retries. ` +
              `Backoff schedule exhausted (2s, 4s, 8s, 16s, 32s = ~62s total). ` +
              `YouCan's rate limit is undocumented — retry the sync later or contact YouCan support.`,
          );
        }
        const retryAfterHeader = res.headers.get("Retry-After");
        let delayMs: number;
        if (retryAfterHeader !== null) {
          // Retry-After is either seconds (most common) or an HTTP-date.
          // Parse as seconds first; if NaN, fall back to exponential backoff.
          const seconds = parseFloat(retryAfterHeader);
          delayMs = Number.isFinite(seconds) ? seconds * 1000 : BACKOFF_BASE_MS * Math.pow(2, retriesThisPage);
        } else {
          delayMs = BACKOFF_BASE_MS * Math.pow(2, retriesThisPage);
        }
        await new Promise((r) => setTimeout(r, delayMs));
        retriesThisPage++;
        continue;
      }

      // Non-429 response — reset the per-page retry counter for the next page.
      retriesThisPage = 0;

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`YouCan API ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = (await res.json()) as YouCanOrdersResponse;
      if (!data.data || data.data.length === 0) {
        hasMore = false;
        break;
      }

      // fix-B5: previously this loop short-circuited on
      // `created_at <= watermark` (the I-M2 optimisation) and DROPPED every
      // older order on the page + skipped all subsequent pages. That optimisation
      // was incorrect: YouCan has no updated_at_min filter, so the only way to
      // catch cancellations / fulfillment changes on existing orders is to
      // re-fetch them every sync and let the sync-engine dedup + I-M3 update
      // path handle them. We now normalise every fetched order unconditionally.
      const normalized = data.data.map(normalizeOrder);
      allOrders = allOrders.concat(normalized);

      // Track the latest updated_at for the persisted watermark (diagnostics
      // + future optimisation). ISO 8601 strings compare lexicographically in
      // chronological order with consistent timezone suffixes.
      for (const o of data.data) {
        if (!nextWatermark || o.updated_at > nextWatermark) {
          nextWatermark = o.updated_at;
        }
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

    return { orders: allOrders, nextWatermark, hasMore };
  },
};
