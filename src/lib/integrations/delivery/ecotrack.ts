import "server-only";

import type { DeliveryAdapter } from "./types";

export const ecoTrackAdapter: DeliveryAdapter = {
  id: "ecotrack",
  name: "EcoTrack Pro",
  logo: "ecotrack",
  async estimateCost() {
    return { provider: "ecotrack", cost: 0, available: false, error: "EcoTrack adapter not configured" };
  },
  async createShipment() {
    return { success: false, trackingId: "", cost: 0, error: "EcoTrack adapter not configured" };
  },
  async syncTracking(trackingId) {
    return { trackingId, status: "pending", events: [], deliveryCompany: "EcoTrack Pro" };
  },
};
