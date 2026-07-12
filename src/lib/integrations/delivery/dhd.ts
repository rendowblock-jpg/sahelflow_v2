import "server-only";
import { retryFetch } from "./retry";
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

// ============================================================================
// EXPERIMENTAL — W2-10
// ============================================================================
// This adapter is EXPERIMENTAL. DHD does not publish public API docs and the
// founder must email commercialedhd@gmail.com to obtain an API token. The
// endpoints below (/tarification, /add_colis, /lire, /cancel) are UNVERIFIED
// GUESSES based on the EcoTrack white-label shipping platform pattern (DHD
// runs on EcoTrack, which powers 35+ Algerian couriers — the patterns are
// likely correct, but the exact paths / field names may differ on DHD's
// deployment).
//
// Once a real token is obtained:
//   1. Open the DHD dashboard's network tab and watch the real API calls.
//   2. Verify each endpoint below against what the dashboard actually hits.
//   3. Adjust the paths / field names as needed.
//   4. Remove the `isExperimental: true` flag and this comment block.
//
// Until then, the UI shows an "Experimental" badge on the DHD integration
// card so sellers know to verify behaviour before relying on it for
// production shipments.
// ============================================================================
export const DHD_EXPERIMENTAL = true;

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
  // Session 29 fix (AUDIT-6 I3): "Non livré" (not delivered) MUST be checked
  // BEFORE "Livré" (delivered) — otherwise the includes("livré") match catches
  // both and marks failed deliveries as delivered. Same bug pattern that
  // Yalidine was fixed for in Session 25.
  if (s.includes("non livré") || s.includes("non livre") || s.includes("non_livré") || s.includes("non_livre")) return "failed";
  if (s.includes("echec") || s.includes("failed") || s.includes("fail")) return "failed";
  if (s.includes("annul") || s.includes("cancelled") || s.includes("canceled")) return "failed";
  if (s.includes("refus") || s.includes("refused")) return "refused";
  if (s.includes("retour") || s.includes("returned")) return "returned";
  if (s.includes("livré") || s.includes("delivered") || s.includes("livre")) return "delivered";
  if (s.includes("livraison") || s.includes("out") || s.includes("distribution")) return "out_for_delivery";
  if (s.includes("ramass") || s.includes("picked") || s.includes("collected")) return "picked_up";
  if (s.includes("transit") || s.includes("hub") || s.includes("centre")) return "in_transit";
  if (s.includes("nouveau") || s.includes("new") || s.includes("created")) return "created";
  return "pending"; // I-H2: default to pending (consistency with Yalidine/Maystro/ZR Express)
}

export const dhdAdapter: DeliveryAdapter = {
  id: "dhd",
  name: "DHD Delivery",
  logo: "dhd",
  // W2-10: endpoints unverified — see EXPERIMENTAL banner at top of file.
  isExperimental: true,

  async testConnection(credentials: DeliveryCredentials): Promise<{ ok: boolean; message: string }> {
    if (!credentials.apiToken) {
      return { ok: false, message: "DHD API token not configured" };
    }
    try {
      // Reuse the /tarification endpoint with a minimal body — same call
      // pattern as estimateCost, but we only care about whether the API
      // accepts the token (any 2xx = ok, 401/403 = bad token, anything
      // else = transient/network error).
      const res = await retryFetch(`${DHD_BASE_URL}/tarification`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${credentials.apiToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({}),
      }, 15000);
      if (res.ok) {
        return { ok: true, message: "DHD API accepted the token" };
      }
      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => "");
        return { ok: false, message: `DHD rejected the token (${res.status})${text ? `: ${text.slice(0, 120)}` : ""}` };
      }
      // W2-10: EXPERIMENTAL — the endpoint itself may be wrong. A 404 means
      // the path doesn't exist (likely an EcoTrack deployment difference),
      // not that the token is bad. Surface this honestly.
      if (res.status === 404) {
        return {
          ok: false,
          message: "DHD /tarification endpoint returned 404 — the adapter's guessed endpoints may be wrong (see EXPERIMENTAL note). Verify endpoints in the DHD dashboard network tab.",
        };
      }
      const text = await res.text().catch(() => "");
      return { ok: false, message: `DHD API error ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}` };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Network error reaching DHD API",
      };
    }
  },

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
      const res = await retryFetch(`${DHD_BASE_URL}/tarification`, {
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
      }, 15000); // I-H1: retryFetch (3 retries, 15s timeout)

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
      const res = await retryFetch(`${DHD_BASE_URL}/add_colis`, {
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
      }, 15000); // I-H1: retryFetch (3 retries, 15s timeout)

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
    const res = await retryFetch(`${DHD_BASE_URL}/lire/${trackingId}`, {
      headers: {
        "Authorization": `Bearer ${credentials.apiToken}`,
        "Accept": "application/json",
      },
    }, 15000); // I-H1: retryFetch (3 retries, 15s timeout)

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
      const res = await retryFetch(`${DHD_BASE_URL}/cancel/${trackingId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${credentials.apiToken}`,
          "Accept": "application/json",
        },
      }, 15000); // I-H1: retryFetch (3 retries, 15s timeout)

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
