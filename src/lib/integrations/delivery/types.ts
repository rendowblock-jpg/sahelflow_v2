/**
 * Delivery integration types shared by every courier transport.
 *
 * EcoTrack-backed courier brands are profile data below the `ecotrack`
 * transport. Historical `noest` persistence is accepted only through the
 * explicit one-way compatibility normalizer below; new API/UI writes cannot
 * create `noest` as a provider identity.
 */

export type DeliveryStatus =
  | "pending"
  | "created"
  | "picked_up"
  | "in_transit"
  | "at_hub"
  | "out_for_delivery"
  | "delivered"
  | "returned"
  | "refused"
  | "failed";

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
  totalPrice: number;
  weight: number;
  notes?: string;
  isExchange?: boolean;
}

export interface ShipmentResult {
  success: boolean;
  trackingId: string;
  labelUrl?: string;
  estimatedDelivery?: string;
  cost: number;
  error?: string;
}

export interface TrackingEvent {
  status: DeliveryStatus;
  timestamp: string;
  location?: string;
  details: string;
}

export interface TrackingInfo {
  trackingId: string;
  status: DeliveryStatus;
  events: TrackingEvent[];
  estimatedDelivery?: string;
  deliveryCompany: string;
}

export interface DeliveryCostEstimate {
  provider: string;
  cost: number;
  estimatedDays?: string;
  available: boolean;
  error?: string;
}

export interface DeliveryCredentials {
  apiId?: string;
  apiToken?: string;
  apiKey?: string;
  [key: string]: string | undefined;
}

export interface CancelShipmentResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
  action?: "open_dashboard";
  dashboardUrl?: string;
  message?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export interface DeliveryAdapter {
  readonly id: string;
  readonly name: string;
  readonly logo: string;
  estimateCost(
    params: {
      wilaya: string;
      commune?: string;
      weight: number;
      codAmount: number;
    },
    credentials: DeliveryCredentials,
  ): Promise<DeliveryCostEstimate>;
  createShipment(
    request: ShipmentRequest,
    credentials: DeliveryCredentials,
  ): Promise<ShipmentResult>;
  syncTracking(
    trackingId: string,
    credentials: DeliveryCredentials,
  ): Promise<TrackingInfo>;
  cancelShipment?(
    trackingId: string,
    credentials: DeliveryCredentials,
  ): Promise<CancelShipmentResult>;
  testConnection?(
    credentials: DeliveryCredentials,
  ): Promise<TestConnectionResult>;
}

export const DELIVERY_PROVIDERS = [
  "yalidine",
  "maystro",
  "zrexpress",
  "ecotrack",
] as const;
export type DeliveryProvider = (typeof DELIVERY_PROVIDERS)[number];

/**
 * Read-compatibility only. This keeps historical shipment rows recoverable
 * while making `ecotrack` the sole runtime/product identity for this contract.
 */
export function normalizeDeliveryProvider(
  provider: string,
): DeliveryProvider | null {
  if (provider === "noest") return "ecotrack";
  return DELIVERY_PROVIDERS.includes(provider as DeliveryProvider)
    ? (provider as DeliveryProvider)
    : null;
}

export function deliverySecretKey(provider: string, field: string): string {
  return `delivery_${provider}_${field}`;
}

export function deliverySecretKeys(provider: string): string[] {
  switch (provider) {
    case "yalidine":
      return [
        deliverySecretKey("yalidine", "apiId"),
        deliverySecretKey("yalidine", "apiToken"),
      ];
    case "maystro":
      return [deliverySecretKey("maystro", "apiToken")];
    case "zrexpress":
      return [
        deliverySecretKey("zrexpress", "apiId"),
        deliverySecretKey("zrexpress", "apiKey"),
      ];
    case "ecotrack":
      return [
        deliverySecretKey("ecotrack", "carrierName"),
        deliverySecretKey("ecotrack", "apiToken"),
        deliverySecretKey("ecotrack", "userGuid"),
        deliverySecretKey("ecotrack", "createOrderUrl"),
        deliverySecretKey("ecotrack", "validateOrderUrl"),
        deliverySecretKey("ecotrack", "trackingsUrl"),
        deliverySecretKey("ecotrack", "feesUrl"),
      ];
    default:
      return [];
  }
}

/** Internal migration input only; never expose these keys as a provider. */
export function legacyNoestSecretKeys(): string[] {
  return [
    "apiToken",
    "userGuid",
    "createOrderUrl",
    "validateOrderUrl",
    "trackingsUrl",
    "feesUrl",
  ].map((field) => deliverySecretKey("noest", field));
}
