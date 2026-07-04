/**
 * Yalidine delivery adapter — the largest Algerian COD delivery provider.
 *
 * API docs: https://api.yalidine.app/v1
 * Auth: X-API-ID + X-API-TOKEN headers (seller's credentials, stored encrypted
 * in the Secret table).
 *
 * Endpoints used:
 *   POST /parcels/          → create shipment
 *   GET  /parcels/{tracking} → get shipment status
 *   GET  /deliveryfees/      → estimate delivery cost
 *   GET  /histories/?tracking={id} → tracking events
 *
 * Commune codes: Yalidine uses numeric commune IDs. We resolve them via the
 * /communes/ endpoint (cached in-memory for the process lifetime).
 */
import { env } from "@/lib/env";
import "server-only";


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

const YALIDINE_BASE =
  env.yalidineApiBase || "https://api.yalidine.app/v1";

const FETCH_TIMEOUT_MS = 15000;

// In-memory commune-code cache: { "wilaya::commune" → code }
const communeCodeCache = new Map<string, number>();

function headers(creds: DeliveryCredentials): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-API-ID": creds.apiId ?? "",
    "X-API-TOKEN": creds.apiToken ?? "",
  };
}

/** Map Yalidine's status strings to our normalized DeliveryStatus. */
function mapStatus(raw: string): DeliveryStatus {
  const s = raw.toLowerCase().trim();
  // CRITICAL: "Livré" (delivered) vs "Non livré" (not delivered) — must
  // check "non livré" BEFORE "livré" to avoid false-positive delivered.
  if (s.includes("non livré") || s.includes("non livre")) return "failed";
  if (s === "livré" || s === "delivered" || s.includes("livré (")) return "delivered";
  // "Retour définitif" / "Retour" → returned
  if (s.includes("retour") || s === "returned") return "returned";
  if (s.includes("refus") || s === "refused") return "refused";
  if (s.includes("échec") || s.includes("echec") || s === "failed") return "failed";
  if (s.includes("ramass") || s.includes("picked")) return "picked_up";
  if (s.includes("transit") || s.includes("voyage")) return "in_transit";
  if (s.includes("centre") || s.includes("hub")) return "at_hub";
  if (s.includes("livreur") || s.includes("out_for")) return "out_for_delivery";
  if (s.includes("créé") || s.includes("cree") || s === "created") return "created";
  return "pending";
}

/** Resolve a commune name to Yalidine's numeric commune code (cached). */
async function getCommuneCode(
  wilaya: string,
  commune: string,
  creds: DeliveryCredentials,
): Promise<number | undefined> {
  const cacheKey = `${wilaya}::${commune}`;
  if (communeCodeCache.has(cacheKey)) {
    return communeCodeCache.get(cacheKey);
  }
  try {
    const res = await retryFetch(
      `${YALIDINE_BASE}/communes/?wilaya_name=${encodeURIComponent(wilaya)}`,
      { headers: headers(creds) },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as Array<{ _id: number; name: string }>;
    const match = data.find(
      (c) => c.name.toLowerCase().trim() === commune.toLowerCase().trim(),
    );
    if (match) {
      communeCodeCache.set(cacheKey, match._id);
      return match._id;
    }
  } catch {
    // fallback to string commune name
  }
  return undefined;
}

export const yalidineAdapter: DeliveryAdapter = {
  id: "yalidine",
  name: "Yalidine",
  logo: "📦",

  async estimateCost(
    params: { wilaya: string; commune?: string; weight: number; codAmount: number },
    creds: DeliveryCredentials,
  ): Promise<DeliveryCostEstimate> {
    if (!creds.apiId || !creds.apiToken) {
      return {
        provider: "yalidine",
        cost: 0,
        available: false,
        error: "Identifiants Yalidine manquants. Configurez-les dans Paramètres → Intégrations.",
      };
    }

    try {
      // Yalidine's /deliveryfees/ takes wilaya_name + weight
      const searchParams = new URLSearchParams({
        wilaya_name: params.wilaya,
        weight: String(params.weight),
      });
      const res = await retryFetch(
        `${YALIDINE_BASE}/deliveryfees/?${searchParams.toString()}`,
        { headers: headers(creds) },
        FETCH_TIMEOUT_MS,
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          provider: "yalidine",
          cost: 0,
          available: false,
          error: `Erreur API Yalidine: ${res.status} ${text.slice(0, 200)}`,
        };
      }

      const data = (await res.json()) as Array<{
        wilaya_name: string;
        home_delivery: number;
        stopdesk_delivery: number;
      }>;

      if (!Array.isArray(data) || data.length === 0) {
        return {
          provider: "yalidine",
          cost: 0,
          available: false,
          error: `Pas de tarif trouvé pour la wilaya "${params.wilaya}".`,
        };
      }

      // Use home delivery price (most common for COD)
      const fee = data[0];
      if (!fee) {
        return {
          provider: "yalidine",
          cost: 0,
          available: false,
          error: "Tarif introuvable.",
        };
      }
      return {
        provider: "yalidine",
        cost: fee.home_delivery,
        available: true,
        estimatedDays: "2-5 jours",
      };
    } catch (err) {
      return {
        provider: "yalidine",
        cost: 0,
        available: false,
        error: `Échec de connexion: ${err instanceof Error ? err.message : "erreur inconnue"}`,
      };
    }
  },

  async createShipment(
    request: ShipmentRequest,
    creds: DeliveryCredentials,
  ): Promise<ShipmentResult> {
    if (!creds.apiId || !creds.apiToken) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: "Identifiants Yalidine manquants.",
      };
    }

    // Resolve commune code
    let communeValue: string | number = request.customer.commune;
    const code = await getCommuneCode(
      request.customer.wilaya,
      request.customer.commune,
      creds,
    );
    if (code) communeValue = code;

    const body = [
      {
        order_id: request.orderNumber,
        firstname: request.customer.name,
        lastname: "",
        address: request.customer.address,
        wilaya: request.customer.wilaya,
        commune: communeValue,
        phone: request.customer.phone,
        phone_2: "",
        product: request.items.map((i) => `${i.name} x${i.quantity}`).join(", "),
        price: request.totalPrice,
        weight: request.weight,
        note: request.notes ?? "",
        is_exchange: request.isExchange ?? false,
      },
    ];

    try {
      const res = await retryFetch(
        `${YALIDINE_BASE}/parcels/`,
        {
          method: "POST",
          headers: headers(creds),
          body: JSON.stringify(body),
        },
        FETCH_TIMEOUT_MS,
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `Erreur API Yalidine: ${res.status} ${text.slice(0, 300)}`,
        };
      }

      const data = (await res.json()) as Array<{
        tracking_id?: string;
        label?: string;
        parcel_status?: string;
        error?: string;
      }>;

      if (!Array.isArray(data) || data.length === 0) {
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: "Réponse vide de Yalidine.",
        };
      }

      const parcel = data[0];
      if (!parcel) {
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: "Réponse vide de Yalidine.",
        };
      }
      if (parcel.error) {
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: parcel.error,
        };
      }

      // Fetch the cost (the create response doesn't always include it)
      let cost = 0;
      if (parcel.tracking_id) {
        const estimate = await yalidineAdapter.estimateCost(
          {
            wilaya: request.customer.wilaya,
            weight: request.weight,
            codAmount: request.totalPrice,
          },
          creds,
        );
        if (estimate.available) cost = estimate.cost;
      }

      return {
        success: true,
        trackingId: parcel.tracking_id ?? "",
        labelUrl: parcel.label,
        cost,
      };
    } catch (err) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: `Échec de connexion: ${err instanceof Error ? err.message : "erreur inconnue"}`,
      };
    }
  },

  async syncTracking(
    trackingId: string,
    creds: DeliveryCredentials,
  ): Promise<TrackingInfo> {
    if (!creds.apiId || !creds.apiToken) {
      throw new Error("Identifiants Yalidine manquants.");
    }

    // Fetch parcel status + history in parallel
    const [parcelRes, historyRes] = await Promise.allSettled([
      retryFetch(
        `${YALIDINE_BASE}/parcels/${encodeURIComponent(trackingId)}/`,
        { headers: headers(creds) },
        FETCH_TIMEOUT_MS,
      ),
      retryFetch(
        `${YALIDINE_BASE}/histories/?tracking=${encodeURIComponent(trackingId)}`,
        { headers: headers(creds) },
        FETCH_TIMEOUT_MS,
      ),
    ]);

    let status: DeliveryStatus = "pending";
    let estimatedDelivery: string | undefined;

    if (parcelRes.status === "fulfilled" && parcelRes.value.ok) {
      const parcel = (await parcelRes.value.json()) as Array<{
        parcel_status?: string;
        delivery_date?: string;
      }>;
      if (Array.isArray(parcel) && parcel.length > 0 && parcel[0]) {
        status = mapStatus(parcel[0].parcel_status ?? "");
        estimatedDelivery = parcel[0].delivery_date ?? undefined;
      }
    }

    const events: TrackingEvent[] = [];
    if (historyRes.status === "fulfilled" && historyRes.value.ok) {
      const history = (await historyRes.value.json()) as Array<{
        status?: string;
        date?: string;
        place?: string;
        remark?: string;
      }>;
      if (Array.isArray(history)) {
        for (const h of history.reverse()) {
          events.push({
            status: mapStatus(h.status ?? ""),
            timestamp: h.date ?? new Date().toISOString(),
            location: h.place,
            details: h.remark ?? h.status ?? "",
          });
        }
      }
    }

    return {
      trackingId,
      status,
      events,
      estimatedDelivery,
      deliveryCompany: "Yalidine",
    };
  },

  async cancelShipment(
    trackingId: string,
    creds: DeliveryCredentials,
  ): Promise<{ success: boolean; error?: string }> {
    if (!creds.apiId || !creds.apiToken) {
      return { success: false, error: "Identifiants Yalidine manquants." };
    }
    try {
      const res = await retryFetch(
        `${YALIDINE_BASE}/parcels/${encodeURIComponent(trackingId)}/`,
        {
          method: "DELETE",
          headers: headers(creds),
        },
        FETCH_TIMEOUT_MS,
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { success: false, error: `Erreur ${res.status}: ${text.slice(0, 200)}` };
      }
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "erreur inconnue",
      };
    }
  },
};
