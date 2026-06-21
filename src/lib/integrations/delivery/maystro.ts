/**
 * Maystro Delivery adapter — full implementation.
 *
 * Docs: https://maystro.gitbook.io/maystro-delivery-documentation
 *
 * Auth: Authorization: Token <token> (Django REST Framework Token auth).
 * Single credential: delivery_maystro_api_token.
 *
 * Endpoints:
 *   GET  /stores/delivery_price/?commune=<id>&delivery_type=<1|2>&express=<bool>
 *   GET  /shared/wilayas/?language=en&country=1
 *   GET  /shared/communes/?wilaya=<wilaya_id>
 *   POST b.maystro-delivery.com/api/stores/product/         (auto-create products)
 *   GET  /stores/product/?search=<name>                     (find existing product)
 *   POST b.maystro-delivery.com/api/stores/orders/          (create order)
 *   GET  /stores/orders/{id}/                               (get order status)
 *   GET  b.maystro-delivery.com/api/stores/history_order/{id} (tracking history)
 *   PATCH /shared/status/{id}/  {"status":50,"abort_reason":21}  (cancel)
 *
 * Gotchas handled:
 *   - Products must pre-exist (UUID required). We auto-create or find by name
 *     and cache the UUID→name mapping in-process.
 *   - Two base hosts: backend. (older) + b. (newer orders/history). We use
 *     the appropriate host per endpoint.
 *   - Weight is NOT used in pricing (only commune + delivery_type + express).
 *   - Wilaya codes 1-58 (sparse — 11,33,37,50,52,53,54,56 skipped).
 *   - Status codes are numeric (4=created, 41=delivered, 50=cancelled, etc.)
 *
 * Limitations:
 *   - Commune resolution requires a wilaya→commune lookup. We cache the
 *     commune list per wilaya in-process.
 */

import type {
  DeliveryAdapter,
  DeliveryCredentials,
  DeliveryCostEstimate,
  ShipmentRequest,
  ShipmentResult,
  TrackingEvent,
  TrackingInfo,
  DeliveryStatus,
} from "./types";
import { retryFetch } from "./retry";

const BACKEND_BASE =
  process.env.MAYSTRO_API_BASE || "https://backend.maystro-delivery.com/api";
const B_BASE = "https://b.maystro-delivery.com/api";

const FETCH_TIMEOUT_MS = 15000;

// In-memory caches (per process)
const wilayaIdCache = new Map<string, number>(); // "Alger" → 16
const communeCache = new Map<string, Map<string, number>>(); // "Alger" → ("Hydra" → 887)
const productIdCache = new Map<string, string>(); // productName → UUID

function authHeaders(creds: DeliveryCredentials): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Token ${creds.apiToken ?? ""}`,
  };
}

/** Map Maystro's numeric status codes to our normalized DeliveryStatus. */
function mapStatus(code: number): DeliveryStatus {
  switch (code) {
    case 4: return "created";      // CREATED
    case 5: return "picked_up";    // PICK_UP_REQUESTED
    case 6: return "created";      // IN_PROCESS
    case 8: return "in_transit";   // WAITING_TRANSIT
    case 9: return "in_transit";   // IN_TRANSIT_TO_BE_SHIPPED
    case 10: return "in_transit";  // IN_TRANSIT_TO_BE_RETURNED
    case 11: return "pending";     // PENDING
    case 12: return "failed";      // OUT_OF_STOCK
    case 15: return "created";     // READY_TO_SHIP
    case 22: return "created";     // ASSIGNED
    case 31: return "in_transit";  // SHIPPED
    case 32: return "failed";      // ALERTED
    case 41: return "delivered";   // DELIVERED
    case 42: return "failed";      // POSTPONED
    case 50: return "returned";    // ABORTED (cancel)
    case 51: return "in_transit";  // READY_TO_RETURN
    case 52: return "returned";    // TAKEN_BY_STORE
    case 53: return "refused";     // NOT_RECEIVED
    default: return "pending";
  }
}

/** Resolve a wilaya name to Maystro's numeric wilaya ID (cached). */
async function getWilayaId(
  wilaya: string,
  creds: DeliveryCredentials,
): Promise<number | undefined> {
  const normalized = wilaya.trim();
  if (wilayaIdCache.has(normalized)) return wilayaIdCache.get(normalized);

  try {
    const res = await retryFetch(
      `${BACKEND_BASE}/shared/wilayas/?language=en&country=1`,
      { headers: authHeaders(creds) },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) return undefined;
    // Response shape: [[1, "Adrar"], [2, "Chlef"], ...]
    const data = (await res.json()) as Array<[number, string]>;
    for (const [id, name] of data) {
      wilayaIdCache.set(name, id);
    }
    return wilayaIdCache.get(normalized);
  } catch {
    return undefined;
  }
}

/** Resolve a commune name to Maystro's numeric commune ID (cached per wilaya). */
async function getCommuneId(
  wilaya: string,
  commune: string,
  creds: DeliveryCredentials,
): Promise<number | undefined> {
  const wilayaId = await getWilayaId(wilaya, creds);
  if (!wilayaId) return undefined;

  let communes = communeCache.get(wilaya);
  if (!communes) {
    communes = new Map<string, number>();
    communeCache.set(wilaya, communes);
    try {
      const res = await retryFetch(
        `${BACKEND_BASE}/shared/communes/?wilaya=${wilayaId}`,
        { headers: authHeaders(creds) },
        FETCH_TIMEOUT_MS,
      );
      if (res.ok) {
        const data = (await res.json()) as Array<{
          id: number;
          name: string;
        }>;
        for (const c of data) {
          communes.set(c.name.toLowerCase().trim(), c.id);
        }
      }
    } catch {
      // leave cache empty
    }
  }
  return communes.get(commune.toLowerCase().trim());
}

/** Find or create a Maystro product by name, returning its UUID. */
async function ensureProduct(
  productName: string,
  creds: DeliveryCredentials,
): Promise<string | null> {
  const cached = productIdCache.get(productName);
  if (cached) return cached;

  // Search for an existing product with this name
  try {
    const res = await retryFetch(
      `${B_BASE}/stores/product/?search=${encodeURIComponent(productName)}`,
      { headers: authHeaders(creds) },
      FETCH_TIMEOUT_MS,
    );
    if (res.ok) {
      const data = (await res.json()) as {
        results?: Array<{ id: string; name: string }>;
      };
      const match = data.results?.find(
        (p) => p.name.toLowerCase() === productName.toLowerCase(),
      );
      if (match) {
        productIdCache.set(productName, match.id);
        return match.id;
      }
    }
  } catch {
    // fall through to create
  }

  // Create a new product
  try {
    const res = await retryFetch(
      `${B_BASE}/stores/product/`,
      {
        method: "POST",
        headers: authHeaders(creds),
        body: JSON.stringify({
          name: productName,
          logistical_description: productName,
          price: 0,
        }),
      },
      FETCH_TIMEOUT_MS,
    );
    if (res.ok) {
      const created = (await res.json()) as { id: string };
      productIdCache.set(productName, created.id);
      return created.id;
    }
  } catch {
    // fall through
  }
  return null;
}

export const maystroAdapter: DeliveryAdapter = {
  id: "maystro",
  name: "Maystro Delivery",
  logo: "🚚",

  async estimateCost(
    params: { wilaya: string; commune?: string; weight: number; codAmount: number },
    creds: DeliveryCredentials,
  ): Promise<DeliveryCostEstimate> {
    if (!creds.apiToken) {
      return {
        provider: "maystro",
        cost: 0,
        available: false,
        error: "Token Maystro manquant. Configurez-le dans Paramètres → Transporteurs.",
      };
    }

    if (!params.commune) {
      return {
        provider: "maystro",
        cost: 0,
        available: false,
        error: "Commune requise pour l'estimation Maystro.",
      };
    }

    const communeId = await getCommuneId(params.wilaya, params.commune, creds);
    if (!communeId) {
      return {
        provider: "maystro",
        cost: 0,
        available: false,
        error: `Commune "${params.commune}" introuvable dans la wilaya "${params.wilaya}".`,
      };
    }

    try {
      const url = `${BACKEND_BASE}/stores/delivery_price/?commune=${communeId}&delivery_type=1&express=false`;
      const res = await retryFetch(
        url,
        { headers: authHeaders(creds) },
        FETCH_TIMEOUT_MS,
      );
      if (res.status === 404) {
        return {
          provider: "maystro",
          cost: 0,
          available: false,
          error: "Tarif non disponible pour cette destination.",
        };
      }
      if (!res.ok) {
        return {
          provider: "maystro",
          cost: 0,
          available: false,
          error: `Erreur Maystro: ${res.status}`,
        };
      }
      const data = (await res.json()) as { delivery_price: number };
      return {
        provider: "maystro",
        cost: data.delivery_price ?? 0,
        available: true,
      };
    } catch (err) {
      return {
        provider: "maystro",
        cost: 0,
        available: false,
        error: err instanceof Error ? err.message : "Erreur de connexion",
      };
    }
  },

  async createShipment(
    request: ShipmentRequest,
    creds: DeliveryCredentials,
  ): Promise<ShipmentResult> {
    if (!creds.apiToken) {
      return { success: false, trackingId: "", cost: 0, error: "Token Maystro manquant." };
    }

    const communeId = await getCommuneId(
      request.customer.wilaya,
      request.customer.commune,
      creds,
    );
    if (!communeId) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: `Commune "${request.customer.commune}" introuvable.`,
      };
    }

    // Ensure all products exist in Maystro (auto-create if missing)
    const productUuids: Array<{ product_id: string; quantity: number; logistical_description: string }> = [];
    for (const item of request.items) {
      const uuid = await ensureProduct(item.name, creds);
      if (!uuid) {
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `Impossible de créer le produit "${item.name}" chez Maystro.`,
        };
      }
      productUuids.push({
        product_id: uuid,
        quantity: item.quantity,
        logistical_description: item.name,
      });
    }

    // Estimate the delivery cost (to return it to the caller)
    const estimate = await maystroAdapter.estimateCost(
      {
        wilaya: request.customer.wilaya,
        commune: request.customer.commune,
        weight: request.weight,
        codAmount: request.totalPrice,
      },
      creds,
    );

    try {
      const body = {
        external_order_id: request.orderNumber,
        source: 4, // API-created
        wilaya: await getWilayaId(request.customer.wilaya, creds),
        commune: communeId,
        destination_text: request.customer.address,
        customer_phone: request.customer.phone,
        customer_name: request.customer.name,
        product_price: request.totalPrice, // COD total (incl. delivery)
        delivery_type: 1, // HOME_DELIVERY
        express: false,
        note_to_driver: request.notes ?? "",
        products: productUuids,
      };

      const res = await retryFetch(
        `${B_BASE}/stores/orders/`,
        {
          method: "POST",
          headers: authHeaders(creds),
          body: JSON.stringify(body),
        },
        FETCH_TIMEOUT_MS,
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `Maystro API ${res.status}: ${errBody.slice(0, 200)}`,
        };
      }

      const data = (await res.json()) as {
        id: string;
        display_id: string;
        status: number;
      };

      return {
        success: true,
        trackingId: data.display_id || data.id,
        cost: estimate.cost,
        estimatedDelivery: undefined,
      };
    } catch (err) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: err instanceof Error ? err.message : "Erreur de connexion",
      };
    }
  },

  async syncTracking(
    trackingId: string,
    creds: DeliveryCredentials,
  ): Promise<TrackingInfo> {
    if (!creds.apiToken) {
      throw new Error("Token Maystro manquant.");
    }

    // trackingId is the display_id (human-facing). We need the UUID for the
    // history endpoint. First, find the order by display_id via the list endpoint.
    let orderUuid: string | undefined;
    let currentStatus: DeliveryStatus = "pending";

    try {
      const res = await retryFetch(
        `${BACKEND_BASE}/stores/orders/?display_id=${encodeURIComponent(trackingId)}`,
        { headers: authHeaders(creds) },
        FETCH_TIMEOUT_MS,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{ id: string; status: number }>;
        };
        const order = data.results?.[0];
        if (order) {
          orderUuid = order.id;
          currentStatus = mapStatus(order.status);
        }
      }
    } catch {
      // fall through
    }

    if (!orderUuid) {
      throw new Error(`Commande Maystro "${trackingId}" introuvable.`);
    }

    // Fetch tracking history
    const events: TrackingEvent[] = [];
    try {
      const res = await retryFetch(
        `${B_BASE}/stores/history_order/${orderUuid}`,
        { headers: authHeaders(creds) },
        FETCH_TIMEOUT_MS,
      );
      if (res.ok) {
        const history = (await res.json()) as Array<{
          status: number;
          created_at: string;
          comment: string | null;
        }>;
        for (const h of history) {
          events.push({
            status: mapStatus(h.status),
            timestamp: h.created_at,
            details: h.comment ?? "",
          });
        }
      }
    } catch {
      // history is best-effort
    }

    return {
      trackingId,
      status: currentStatus,
      events,
      deliveryCompany: "Maystro Delivery",
    };
  },

  async cancelShipment(
    trackingId: string,
    creds: DeliveryCredentials,
  ): Promise<{ success: boolean; error?: string }> {
    if (!creds.apiToken) {
      return { success: false, error: "Token Maystro manquant." };
    }

    // Find the order UUID by display_id
    let orderUuid: string | undefined;
    try {
      const res = await retryFetch(
        `${BACKEND_BASE}/stores/orders/?display_id=${encodeURIComponent(trackingId)}`,
        { headers: authHeaders(creds) },
        FETCH_TIMEOUT_MS,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{ id: string }>;
        };
        orderUuid = data.results?.[0]?.id;
      }
    } catch {
      // fall through
    }

    if (!orderUuid) {
      return { success: false, error: `Commande "${trackingId}" introuvable.` };
    }

    try {
      const res = await retryFetch(
        `${BACKEND_BASE}/shared/status/${orderUuid}/`,
        {
          method: "PATCH",
          headers: authHeaders(creds),
          body: JSON.stringify({ status: 50, abort_reason: 21 }),
        },
        FETCH_TIMEOUT_MS,
      );
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        return {
          success: false,
          error: `Maystro API ${res.status}: ${errBody.slice(0, 200)}`,
        };
      }
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Erreur de connexion",
      };
    }
  },
};
