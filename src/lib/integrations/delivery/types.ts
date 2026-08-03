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
 *   - ZR Express
 *   - NOEST Express (provider-issued EcoTrack contract; exact endpoints configured per merchant)
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

/**
 * Result of cancelShipment. The base contract is `{ success, error? }`.
 *
 * W3-11 (ZR Express cancel): providers that don't support API-based
 * cancellation can return a structured result with `action: "open_dashboard"`
 * + `dashboardUrl` + `message` so the UI can show an "Open Dashboard" button
 * instead of a bare error toast. The base `error` field is kept for
 * backward-compat with existing tests/UIs that read `result.error`.
 */
export interface CancelShipmentResult {
  success: boolean;
  error?: string;
  /** Whether the shipment was actually cancelled at the provider. */
  cancelled?: boolean;
  /** When the provider has no API cancellation, UI shows a dashboard link. */
  action?: "open_dashboard";
  /** URL the user can visit to perform the action manually. */
  dashboardUrl?: string;
  /** Human-readable explanation of the action result (i18n-translatable). */
  message?: string;
}

/**
 * Result of testConnection — a lightweight credential-validation call.
 * Used by POST /api/delivery/test-connection + the "Test connection"
 * button in the integrations panel UI.
 */
export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

/** The adapter interface every delivery provider implements. */
export interface DeliveryAdapter {
  readonly id: string; // canonical DeliveryProvider value
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
  ): Promise<CancelShipmentResult>;

  /**
   * W2-10: lightweight "ping" call to validate credentials without
   * creating a shipment. Calls a low-cost endpoint (e.g., list wilayas,
   * get account info). Used by the "Test connection" button in the
   * integrations panel + POST /api/delivery/test-connection.
   */
  testConnection?(credentials: DeliveryCredentials): Promise<TestConnectionResult>;
}

/** Known provider IDs (convention: lowercase, no spaces). */
export const DELIVERY_PROVIDERS = ["yalidine", "maystro", "zrexpress", "noest"] as const;
export type DeliveryProvider = (typeof DELIVERY_PROVIDERS)[number];

/** Secret-store key convention for delivery credentials. */
export function deliverySecretKey(provider: string, field: string): string {
  return `delivery_${provider}_${field}`;
}

/** All secret keys for a provider (used by the credentials loader). */
/**
 * All secret keys for a provider (used by the credentials loader).
 *
 * CRITICAL: the field-name suffix here MUST match:
 *   (a) the key the credentials-save route writes — i.e. the body field name
 *       the UI sends in `credentials: { ... }` (camelCase), AND
 *   (b) the field name the adapter reads (e.g. `creds.apiId`).
 *
 * Session 29 fix (AUDIT-6 I1): previously these used snake_case
 * (`api_id`, `api_token`) while the UI + adapters used camelCase
 * (`apiId`, `apiToken`) -> loader returned snake_case keys -> adapter
 * `creds.apiId` was undefined -> "credentials missing" in production.
 * Tests passed because they bypassed the loader.
 */
export function deliverySecretKeys(provider: string): string[] {
  switch (provider) {
    case "yalidine":
      return [deliverySecretKey("yalidine", "apiId"), deliverySecretKey("yalidine", "apiToken")];
    case "maystro":
      return [deliverySecretKey("maystro", "apiToken")];
    case "zrexpress":
      return [deliverySecretKey("zrexpress", "apiId"), deliverySecretKey("zrexpress", "apiKey")];
    case "noest":
      return [
        deliverySecretKey("noest", "apiToken"),
        deliverySecretKey("noest", "userGuid"),
        deliverySecretKey("noest", "createOrderUrl"),
        deliverySecretKey("noest", "validateOrderUrl"),
        deliverySecretKey("noest", "trackingsUrl"),
        deliverySecretKey("noest", "feesUrl"),
      ];
    default:
      return [];
  }
}
