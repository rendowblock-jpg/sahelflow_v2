import "server-only";

import wilayas from "../../../../data/wilayas.json";
import { SahelFlowError } from "@/types/errors";
import { retryFetch } from "./retry";
import type {
  DeliveryAdapter,
  DeliveryCredentials,
  DeliveryCostEstimate,
  DeliveryStatus,
  ShipmentResult,
  TrackingEvent,
  TrackingInfo,
} from "./types";

const TIMEOUT_MS = 15_000;

type EcoTrackCredentials = DeliveryCredentials & {
  carrierName?: string;
  apiToken?: string;
  userGuid?: string;
  createOrderUrl?: string;
  validateOrderUrl?: string;
  trackingsUrl?: string;
  feesUrl?: string;
};

type EcoTrackResponse = {
  success?: boolean;
  tracking?: string;
  message?: string;
  error?: string;
};
type EcoTrackActivity = {
  event_key?: string;
  event?: string;
  date?: string;
  name?: string;
  driver?: string;
};
type EcoTrackTracking = {
  OrderInfo?: { tracking?: string };
  activity?: EcoTrackActivity[];
};
type EcoTrackFees = {
  tarifs?: {
    delivery?: Record<
      string,
      { tarif?: string | number; tarif_stopdesk?: string | number }
    >;
  };
};

function carrier(credentials: EcoTrackCredentials): string {
  return credentials.carrierName?.trim() || "EcoTrack courier";
}

function identity(credentials: EcoTrackCredentials): {
  apiToken: string;
  userGuid: string;
} {
  const apiToken = credentials.apiToken?.trim();
  const userGuid = credentials.userGuid?.trim();
  if (!apiToken || !userGuid) {
    throw new SahelFlowError(
      "EcoTrack API token and user GUID are required.",
      "ECOTRACK_CREDENTIALS_MISSING",
      409,
    );
  }
  return { apiToken, userGuid };
}

function endpoint(value: string | undefined, label: string): URL {
  if (!value?.trim()) {
    throw new SahelFlowError(
      `EcoTrack ${label} is not configured.`,
      "ECOTRACK_ENDPOINT_NOT_CONFIGURED",
      409,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SahelFlowError(
      `EcoTrack ${label} is not a valid URL.`,
      "ECOTRACK_ENDPOINT_INVALID",
      409,
    );
  }
  if (parsed.protocol !== "https:") {
    throw new SahelFlowError(
      `EcoTrack ${label} must use HTTPS.`,
      "ECOTRACK_ENDPOINT_INSECURE",
      409,
    );
  }
  return parsed;
}

function endpoints(credentials: EcoTrackCredentials) {
  const result = {
    create: endpoint(credentials.createOrderUrl, "create-order URL"),
    validate: endpoint(credentials.validateOrderUrl, "validate-order URL"),
    track: endpoint(credentials.trackingsUrl, "trackings URL"),
    fees: endpoint(credentials.feesUrl, "fees URL"),
  };
  const origins = new Set(Object.values(result).map((value) => value.origin));
  if (origins.size !== 1) {
    throw new SahelFlowError(
      "EcoTrack operation URLs must share one HTTPS origin.",
      "ECOTRACK_ENDPOINT_ORIGIN_MISMATCH",
      409,
    );
  }
  return result;
}

function body(
  auth: { apiToken: string; userGuid: string },
  values: Record<string, string | number | boolean | undefined> = {},
): URLSearchParams {
  const params = new URLSearchParams({
    api_token: auth.apiToken,
    user_guid: auth.userGuid,
  });
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params;
}

function wilayaCode(value: string): number | null {
  const normalized = value.trim().toLocaleLowerCase("fr");
  const match = wilayas.find(
    (item) =>
      item.name.toLocaleLowerCase("fr") === normalized ||
      item.nameAr.trim() === value.trim() ||
      String(item.code) === value.trim(),
  );
  return match?.code ?? null;
}

function status(activity: EcoTrackActivity): DeliveryStatus {
  const text = `${activity.event_key ?? ""} ${activity.event ?? ""}`
    .trim()
    .toLowerCase();
  if (/refus|non.?livr/.test(text)) return "refused";
  if (/livr(ed|e|é)|\blivre\b/.test(text)) return "delivered";
  if (/not_received|echec|échoué|suspendu/.test(text)) return "failed";
  if (/retour|return/.test(text)) return "returned";
  if (/fdr_activated|en livraison|redispatch|mise_a_jour/.test(text)) {
    return "out_for_delivery";
  }
  if (/ramass|collect|pickedup|pickup_picked/.test(text)) return "picked_up";
  if (/transit|reception|enlevé|enleve/.test(text)) return "in_transit";
  if (/customer_validation|validé|valide/.test(text)) return "created";
  return "pending";
}

async function json<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new SahelFlowError(
      "EcoTrack returned an invalid JSON response.",
      "ECOTRACK_INVALID_RESPONSE",
      502,
    );
  }
}

function message(data: EcoTrackResponse, fallback: string): string {
  return data.message?.trim() || data.error?.trim() || fallback;
}

export const ecoTrackAdapter: DeliveryAdapter = {
  id: "ecotrack",
  name: "EcoTrack Pro",
  logo: "ecotrack",

  async testConnection(credentials) {
    try {
      const creds = credentials as EcoTrackCredentials;
      const auth = identity(creds);
      const urls = endpoints(creds);
      const response = await retryFetch(
        urls.fees.toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body(auth),
        },
        TIMEOUT_MS,
      );
      if (!response.ok) {
        return {
          ok: false,
          message: `EcoTrack connection test failed with HTTP ${response.status}.`,
        };
      }
      const data = await json<EcoTrackFees>(response);
      if (!data.tarifs?.delivery || typeof data.tarifs.delivery !== "object") {
        return {
          ok: false,
          message:
            "EcoTrack credentials were accepted but the fees response did not match the configured contract.",
        };
      }
      return {
        ok: true,
        message: `${carrier(creds)} EcoTrack contract verified.`,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "EcoTrack connection failed.",
      };
    }
  },

  async estimateCost(params, credentials): Promise<DeliveryCostEstimate> {
    try {
      const creds = credentials as EcoTrackCredentials;
      const auth = identity(creds);
      const urls = endpoints(creds);
      const code = wilayaCode(params.wilaya);
      if (!code) {
        return {
          provider: "ecotrack",
          cost: 0,
          available: false,
          error: `Unknown wilaya: ${params.wilaya}`,
        };
      }
      const response = await retryFetch(
        urls.fees.toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body(auth),
        },
        TIMEOUT_MS,
      );
      if (!response.ok) {
        return {
          provider: "ecotrack",
          cost: 0,
          available: false,
          error: `EcoTrack fees request failed with HTTP ${response.status}.`,
        };
      }
      const data = await json<EcoTrackFees>(response);
      const fee = data.tarifs?.delivery?.[String(code)]?.tarif;
      const cost = typeof fee === "number" ? fee : Number(fee);
      if (!Number.isFinite(cost) || cost < 0) {
        return {
          provider: "ecotrack",
          cost: 0,
          available: false,
          error: `${carrier(creds)} has no home-delivery tariff for wilaya ${code}.`,
        };
      }
      return {
        provider: "ecotrack",
        cost: Math.round(cost),
        available: true,
      };
    } catch (error) {
      return {
        provider: "ecotrack",
        cost: 0,
        available: false,
        error:
          error instanceof Error ? error.message : "EcoTrack fees request failed.",
      };
    }
  },

  async createShipment(request, credentials): Promise<ShipmentResult> {
    const creds = credentials as EcoTrackCredentials;
    const auth = identity(creds);
    const urls = endpoints(creds);
    const code = wilayaCode(request.customer.wilaya);
    if (!code) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: `Unknown wilaya: ${request.customer.wilaya}`,
      };
    }

    let response: Response;
    try {
      response = await retryFetch(
        urls.create.toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body(auth, {
            reference: request.orderNumber,
            client: request.customer.name,
            phone: request.customer.phone,
            adresse: request.customer.address,
            wilaya_id: code,
            commune: request.customer.commune,
            montant: request.totalPrice,
            remarque: request.notes ?? "",
            produit: request.items
              .map((item) => `${item.name} x${item.quantity}`)
              .join(", "),
            type_id: request.isExchange ? 2 : 1,
            poids: Math.max(1, Math.ceil(request.weight)),
            stop_desk: 0,
            stock: 0,
            can_open: 0,
          }),
        },
        TIMEOUT_MS,
      );
    } catch (error) {
      throw new SahelFlowError(
        error instanceof Error ? error.message : "EcoTrack create outcome is unknown.",
        "ECOTRACK_CREATE_OUTCOME_AMBIGUOUS",
        502,
      );
    }

    if (!response.ok) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: `EcoTrack rejected shipment creation with HTTP ${response.status}.`,
      };
    }
    const created = await json<EcoTrackResponse>(response);
    const tracking = created.tracking?.trim() ?? "";
    if (!created.success || !tracking) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: message(created, "EcoTrack rejected shipment creation."),
      };
    }

    try {
      const validation = await retryFetch(
        urls.validate.toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body(auth, { tracking }),
        },
        TIMEOUT_MS,
      );
      if (!validation.ok) {
        throw new SahelFlowError(
          `EcoTrack created ${tracking}, but validation returned HTTP ${validation.status}.`,
          "ECOTRACK_VALIDATION_OUTCOME_AMBIGUOUS",
          502,
        );
      }
      const validated = await json<EcoTrackResponse>(validation);
      if (!validated.success) {
        throw new SahelFlowError(
          message(
            validated,
            `EcoTrack created ${tracking}, but validation was not confirmed.`,
          ),
          "ECOTRACK_VALIDATION_OUTCOME_AMBIGUOUS",
          502,
        );
      }
    } catch (error) {
      if (error instanceof SahelFlowError) throw error;
      throw new SahelFlowError(
        error instanceof Error
          ? `EcoTrack created ${tracking}, but validation outcome is unknown: ${error.message}`
          : `EcoTrack created ${tracking}, but validation outcome is unknown.`,
        "ECOTRACK_VALIDATION_OUTCOME_AMBIGUOUS",
        502,
      );
    }

    return { success: true, trackingId: tracking, cost: 0 };
  },

  async syncTracking(trackingId, credentials): Promise<TrackingInfo> {
    const creds = credentials as EcoTrackCredentials;
    const auth = identity(creds);
    const urls = endpoints(creds);
    const requestBody = body(auth);
    requestBody.append("trackings[]", trackingId);
    const response = await retryFetch(
      urls.track.toString(),
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: requestBody,
      },
      TIMEOUT_MS,
    );
    if (!response.ok) {
      throw new SahelFlowError(
        `EcoTrack tracking failed with HTTP ${response.status}.`,
        "ECOTRACK_TRACKING_FAILED",
        502,
      );
    }
    const data = await json<Record<string, EcoTrackTracking>>(response);
    const record = data[trackingId] ?? Object.values(data)[0];
    if (!record) {
      throw new SahelFlowError(
        `EcoTrack returned no tracking record for ${trackingId}.`,
        "ECOTRACK_TRACKING_NOT_FOUND",
        404,
      );
    }
    const events: TrackingEvent[] = (record.activity ?? []).map((activity) => ({
      status: status(activity),
      timestamp: activity.date ?? new Date().toISOString(),
      details: activity.event ?? activity.event_key ?? "EcoTrack update",
      location: activity.name || activity.driver || undefined,
    }));
    return {
      trackingId: record.OrderInfo?.tracking ?? trackingId,
      status: events.at(-1)?.status ?? "pending",
      events:
        events.length > 0
          ? events
          : [
              {
                status: "pending",
                timestamp: new Date().toISOString(),
                details: "EcoTrack tracking record received without activity.",
              },
            ],
      deliveryCompany: carrier(creds),
    };
  },
};
