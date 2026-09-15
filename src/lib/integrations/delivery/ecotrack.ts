import "server-only";

import wilayas from "../../../../data/wilayas.json";
import { SahelFlowError } from "@/types/errors";
import { retryFetch } from "./retry";
import {
  buildEcotrackCreateQuery,
  isEcotrackV1CreateUrl,
  parseEcotrackFailure,
  type EcotrackCreateOrderFields,
} from "./ecotrack-contract";
import { mapEcotrackActivityKey } from "./ecotrack-status";
import type {
  DeliveryAdapter,
  DeliveryCredentials,
  DeliveryCostEstimate,
  DeliveryStatus,
  ShipmentResult,
  TrackingEvent,
  TrackingInfo,
} from "./types";

/**
 * EcoTrack transport — two dialects behind one adapter.
 *
 * 1. TRUE EcoTrack v1 (ecotrack.dz platform) — FD-061 EX-2: when the seller's
 *    configured create URL IS the canonical /api/v1/create/order path, the
 *    adapter speaks the live-proven contract extracted from CodFlow
 *    (github.com/bighadj22/codflow @ 00f18fa, Apache-2.0):
 *      - Auth: `Authorization: Bearer {api_token}` (the NOEST-era userGuid is
 *        not part of this contract).
 *      - Create: POST /api/v1/create/order with EVERY field in the QUERY
 *        STRING (nom_client, telephone, adresse, code_wilaya, commune,
 *        montant, type; optional telephone_2, reference, code_postal,
 *        stop_desk, produit, remarque, weight, fragile) — no JSON body.
 *      - Failures come in THREE styles, all typed via
 *        parseEcotrackFailure: HTTP 200 {success:false, error:10001|10002|
 *        10003} business failures, the 50-requests/minute 429 "Too Many
 *        Attempts." rate limit, and Laravel 422 validation bags.
 *      - Connection probe: GET /api/v1/validate/token?api_token=… — an AUTH
 *        EXCEPTION that takes the token as a query param; VALID_TOKEN vs
 *        TOKEN_NOT_ALLOWED (public API disabled) vs invalid.
 *      - Tracking: GET /api/v1/get/tracking/info?tracking= → { activity:
 *        [{date, time, status(key), station}] } — NOT { data: [] }; the
 *        status key maps through ecotrack-status.ts (unmapped → carry
 *        forward, never guess).
 *      - NO auto-validation: valid/order LOCKS the order (no more edits or
 *        deletes), so the v1 dialect creates only; validation stays a
 *        separate carrier action (a deliberate delta from the NOEST-profile
 *        flow below, which validates right after create).
 *      - Label: GET /api/v1/get/order/label?tracking= (Bearer-gated URL).
 *      - The remaining canonical endpoints (valid/order, get/tracking/info,
 *        validate/token) derive from the create URL's origin.
 *
 * 2. NOEST-profile (historical, unchanged below) — EcoTrack-branded courier
 *    profiles ride the form-body + api_token/user_guid dialect with fully
 *    seller-configured operation URLs. Historical `noest` persistence is
 *    accepted only through explicit one-way compatibility helpers; new
 *    shipment/provider writes stay `ecotrack`.
 */

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

/** GET /api/v1/validate/token body (true-EcoTrack v1 dialect). */
type EcotrackValidateTokenResponse = {
  success?: boolean;
  message?: string;
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

/**
 * True-EcoTrack v1 identity: the Bearer token is the only secret the
 * extracted contract needs (the NOEST-era userGuid is not part of it).
 */
function identityV1(credentials: EcoTrackCredentials): { apiToken: string } {
  const apiToken = credentials.apiToken?.trim();
  if (!apiToken) {
    throw new SahelFlowError(
      "EcoTrack API token is required.",
      "ECOTRACK_CREDENTIALS_MISSING",
      409,
    );
  }
  return { apiToken };
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

/**
 * True-EcoTrack v1 endpoints derived from the configured create URL's origin
 * (the canonical sibling paths are part of the extracted contract).
 */
function v1Endpoints(createOrderUrl: URL) {
  const origin = createOrderUrl.origin;
  return {
    origin,
    create: createOrderUrl,
    validateToken: new URL("/api/v1/validate/token", origin),
  };
}

/** Bearer-gated canonical label URL for the v1 dialect. */
function v1LabelUrl(createOrderUrl: URL, tracking: string): string {
  return `${createOrderUrl.origin}/api/v1/get/order/label?tracking=${encodeURIComponent(tracking)}`;
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

/**
 * True-EcoTrack v1 create: every field travels in the QUERY STRING (the
 * recorded contract has no JSON body on this endpoint), failures are typed
 * through parseEcotrackFailure (business 10001/10002/10003 ride HTTP 200),
 * and the returned tracking carries the Bearer-gated canonical label URL.
 * NO auto-validation: valid/order locks the order at the carrier.
 */
async function createShipmentV1(
  request: Parameters<DeliveryAdapter["createShipment"]>[0],
  creds: EcoTrackCredentials,
): Promise<ShipmentResult> {
  let auth: { apiToken: string };
  let createUrl: URL;
  try {
    auth = identityV1(creds);
    createUrl = endpoint(creds.createOrderUrl, "create-order URL");
  } catch (error) {
    return {
      success: false,
      trackingId: "",
      cost: 0,
      error: error instanceof Error ? error.message : "EcoTrack v1 credentials are incomplete.",
    };
  }

  const code = wilayaCode(request.customer.wilaya);
  if (!code) {
    return {
      success: false,
      trackingId: "",
      cost: 0,
      error: `Unknown wilaya: ${request.customer.wilaya}`,
    };
  }

  const fields: EcotrackCreateOrderFields = {
    nomClient: request.customer.name,
    telephone: request.customer.phone,
    adresse: request.customer.address,
    codeWilaya: code,
    commune: request.customer.commune,
    montant: request.totalPrice,
    type: 1, // 1 = Livraison (standard delivery)
    reference: request.orderNumber,
    produit: request.items
      .map((item) => `${item.name} x${item.quantity}`)
      .join(", "),
    remarque: request.notes || undefined,
    weight: Math.max(1, Math.ceil(request.weight)),
    stopDesk: Boolean(request.stopDeskId),
    codePostal: request.stopDeskId || undefined,
  };

  const url = new URL(createUrl.toString());
  const query = buildEcotrackCreateQuery(fields);
  for (const [key, value] of query.entries()) url.searchParams.set(key, value);

  let response: Response;
  try {
    response = await retryFetch(
      url.toString(),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.apiToken}`,
          Accept: "application/json",
        },
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

  const payload = await json<EcoTrackResponse>(response).catch(() => null);
  if (!response.ok || !payload || payload.success === false || !payload.tracking?.trim()) {
    const failure = parseEcotrackFailure(response.status, payload);
    if (failure.kind === "rate_limit") {
      throw new SahelFlowError(failure.message, "ECOTRACK_RATE_LIMITED", 429);
    }
    return {
      success: false,
      trackingId: "",
      cost: 0,
      error: failure.message,
    };
  }

  const tracking = payload.tracking.trim();
  return {
    success: true,
    trackingId: tracking,
    labelUrl: v1LabelUrl(createUrl, tracking),
    cost: 0,
  };
}

/**
 * True-EcoTrack v1 tracking: GET /api/v1/get/tracking/info?tracking= answers
 * { activity: [{date, time, status(key), station}] } — NOT { data: [] }.
 * Status keys map through ecotrack-status.ts with carry-forward; unmapped
 * keys are logged raw and never guess. Combined datetime: "${date} ${time}".
 */
async function syncTrackingV1(
  trackingId: string,
  creds: EcoTrackCredentials,
): Promise<TrackingInfo> {
  const auth = identityV1(creds);
  const createUrl = endpoint(creds.createOrderUrl, "create-order URL");
  const infoUrl = new URL("/api/v1/get/tracking/info", createUrl.origin);
  infoUrl.searchParams.set("tracking", trackingId);

  const response = await retryFetch(
    infoUrl.toString(),
    {
      method: "GET",
      headers: { Authorization: `Bearer ${auth.apiToken}`, Accept: "application/json" },
    },
    TIMEOUT_MS,
  );
  if (!response.ok) {
    const payload = await json<unknown>(response).catch(() => null);
    const failure = parseEcotrackFailure(response.status, payload);
    throw new SahelFlowError(
      failure.message,
      failure.kind === "rate_limit" ? "ECOTRACK_RATE_LIMITED" : "ECOTRACK_TRACKING_FAILED",
      failure.kind === "rate_limit" ? 429 : 502,
    );
  }

  const data = await json<{
    activity?: Array<{ date?: string; time?: string; status?: string; station?: string }>;
  }>(response);
  const activity = Array.isArray(data.activity) ? data.activity : [];

  const events: TrackingEvent[] = [];
  let lastMeaningful: DeliveryStatus = "pending";
  for (const row of activity) {
    const key = row.status?.trim() ?? "";
    const mapped = mapEcotrackActivityKey(key);
    if (typeof mapped === "string") {
      lastMeaningful = mapped;
    }
    events.push({
      status: lastMeaningful,
      timestamp:
        row.date && row.time ? `${row.date} ${row.time}` : row.date || new Date().toISOString(),
      location: row.station || undefined,
      details: key || "EcoTrack update",
    });
  }

  return {
    trackingId,
    status: lastMeaningful,
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
}

export const ecoTrackAdapter: DeliveryAdapter = {
  id: "ecotrack",
  name: "EcoTrack Pro",
  logo: "ecotrack",

  async testConnection(credentials) {
    try {
      const creds = credentials as EcoTrackCredentials;
      if (isEcotrackV1CreateUrl(creds.createOrderUrl)) {
        // True-EcoTrack v1 probe: GET /api/v1/validate/token?api_token=… is
        // the recorded AUTH EXCEPTION (query-param auth, no Bearer).
        const auth = identityV1(creds);
        const createUrl = endpoint(creds.createOrderUrl, "create-order URL");
        const { validateToken } = v1Endpoints(createUrl);
        const probe = new URL(validateToken.toString());
        probe.searchParams.set("api_token", auth.apiToken);
        const response = await retryFetch(probe.toString(), { method: "GET" }, TIMEOUT_MS);
        if (!response.ok) {
          return {
            ok: false,
            message: `EcoTrack connection test failed with HTTP ${response.status}.`,
          };
        }
        const data = await json<EcotrackValidateTokenResponse>(response);
        if (data.success && data.message === "VALID_TOKEN") {
          return { ok: true, message: `${carrier(creds)} EcoTrack v1 contract verified.` };
        }
        if (data.message === "TOKEN_NOT_ALLOWED") {
          return {
            ok: false,
            message:
              "EcoTrack credentials were accepted but the public API is disabled for this account — enable it in the courier's dashboard.",
          };
        }
        return {
          ok: false,
          message: data.message?.trim() || "EcoTrack token is invalid.",
        };
      }
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
      if (isEcotrackV1CreateUrl(creds.createOrderUrl)) {
        // The extracted (live-proven) contract records no pricing endpoint
        // for the true EcoTrack v1 API — honest unavailability instead of a
        // guessed tariff; live fee certification stays an FRC-5 external gate.
        return {
          provider: "ecotrack",
          cost: 0,
          available: false,
          error:
            "The EcoTrack v1 contract exposes no pricing endpoint; fees stay unavailable for this dialect.",
        };
      }
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
    if (isEcotrackV1CreateUrl(creds.createOrderUrl)) {
      return createShipmentV1(request, creds);
    }
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
    if (isEcotrackV1CreateUrl(creds.createOrderUrl)) {
      return syncTrackingV1(trackingId, creds);
    }
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
