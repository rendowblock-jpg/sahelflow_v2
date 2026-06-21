/**
 * ZR Express adapter — structural stub.
 *
 * ZR Express's API uses API ID + API Key auth (similar to Yalidine's ID/Token).
 * Fill in the exact endpoints from ZR Express's API docs when integrating.
 *
 * Credentials: delivery_zrexpress_api_id + delivery_zrexpress_api_key.
 * Base URL: configurable via ZREXPRESS_API_BASE env.
 */

import type {
  DeliveryAdapter,
  DeliveryCredentials,
  DeliveryCostEstimate,
  ShipmentRequest,
  ShipmentResult,
  TrackingInfo,
} from "./types";

// Base URL for when the stub is filled in
const _ZREXPRESS_BASE =
  process.env.ZREXPRESS_API_BASE || "https://api.zrexpress.com/api/v1";

export const zrExpressAdapter: DeliveryAdapter = {
  id: "zrexpress",
  name: "ZR Express",
  logo: "📦",

  async estimateCost(
    params: { wilaya: string; commune?: string; weight: number; codAmount: number },
    creds: DeliveryCredentials,
  ): Promise<DeliveryCostEstimate> {
    if (!creds.apiId || !creds.apiKey) {
      return {
        provider: "zrexpress",
        cost: 0,
        available: false,
        error: "Identifiants ZR Express manquants. Configurez-les dans Paramètres → Intégrations.",
      };
    }
    // TODO: fill in ZR Express's delivery-fee endpoint
    void params;
    void _ZREXPRESS_BASE;
    return {
      provider: "zrexpress",
      cost: 0,
      available: false,
      error: "Estimation ZR Express non encore implémentée (adaptateur structurel).",
    };
  },

  async createShipment(
    request: ShipmentRequest,
    creds: DeliveryCredentials,
  ): Promise<ShipmentResult> {
    if (!creds.apiId || !creds.apiKey) {
      return { success: false, trackingId: "", cost: 0, error: "Identifiants ZR Express manquants." };
    }
    // TODO: fill in ZR Express's create-parcel endpoint
    void request;
    return {
      success: false,
      trackingId: "",
      cost: 0,
      error: "Création ZR Express non encore implémentée (adaptateur structurel).",
    };
  },

  async syncTracking(
    trackingId: string,
    creds: DeliveryCredentials,
  ): Promise<TrackingInfo> {
    if (!creds.apiId || !creds.apiKey) {
      throw new Error("Identifiants ZR Express manquants.");
    }
    // TODO: fill in ZR Express's tracking endpoint
    void trackingId;
    throw new Error("Suivi ZR Express non encore implémenté (adaptateur structurel).");
  },
};
