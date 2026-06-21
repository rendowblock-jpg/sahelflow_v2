/**
 * Delivery integration types — shared across all delivery provider adapters.
 *
 * The adapter pattern (ADR-011, to be documented): each provider implements
 * the DeliveryAdapter interface. Credentials are stored encrypted in the Secret
 * table (per ADR-003/004), keyed by `delivery_<provider>_api_id` etc.
 *
 * Providers (Phase 0 #16, design system Section 6.1):
 *   - Yalidine (fully implemented)
 *   - Maystro Delivery (structural stub — same pattern, fill in API details)
 *   - ZR Express (structural stub — same pattern, fill in API details)
 */

/** Delivery status across all providers (normalized to our taxonomy). */
export type DeliveryStatus =
  | "pending" // Created in our DB, not yet sent to provider
  | "created" // Accepted by provider
  | "picked_up" // Collected from seller
  | "in_transit" // On the way
  | "at_hub" // At distribution center
  | "out_for_delivery" // With delivery driver
  | "delivered" // Successfully delivered
  | "returned" // Returned to sender
  | "refused" // Customer refused
  | "failed"; // Delivery attempt failed

/** Request shape for creating a shipment. */
export interface ShipmentRequest {
  orderId: string;
  orderNumber: string;
  customer: {
    name: string;
    phone: string;
    wilaya: string;
    commune: string;
    address: string;
  };
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalPrice: number; // COD amount to collect (DZD)
  weight: number; // kg
  notes?: string;
  isExchange?: boolean;
}

/** Result of creating a shipment. */
export interface ShipmentResult {
  success: boolean;
  trackingId: string;
  labelUrl?: string;
  estimatedDelivery?: string;
  cost: number; // Delivery cost (DZD)
  error?: string;
}

/** A single tracking event from the provider. */
export interface TrackingEvent {
  status: DeliveryStatus;
  timestamp: string;
  location?: string;
  details: string;
}

/** Full tracking info for a shipment. */
export interface TrackingInfo {
  trackingId: string;
  status: DeliveryStatus;
  events: TrackingEvent[];
  estimatedDelivery?: string;
  deliveryCompany: string;
}

/** Cost estimate for a shipment (before creating). */
export interface DeliveryCostEstimate {
  provider: string;
  cost: number; // DZD
  estimatedDays?: string;
  available: boolean;
  error?: string;
}

/** Credentials for a delivery provider (loaded from the Secret store). */
export interface DeliveryCredentials {
  apiId?: string;
  apiToken?: string;
  apiKey?: string;
  [key: string]: string | undefined;
}

/** The adapter interface every delivery provider implements. */
export interface DeliveryAdapter {
  readonly id: string; // "yalidine" | "maystro" | "zrexpress"
  readonly name: string;
  readonly logo: string;

  /** Estimate the delivery cost for a shipment (wilaya + weight). */
  estimateCost(
    params: { wilaya: string; commune?: string; weight: number; codAmount: number },
    credentials: DeliveryCredentials,
  ): Promise<DeliveryCostEstimate>;

  /** Create a shipment with the provider. Returns tracking + cost. */
  createShipment(
    request: ShipmentRequest,
    credentials: DeliveryCredentials,
  ): Promise<ShipmentResult>;

  /** Fetch the latest tracking info for a shipment. */
  syncTracking(
    trackingId: string,
    credentials: DeliveryCredentials,
  ): Promise<TrackingInfo>;

  /** Cancel a shipment (if supported). */
  cancelShipment?(
    trackingId: string,
    credentials: DeliveryCredentials,
  ): Promise<{ success: boolean; error?: string }>;
}

/** Known provider IDs (convention: lowercase, no spaces). */
export const DELIVERY_PROVIDERS = ["yalidine", "maystro", "zrexpress"] as const;
export type DeliveryProvider = (typeof DELIVERY_PROVIDERS)[number];

/** Secret-store key convention for delivery credentials. */
export function deliverySecretKey(provider: string, field: string): string {
  return `delivery_${provider}_${field}`;
}

/** All secret keys for a provider (used by the credentials loader). */
export function deliverySecretKeys(provider: string): string[] {
  switch (provider) {
    case "yalidine":
      return [deliverySecretKey("yalidine", "api_id"), deliverySecretKey("yalidine", "api_token")];
    case "maystro":
      return [deliverySecretKey("maystro", "api_token")];
    case "zrexpress":
      return [deliverySecretKey("zrexpress", "api_id"), deliverySecretKey("zrexpress", "api_key")];
    default:
      return [];
  }
}
