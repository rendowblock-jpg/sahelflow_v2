/**
 * SahelFlow Delivery Company Integration
 *
 * Abstract adapter for Algerian delivery companies (Yalidine).
 * Handles shipment creation, tracking, label generation, and status sync.
 */

// ===== TYPES =====

export type DeliveryStatus =
  | "pending" // Created, not yet picked up
  | "created" // Record created in delivery company system
  | "picked_up" // Collected from seller
  | "in_transit" // On the way
  | "at_hub" // At distribution center
  | "out_for_delivery" // With delivery driver
  | "delivered" // Successfully delivered
  | "returned" // Returned to sender
  | "refused" // Customer refused delivery
  | "failed"; // Delivery attempt failed

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
  totalPrice: number; // COD amount to collect
  weight: number; // kg
  notes?: string;
  isExchange?: boolean;
}

export interface ShipmentResult {
  success: boolean;
  trackingId: string;
  labelUrl?: string;
  estimatedDelivery?: string;
  cost: number; // Delivery cost in DA
  error?: string;
}

export interface TrackingEvent {
  status: DeliveryStatus;
  timestamp: string;
  location: string;
  details: string;
}

export interface TrackingInfo {
  trackingId: string;
  status: DeliveryStatus;
  events: TrackingEvent[];
  estimatedDelivery?: string;
  deliveryCompany: string;
}

export interface DeliveryCompanyConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  isActive: boolean;
}

// ===== ABSTRACT ADAPTER =====

export abstract class DeliveryAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly logo: string;

  abstract createShipment(
    request: ShipmentRequest,
    credentials?: Record<string, unknown>,
  ): Promise<ShipmentResult>;
  abstract getTracking(
    trackingId: string,
    credentials?: Record<string, unknown>,
  ): Promise<TrackingInfo>;
  abstract cancelShipment(
    trackingId: string,
    credentials?: Record<string, unknown>,
  ): Promise<{ success: boolean }>;
  abstract getDeliveryCost(
    fromWilaya: string,
    toWilaya: string,
    weight: number,
    credentials?: Record<string, unknown>,
  ): Promise<number>;

  getStatusLabel(status: DeliveryStatus): string {
    const labels: Record<DeliveryStatus, string> = {
      pending: "En attente",
      created: "Créé",
      picked_up: "Récupéré",
      in_transit: "En transit",
      at_hub: "Au hub",
      out_for_delivery: "En livraison",
      delivered: "Livré",
      returned: "Retourné",
      refused: "Refusé",
      failed: "Échec",
    };
    return labels[status];
  }
}

// ===== YALIDINE ADAPTER =====

import { getCommuneCode } from "./yalidine-communes";

const YALIDINE_BASE = "https://api.yalidine.app/v1";

export class YalidineAdapter extends DeliveryAdapter {
  readonly id = "yalidine";
  readonly name = "Yalidine";
  readonly logo = "📦";

  private headers(
    credentials: Record<string, unknown>,
  ): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-API-ID": String(credentials.api_id || ""),
      "X-API-TOKEN": String(credentials.api_token || ""),
    };
  }

  async createShipment(
    request: ShipmentRequest,
    credentials?: Record<string, unknown>,
  ): Promise<ShipmentResult> {
    if (!credentials?.api_id || !credentials?.api_token) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: "Missing Yalidine API credentials",
      };
    }

    // Resolve commune code if available
    let communeValue: string | number = request.customer.commune;
    try {
      const code = await getCommuneCode(
        request.customer.wilaya,
        request.customer.commune,
        {
          api_id: String(credentials.api_id),
          api_token: String(credentials.api_token),
        },
      );
      if (code) communeValue = code;
    } catch {
      /* fallback to string name */
    }

    const body = [
      {
        order_id: request.orderNumber,
        firstname: request.customer.name.split(" ")[0] || request.customer.name,
        lastname: request.customer.name.split(" ").slice(1).join(" ") || "",
        address: request.customer.address,
        wilaya: request.customer.wilaya,
        commune: communeValue,
        phone: request.customer.phone,
        phone_2: "",
        product: request.items
          .map((i) => `${i.name} x${i.quantity}`)
          .join(", "),
        price: request.totalPrice,
        weight: request.weight,
        note: request.notes || "",
        is_exchange: request.isExchange || false,
      },
    ];

    try {
      const res = await fetch(`${YALIDINE_BASE}/parcels/`, {
        method: "POST",
        headers: this.headers(credentials),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `Yalidine API error: ${res.status} ${text}`,
        };
      }

      const data = await res.json();
      const parcel = Array.isArray(data) ? data[0] : data;

      return {
        success: true,
        trackingId: parcel.tracking || parcel.tracking_id || "",
        labelUrl: parcel.label_url || parcel.delivery_label || undefined,
        estimatedDelivery: parcel.estimated_delivery || undefined,
        cost: Number(parcel.price) || 0,
      };
    } catch (e) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: (e as Error).message,
      };
    }
  }

  async getTracking(
    trackingId: string,
    credentials?: Record<string, unknown>,
  ): Promise<TrackingInfo> {
    if (!credentials?.api_id || !credentials?.api_token) {
      return {
        trackingId,
        status: "pending",
        deliveryCompany: "Yalidine",
        events: [],
      };
    }

    try {
      const res = await fetch(
        `${YALIDINE_BASE}/histories/?tracking=${encodeURIComponent(trackingId)}`,
        {
          method: "GET",
          headers: this.headers(credentials),
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!res.ok) {
        return {
          trackingId,
          status: "pending",
          deliveryCompany: "Yalidine",
          events: [],
        };
      }

      const data = await res.json();
      const histories = Array.isArray(data) ? data : data.data || [];

      const statusMap: Record<string, DeliveryStatus> = {
        Enregistre: "pending",
        Récupéré: "picked_up",
        Recupere: "picked_up",
        "En transit": "in_transit",
        "Au hub": "at_hub",
        "En livraison": "out_for_delivery",
        Livré: "delivered",
        Livre: "delivered",
        Retourné: "returned",
        Retourne: "returned",
        Refusé: "refused",
        Refuse: "refused",
      };

      const events: TrackingEvent[] = histories.map(
        (h: Record<string, unknown>) => ({
          status:
            statusMap[String(h.status || h.current_status || "")] || "pending",
          timestamp: String(h.date || h.created_at || new Date().toISOString()),
          location: String(h.wilaya || h.location || ""),
          details: String(h.status || h.current_status || h.details || ""),
        }),
      );

      const lastStatus =
        events.length > 0 ? events[events.length - 1].status : "pending";

      return {
        trackingId,
        status: lastStatus,
        deliveryCompany: "Yalidine",
        events,
      };
    } catch {
      return {
        trackingId,
        status: "pending",
        deliveryCompany: "Yalidine",
        events: [],
      };
    }
  }

  async cancelShipment(
    trackingId: string,
    credentials?: Record<string, unknown>,
  ): Promise<{ success: boolean }> {
    if (!credentials?.api_id || !credentials?.api_token) {
      return { success: false };
    }

    try {
      const res = await fetch(
        `${YALIDINE_BASE}/parcels/${encodeURIComponent(trackingId)}/`,
        {
          method: "DELETE",
          headers: this.headers(credentials),
          signal: AbortSignal.timeout(15000),
        },
      );
      return { success: res.ok };
    } catch {
      return { success: false };
    }
  }

  async getDeliveryCost(
    fromWilaya: string,
    toWilaya: string,
    weight: number,
    credentials?: Record<string, unknown>,
  ): Promise<number> {
    if (!credentials?.api_id || !credentials?.api_token) {
      return 0;
    }

    try {
      const params = new URLSearchParams({
        from_wilaya_name: fromWilaya,
        to_wilaya_name: toWilaya,
        weight: String(weight),
      });

      const res = await fetch(`${YALIDINE_BASE}/deliveryfees/?${params}`, {
        method: "GET",
        headers: this.headers(credentials),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return 0;

      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return Number(data[0].price || data[0].cost || 0);
      }
      if (data.price) return Number(data.price);
      if (data.cost) return Number(data.cost);
      return 0;
    } catch {
      return 0;
    }
  }
}

// ===== ZR EXPRESS ADAPTER (Procolis API) =====

const ZR_BASE = "https://procolis.com/api_v1";

export class ZRExpressAdapter extends DeliveryAdapter {
  readonly id = "zrexpress";
  readonly name = "ZR Express";
  readonly logo = "✈️";

  private headers(
    credentials: Record<string, unknown>,
  ): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-API-ID": String(credentials.api_id || ""),
      "X-API-KEY": String(credentials.api_key || ""),
    };
  }

  async createShipment(
    request: ShipmentRequest,
    credentials?: Record<string, unknown>,
  ): Promise<ShipmentResult> {
    if (!credentials?.api_id || !credentials?.api_key) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error:
          "Missing ZR Express API credentials. Get your API ID and Key from procolis.com → Settings → API, then paste them below.",
      };
    }
    try {
      const res = await fetch(`${ZR_BASE}/shipment/create`, {
        method: "POST",
        headers: this.headers(credentials),
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          reference: request.orderNumber,
          nom: request.customer.name,
          telephone: request.customer.phone,
          wilaya: request.customer.wilaya,
          commune: request.customer.commune,
          adresse: request.customer.address,
          montant: request.totalPrice,
          poids: request.weight,
          designation: request.items
            .map((i) => `${i.name} x${i.quantity}`)
            .join(", "),
          remarque: request.notes || "",
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `ZR Express API: ${res.status} ${text}`,
        };
      }
      const data = await res.json();
      return {
        success: true,
        trackingId: data.tracking || data.bordereau || data.id || "",
        labelUrl: data.label_url || data.pdf_url || undefined,
        cost: Number(data.frais || data.tarif || 0),
      };
    } catch (e) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: (e as Error).message,
      };
    }
  }

  async getTracking(
    trackingId: string,
    credentials?: Record<string, unknown>,
  ): Promise<TrackingInfo> {
    if (!credentials?.api_id || !credentials?.api_key)
      return {
        trackingId,
        status: "pending",
        deliveryCompany: "ZR Express",
        events: [],
      };
    try {
      const res = await fetch(
        `${ZR_BASE}/shipment/tracking/${encodeURIComponent(trackingId)}`,
        {
          headers: this.headers(credentials),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok)
        return {
          trackingId,
          status: "pending",
          deliveryCompany: "ZR Express",
          events: [],
        };
      const data = await res.json();
      const sm: Record<string, DeliveryStatus> = {
        Nouveau: "pending",
        Ramassé: "picked_up",
        "En transit": "in_transit",
        "Au hub": "at_hub",
        "En cours de livraison": "out_for_delivery",
        Livré: "delivered",
        Retourné: "returned",
        Refusé: "refused",
      };
      return {
        trackingId,
        status: sm[String(data.statut || data.status || "")] || "pending",
        deliveryCompany: "ZR Express",
        events: Array.isArray(data.historique)
          ? data.historique.map((h: Record<string, unknown>) => ({
              status: sm[String(h.statut || "")] || "pending",
              timestamp: String(h.date || ""),
              location: String(h.centre || h.wilaya || ""),
              details: String(h.statut || ""),
            }))
          : [],
      };
    } catch {
      return {
        trackingId,
        status: "pending",
        deliveryCompany: "ZR Express",
        events: [],
      };
    }
  }

  async cancelShipment(
    trackingId: string,
    credentials?: Record<string, unknown>,
  ): Promise<{ success: boolean }> {
    if (!credentials?.api_id || !credentials?.api_key)
      return { success: false };
    try {
      const r = await fetch(
        `${ZR_BASE}/shipment/delete/${encodeURIComponent(trackingId)}`,
        {
          method: "DELETE",
          headers: this.headers(credentials),
          signal: AbortSignal.timeout(15000),
        },
      );
      return { success: r.ok };
    } catch {
      return { success: false };
    }
  }

  async getDeliveryCost(
    _from: string,
    to: string,
    _w: number,
    credentials?: Record<string, unknown>,
  ): Promise<number> {
    if (!credentials?.api_id || !credentials?.api_key) return 0;
    try {
      const r = await fetch(
        `${ZR_BASE}/deliveryfees/${encodeURIComponent(to)}`,
        {
          headers: this.headers(credentials),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!r.ok) return 0;
      const d = await r.json();
      return Number(d.tarif_domicile || d.tarif || 0);
    } catch {
      return 0;
    }
  }
}

// ===== MAYSTRO ADAPTER =====

const MAYSTRO_BASE = "https://api.maystro-delivery.com/v1";

export class MaystroAdapter extends DeliveryAdapter {
  readonly id = "maystro";
  readonly name = "Maystro Delivery";
  readonly logo = "🚚";

  private headers(
    credentials: Record<string, unknown>,
  ): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${String(credentials.api_token || "")}`,
    };
  }

  async createShipment(
    request: ShipmentRequest,
    credentials?: Record<string, unknown>,
  ): Promise<ShipmentResult> {
    if (!credentials?.api_token) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error:
          "Missing Maystro API token. Contact Maystro (https://maystro-delivery.com) to get API access, then paste your token below.",
      };
    }
    try {
      const res = await fetch(`${MAYSTRO_BASE}/shipments`, {
        method: "POST",
        headers: this.headers(credentials),
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          reference: request.orderNumber,
          recipient_name: request.customer.name,
          recipient_phone: request.customer.phone,
          wilaya: request.customer.wilaya,
          commune: request.customer.commune,
          address: request.customer.address,
          cod_amount: request.totalPrice,
          weight: request.weight,
          products: request.items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
          })),
          notes: request.notes || "",
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `Maystro API: ${res.status} ${text}`,
        };
      }
      const data = await res.json();
      return {
        success: true,
        trackingId: data.tracking_number || data.id || "",
        labelUrl: data.label_url || undefined,
        cost: Number(data.delivery_fee || 0),
      };
    } catch (e) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: (e as Error).message,
      };
    }
  }

  async getTracking(
    trackingId: string,
    credentials?: Record<string, unknown>,
  ): Promise<TrackingInfo> {
    if (!credentials?.api_token)
      return {
        trackingId,
        status: "pending",
        deliveryCompany: "Maystro",
        events: [],
      };
    try {
      const res = await fetch(
        `${MAYSTRO_BASE}/shipments/${encodeURIComponent(trackingId)}/tracking`,
        {
          headers: this.headers(credentials),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok)
        return {
          trackingId,
          status: "pending",
          deliveryCompany: "Maystro",
          events: [],
        };
      const data = await res.json();
      const sm: Record<string, DeliveryStatus> = {
        pending: "pending",
        picked_up: "picked_up",
        in_transit: "in_transit",
        at_hub: "at_hub",
        out_for_delivery: "out_for_delivery",
        delivered: "delivered",
        returned: "returned",
        refused: "refused",
      };
      return {
        trackingId,
        status: sm[String(data.status || "")] || "pending",
        deliveryCompany: "Maystro",
        events: Array.isArray(data.events)
          ? data.events.map((h: Record<string, unknown>) => ({
              status: sm[String(h.status || "")] || "pending",
              timestamp: String(h.timestamp || h.date || ""),
              location: String(h.location || ""),
              details: String(h.description || h.status || ""),
            }))
          : [],
      };
    } catch {
      return {
        trackingId,
        status: "pending",
        deliveryCompany: "Maystro",
        events: [],
      };
    }
  }

  async cancelShipment(
    trackingId: string,
    credentials?: Record<string, unknown>,
  ): Promise<{ success: boolean }> {
    if (!credentials?.api_token) return { success: false };
    try {
      const r = await fetch(
        `${MAYSTRO_BASE}/shipments/${encodeURIComponent(trackingId)}/cancel`,
        {
          method: "POST",
          headers: this.headers(credentials),
          signal: AbortSignal.timeout(15000),
        },
      );
      return { success: r.ok };
    } catch {
      return { success: false };
    }
  }

  async getDeliveryCost(
    _from: string,
    to: string,
    _w: number,
    credentials?: Record<string, unknown>,
  ): Promise<number> {
    if (!credentials?.api_token) return 0;
    try {
      const r = await fetch(
        `${MAYSTRO_BASE}/pricing?wilaya=${encodeURIComponent(to)}`,
        {
          headers: this.headers(credentials),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!r.ok) return 0;
      const d = await r.json();
      return Number(d.home_delivery || d.desk_delivery || 0);
    } catch {
      return 0;
    }
  }
}

// ===== REGISTRY =====

const adapters = new Map<string, DeliveryAdapter>();

export function registerDeliveryAdapter(adapter: DeliveryAdapter) {
  adapters.set(adapter.id, adapter);
}

export function getDeliveryAdapter(id: string): DeliveryAdapter | undefined {
  return adapters.get(id);
}

export function getAllDeliveryAdapters(): DeliveryAdapter[] {
  return Array.from(adapters.values());
}

// Register all adapters
registerDeliveryAdapter(new YalidineAdapter());
registerDeliveryAdapter(new ZRExpressAdapter());
registerDeliveryAdapter(new MaystroAdapter());
