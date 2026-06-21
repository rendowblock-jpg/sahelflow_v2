/**
 * Maystro Delivery adapter — structural stub.
 *
 * Maystro's API shape is similar to Yalidine's (REST + API token auth). The
 * implementation below follows the same pattern; fill in the exact endpoints
 * + request/response shapes from Maystro's API docs when integrating.
 *
 * Credential: delivery_maystro_api_token (single token).
 * Base URL: configurable via MAYSTRO_API_BASE env.
 */

import type {
  DeliveryAdapter,
  DeliveryCredentials,
  DeliveryCostEstimate,
  ShipmentRequest,
  ShipmentResult,
  TrackingInfo,
} from "./types";

// Base URL for when the stub is filled in:
//   process.env.MAYSTRO_API_BASE || "https://api.maystro-delivery.com/api/v1"
// Auth: Bearer token in the Authorization header

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
        error: "Token Maystro manquant. Configurez-le dans Paramètres → Intégrations.",
      };
    }
    // TODO: fill in Maystro's delivery-fee endpoint
    // Typical shape: GET /delivery-fees?wilaya={name}&weight={kg}
    void params;
    return {
      provider: "maystro",
      cost: 0,
      available: false,
      error: "Estimation Maystro non encore implémentée (adaptateur structurel).",
    };
  },

  async createShipment(
    request: ShipmentRequest,
    creds: DeliveryCredentials,
  ): Promise<ShipmentResult> {
    if (!creds.apiToken) {
      return { success: false, trackingId: "", cost: 0, error: "Token Maystro manquant." };
    }
    // TODO: fill in Maystro's create-parcel endpoint
    // Typical shape: POST /parcels with { order_id, customer, items, price, ... }
    void request;
    return {
      success: false,
      trackingId: "",
      cost: 0,
      error: "Création Maystro non encore implémentée (adaptateur structurel).",
    };
  },

  async syncTracking(
    trackingId: string,
    creds: DeliveryCredentials,
  ): Promise<TrackingInfo> {
    if (!creds.apiToken) {
      throw new Error("Token Maystro manquant.");
    }
    // TODO: fill in Maystro's tracking endpoint
    void trackingId;
    throw new Error("Suivi Maystro non encore implémenté (adaptateur structurel).");
  },
};
