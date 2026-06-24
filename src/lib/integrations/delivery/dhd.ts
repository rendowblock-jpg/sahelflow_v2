import "server-only";
import type {
  DeliveryAdapter,
  DeliveryCredentials,
  DeliveryCostEstimate,
  ShipmentRequest,
  ShipmentResult,
  TrackingInfo,
  TrackingEvent,
  DeliveryStatus,
} from "./types";

/**
 * DHD Delivery adapter — DHD runs on the EcoTrack shared shipping platform
 * (white-label SaaS powering 35+ Algerian couriers).
 *
 * Auth: Bearer token (single token, like Maystro).
 * Base URL: https://platform.dhd-dz.com/api (EcoTrack pattern — may need
 *   adjustment once the founder confirms the exact endpoint).
 *
 * NOTE: DHD does not have public API docs. The founder must email
 * commercialedhd@gmail.com to get an API token. The exact endpoints
 * may differ from what's implemented here — this adapter follows the
 * EcoTrack platform pattern. Once the founder provides a real token,
 * verify the endpoints against the actual API (check the DHD dashboard's
 * network tab for the real API calls).
 */

const DHD_BASE_URL = "https://platform.dhd-dz.com/api";

/** Map DHD/EcoTrack status strings to our normalized DeliveryStatus. */
function mapStatus(raw: string): DeliveryStatus {
  const s = raw.toLowerCase().trim();
  // EcoTrack common status codes (may vary — adjust after live testing)
  if (s.includes("nouveau") || s.includes("new") || s.includes("created")) return "created";
  if (s.includes("ramass") || s.includes("picked") || s.includes("collected")) return "picked_up";
  if (s.includes("transit") || s.includes("hub") || s.includes("centre")) return "in_transit";
  if (s.includes("livraison") || s.includes("out") || s.includes("distribution")) return "out_for_delivery";
  if (s.includes("livré") || s.includes("delivered") || s.includes("livre")) return "delivered";
  if (s.includes("retour") || s.includes("returned")) return "returned";
  if (s.includes("refus") || s.includes("refused")) return "refused";
  if (s.includes("annul") || s.includes("cancelled") || s.includes("canceled")) return "failed";
  if (s.includes("echec") || s.includes("failed") || s.includes("fail")) return "failed";
  return "in_transit"; // default to in-transit for unknown statuses
}

export const dhdAdapter: DeliveryAdapter = {
  id: "dhd",
  name: "DHD Delivery",
  logo: "dhd",

  async estimateCost(
    params: { wilaya: string; commune?: string; weight: number; codAmount: number },
    credentials: DeliveryCredentials,
  ): Promise<DeliveryCostEstimate> {
    if (!credentials.apiToken) {
      return {
        provider: "dhd",
        cost: 0,
        available: false,
        error: "DHD API token not configured",
      };
    }

    try {
      // EcoTrack pattern: POST /tarification or GET /pricing
      // Adjust endpoint after confirming with DHD's actual API
      const res = await fetch(`${DHD_BASE_URL}/tarification`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${credentials.apiToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          wilaya: params.wilaya,
          commune: params.commune,
          poids: params.weight, // weight in kg (French: "poids")
          montant: params.codAmount, // COD amount (French: "montant")
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          provider: "dhd",
          cost: 0,
          available: false,
          error: `DHD API error ${res.status}: ${text.slice(0, 200)}`,
        };
      }

      const data = await res.json() as { prix?: number; tarif?: number; price?: number; estimated_days?: string };
      const cost = data.prix ?? data.tarif ?? data.price ?? 0;

      return {
        provider: "dhd",
        cost,
        estimatedDays: data.estimated_days,
        available: true,
      };
    } catch (err) {
      return {
        provider: "dhd",
        cost: 0,
        available: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  },

  async createShipment(
    request: ShipmentRequest,
    credentials: DeliveryCredentials,
  ): Promise<ShipmentResult> {
    if (!credentials.apiToken) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: "DHD API token not configured",
      };
    }

    try {
      // EcoTrack pattern: POST /add_colis or POST /shipments
      // French field names common on EcoTrack platforms
      const res = await fetch(`${DHD_BASE_URL}/add_colis`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${credentials.apiToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          nom: request.customer.name, // name
          telephone: request.customer.phone, // phone
          wilaya: request.customer.wilaya,
          commune: request.customer.commune,
          adresse: request.customer.address, // address
          montant: request.totalPrice, // COD amount
          poids: request.weight, // weight
          note: request.notes ?? "",
          produits: request.items.map((i) => `${i.name} x${i.quantity}`).join(", "),
          type: request.isExchange ? "echange" : "livraison",
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `DHD API error ${res.status}: ${text.slice(0, 200)}`,
        };
      }

      const data = await res.json() as {
        tracking?: string;
        code_suivi?: string;
        id?: string | number;
        prix?: number;
        tarif?: number;
        label_url?: string;
        error?: string;
      };

      if (data.error) {
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: data.error,
        };
      }

      const trackingId = data.tracking ?? data.code_suivi ?? String(data.id ?? "");
      const cost = data.prix ?? data.tarif ?? 0;

      return {
        success: true,
        trackingId,
        labelUrl: data.label_url,
        cost,
      };
    } catch (err) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  },

  async syncTracking(
    trackingId: string,
    credentials: DeliveryCredentials,
  ): Promise<TrackingInfo> {
    if (!credentials.apiToken) {
      throw new Error("DHD API token not configured");
    }

    // EcoTrack pattern: GET /lire/{tracking} or GET /tracking/{tracking}
    const res = await fetch(`${DHD_BASE_URL}/lire/${trackingId}`, {
      headers: {
        "Authorization": `Bearer ${credentials.apiToken}`,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`DHD tracking API error: ${res.status}`);
    }

    const data = await res.json() as {
      statut?: string;
      status?: string;
      situation?: string;
      historique?: Array<{ statut: string; date: string; lieu?: string }>;
      events?: Array<{ status: string; timestamp: string; location?: string }>;
    };

    const rawStatus = data.statut ?? data.status ?? data.situation ?? "in_transit";
    const status = mapStatus(rawStatus);

    const history: Array<Record<string, string>> = (data.historique ?? data.events ?? []) as Array<Record<string, string>>;
    const events: TrackingEvent[] = history.map((e) => ({
      status: mapStatus(e.statut ?? e.status ?? "in_transit"),
      timestamp: e.date ?? e.timestamp ?? new Date().toISOString(),
      location: e.lieu ?? e.location,
      details: e.statut ?? e.status ?? "",
    }));

    // Add a current event if history is empty
    if (events.length === 0) {
      events.push({
        status,
        timestamp: new Date().toISOString(),
        details: rawStatus,
      });
    }

    return {
      trackingId,
      status,
      events,
      deliveryCompany: "DHD Delivery",
    };
  },

  async cancelShipment(
    trackingId: string,
    credentials: DeliveryCredentials,
  ): Promise<{ success: boolean; error?: string }> {
    if (!credentials.apiToken) {
      return { success: false, error: "DHD API token not configured" };
    }

    try {
      // EcoTrack pattern: PUT /cancel/{tracking} or PATCH /cancel
      const res = await fetch(`${DHD_BASE_URL}/cancel/${trackingId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${credentials.apiToken}`,
          "Accept": "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          success: false,
          error: `DHD cancel API error ${res.status}: ${text.slice(0, 200)}`,
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  },
};
