/**
 * Yalidine delivery adapter — the largest Algerian COD delivery provider.
 *
 * API docs: https://api.yalidine.app/v1
 * Auth: X-API-ID + X-API-TOKEN headers (seller's credentials, stored encrypted
 * in the Secret table).
 *
 * Contract corrected against the live-proven Yalidine integration in CodFlow
 * (github.com/bighadj22/codflow @ 00f18fa, Apache-2.0).
 *
 * Live-proven deltas vs the pre-repair guesses:
 *   - Create: POST /parcels/ takes an ARRAY of parcel objects; the response is
 *     an OBJECT KEYED BY order_id ({ "<order_id>": { success, tracking, label,
 *     message } }). Success only when success === true AND tracking non-empty.
 *   - Wilaya/commune are NAME strings in the carrier's own spelling (resolved
 *     against GET /communes/), never numeric ids.
 *   - Delete: DELETE /parcels/{tracking} answers HTTP 200 even on failure with
 *     [{ tracking, deleted }] — only deleted === true means deleted.
 *   - Tracking: GET /histories/?tracking={id} returns a paginated envelope
 *     { data: [...], has_more, total_count }, rows newest-first.
 *
 * Endpoints used:
 *   POST /parcels/              → create shipment (array body)
 *   GET  /parcels/{tracking}    → get shipment status
 *   GET  /deliveryfees/         → estimate delivery cost
 *   GET  /histories/?tracking={id} → tracking events
 *   GET  /communes/?wilaya_name={w} → commune name resolution (cached)
 */
import { env } from "@/lib/env";
import "server-only";


import type {
  DeliveryAdapter,
  DeliveryCredentials,
  DeliveryCostEstimate,
  ShipmentRequest,
  ShipmentResult,
  TrackingEvent,
  TrackingInfo,
  DeliveryStatus,
} from "./types";
import { retryFetch } from "./retry";
import { mapYalidineStatus } from "./yalidine-status";
import type { YalidineStatusVerdict } from "./yalidine-status";
import type { YalidineCommune } from "./yalidine-geo";
import { matchCommuneName } from "./yalidine-geo";

const YALIDINE_BASE =
  env.yalidineApiBase || "https://api.yalidine.app/v1";

const FETCH_TIMEOUT_MS = 15000;

// In-memory commune-name cache: wilaya → Yalidine's own commune list.
const communeListCache = new Map<string, YalidineCommune[]>();

function headers(creds: DeliveryCredentials): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-API-ID": creds.apiId ?? "",
    "X-API-TOKEN": creds.apiToken ?? "",
  };
}

/** Yalidine create-response entry (object keyed by order_id; array = legacy). */
interface YalidineCreateEntry {
  success?: boolean;
  tracking?: string;
  tracking_id?: string;
  label?: string;
  message?: string;
  error?: string;
}

/** Yalidine parcel-status row (GET /parcels/{tracking}). */
interface YalidineParcelRow {
  status?: string;
  parcel_status?: string;
  delivery_date?: string;
}

/** Yalidine history row (GET /histories/ — rows are newest-first). */
interface YalidineHistoryRow {
  date_status?: string;
  status?: string;
  reason?: string;
  center_name?: string;
}

/**
 * Pull the relevant entry out of a create response. Object keyed by order_id
 * (own entry first, else the first entry); a bare array is legacy tolerance
 * (element 0). Anything else → null.
 */
function extractCreateEntry(
  payload: unknown,
  orderNumber: string,
): YalidineCreateEntry | null {
  if (Array.isArray(payload)) {
    return (payload[0] as YalidineCreateEntry | undefined) ?? null;
  }
  if (payload && typeof payload === "object") {
    const keyed = payload as Record<string, unknown>;
    const own = keyed[orderNumber];
    if (own && typeof own === "object") {
      return own as YalidineCreateEntry;
    }
    for (const value of Object.values(keyed)) {
      if (value && typeof value === "object") {
        return value as YalidineCreateEntry;
      }
    }
  }
  return null;
}

/** Pull the parcel-status row out of a GET /parcels/ body (defensive). */
function extractParcelRow(payload: unknown): YalidineParcelRow | null {
  if (Array.isArray(payload)) {
    return (payload[0] as YalidineParcelRow | undefined) ?? null;
  }
  if (payload && typeof payload === "object") {
    const data = (payload as Record<string, unknown>).data;
    if (Array.isArray(data)) {
      return (data[0] as YalidineParcelRow | undefined) ?? null;
    }
    return payload as YalidineParcelRow;
  }
  return null;
}

/**
 * Resolve the request commune name to Yalidine's OWN spelling (cached per
 * process). No match / fetch failure → the raw request string.
 */
async function resolveCommuneName(
  wilaya: string,
  commune: string,
  creds: DeliveryCredentials,
): Promise<string> {
  const cacheKey = wilaya.trim();
  let list = communeListCache.get(cacheKey);
  if (!list) {
    try {
      const res = await retryFetch(
        `${YALIDINE_BASE}/communes/?wilaya_name=${encodeURIComponent(cacheKey)}`,
        { headers: headers(creds) },
        FETCH_TIMEOUT_MS,
      );
      if (res.ok) {
        const parsed: unknown = await res.json();
        if (Array.isArray(parsed)) {
          list = parsed.filter(
            (entry): entry is YalidineCommune =>
              !!entry &&
              typeof entry === "object" &&
              typeof (entry as YalidineCommune).name === "string",
          );
          communeListCache.set(cacheKey, list);
        }
      }
    } catch {
      // Unreachable/unparseable commune list → fall back to the raw name.
    }
  }
  if (!list || list.length === 0) return commune;
  return matchCommuneName(list, commune)?.name ?? commune;
}

export const yalidineAdapter: DeliveryAdapter = {
  id: "yalidine",
  name: "Yalidine",
  logo: "📦",

  async testConnection(creds): Promise<{ ok: boolean; message: string }> {
    if (!creds.apiId || !creds.apiToken) {
      return { ok: false, message: "Identifiants Yalidine manquants." };
    }
    try {
      const res = await retryFetch(
        `${YALIDINE_BASE}/wilayas/?page_size=1`,
        { headers: headers(creds) },
        FETCH_TIMEOUT_MS,
      );
      if (!res.ok) {
        return {
          ok: false,
          message: `Yalidine credential probe failed with HTTP ${res.status}.`,
        };
      }
      await res.json();
      return {
        ok: true,
        message: "Yalidine credentials and public API contract were verified.",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Yalidine connection failed.",
      };
    }
  },


  async estimateCost(
    params: { wilaya: string; commune?: string; weight: number; codAmount: number },
    creds: DeliveryCredentials,
  ): Promise<DeliveryCostEstimate> {
    if (!creds.apiId || !creds.apiToken) {
      return {
        provider: "yalidine",
        cost: 0,
        available: false,
        error: "Identifiants Yalidine manquants. Configurez-les dans Paramètres → Intégrations.",
      };
    }

    try {
      // Yalidine's /deliveryfees/ takes wilaya_name + weight
      const searchParams = new URLSearchParams({
        wilaya_name: params.wilaya,
        weight: String(params.weight),
      });
      const res = await retryFetch(
        `${YALIDINE_BASE}/deliveryfees/?${searchParams.toString()}`,
        { headers: headers(creds) },
        FETCH_TIMEOUT_MS,
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          provider: "yalidine",
          cost: 0,
          available: false,
          error: `Erreur API Yalidine: ${res.status} ${text.slice(0, 200)}`,
        };
      }

      const data = (await res.json()) as Array<{
        wilaya_name: string;
        home_delivery: number;
        stopdesk_delivery: number;
      }>;

      if (!Array.isArray(data) || data.length === 0) {
        return {
          provider: "yalidine",
          cost: 0,
          available: false,
          error: `Pas de tarif trouvé pour la wilaya "${params.wilaya}".`,
        };
      }

      // Use home delivery price (most common for COD)
      const fee = data[0];
      if (!fee) {
        return {
          provider: "yalidine",
          cost: 0,
          available: false,
          error: "Tarif introuvable.",
        };
      }
      return {
        provider: "yalidine",
        cost: fee.home_delivery,
        available: true,
        estimatedDays: "2-5 jours",
      };
    } catch (err) {
      return {
        provider: "yalidine",
        cost: 0,
        available: false,
        error: `Échec de connexion: ${err instanceof Error ? err.message : "erreur inconnue"}`,
      };
    }
  },

  async createShipment(
    request: ShipmentRequest,
    creds: DeliveryCredentials,
  ): Promise<ShipmentResult> {
    if (!creds.apiId || !creds.apiToken) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: "Identifiants Yalidine manquants.",
      };
    }

    // Yalidine requires firstname/familyname separately: first token =
    // firstname, the rest joined = familyname; a single name is DUPLICATED
    // into both.
    const nameParts = request.customer.name.trim().split(/\s+/);
    const firstname = nameParts[0] ?? "";
    const familyname =
      nameParts.length > 1 ? nameParts.slice(1).join(" ") : firstname;

    // COD the carrier collects = product price + optional merchant-charged
    // delivery fee (CodFlow merchant decision 2026-09).
    const price = Math.round(request.totalPrice + (request.deliveryFee ?? 0));

    // Commune/wilaya go as NAME strings — the carrier's own spelling wins
    // (its address matching is by name, not id).
    const toCommuneName = await resolveCommuneName(
      request.customer.wilaya,
      request.customer.commune,
      creds,
    );

    const stopdeskId = request.stopDeskId
      ? Number.parseInt(request.stopDeskId, 10)
      : Number.NaN;
    const isStopdesk = Number.isFinite(stopdeskId);

    const body = [
      {
        order_id: request.orderNumber,
        from_wilaya_name: request.fromWilaya ?? "Alger",
        firstname,
        familyname,
        contact_phone: request.customer.phone,
        address: request.customer.address,
        to_commune_name: toCommuneName,
        to_wilaya_name: request.customer.wilaya,
        product_list: request.items.map((i) => `${i.name} x${i.quantity}`).join(", "),
        price,
        do_insurance: false,
        declared_value: price,
        length: 1,
        width: 1,
        height: 1,
        weight: request.weight ?? 1,
        freeshipping: true,
        is_stopdesk: isStopdesk,
        // Only rides the body when a valid stop desk is set — JSON.stringify
        // drops the undefined key.
        stopdesk_id: isStopdesk ? stopdeskId : undefined,
        has_exchange: request.isExchange ?? false,
      },
    ];

    try {
      const res = await retryFetch(
        `${YALIDINE_BASE}/parcels/`,
        {
          method: "POST",
          headers: headers(creds),
          body: JSON.stringify(body),
        },
        FETCH_TIMEOUT_MS,
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `Erreur API Yalidine: ${res.status} ${text.slice(0, 300)}`,
        };
      }

      const payload: unknown = await res.json().catch(() => null);
      const entry = extractCreateEntry(payload, request.orderNumber);
      if (!entry) {
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: "Réponse vide de Yalidine.",
        };
      }

      const tracking =
        typeof entry.tracking === "string" && entry.tracking
          ? entry.tracking
          : typeof entry.tracking_id === "string"
            ? entry.tracking_id
            : "";
      // Success only when success === true AND tracking is non-empty.
      if (entry.success !== true || !tracking) {
        const message =
          (typeof entry.message === "string" && entry.message) ||
          (typeof entry.error === "string" && entry.error) ||
          "Création du colis Yalidine échouée.";
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: message,
        };
      }

      // Fetch the cost (the create response doesn't include it)
      const estimate = await yalidineAdapter.estimateCost(
        {
          wilaya: request.customer.wilaya,
          weight: request.weight,
          codAmount: price,
        },
        creds,
      );

      return {
        success: true,
        trackingId: tracking,
        labelUrl:
          typeof entry.label === "string" && entry.label
            ? entry.label
            : undefined,
        cost: estimate.available ? estimate.cost : 0,
      };
    } catch (err) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: `Échec de connexion: ${err instanceof Error ? err.message : "erreur inconnue"}`,
      };
    }
  },

  async syncTracking(
    trackingId: string,
    creds: DeliveryCredentials,
  ): Promise<TrackingInfo> {
    if (!creds.apiId || !creds.apiToken) {
      throw new Error("Identifiants Yalidine manquants.");
    }

    // Fetch parcel status + history in parallel
    const [parcelRes, historyRes] = await Promise.allSettled([
      retryFetch(
        `${YALIDINE_BASE}/parcels/${encodeURIComponent(trackingId)}/`,
        { headers: headers(creds) },
        FETCH_TIMEOUT_MS,
      ),
      retryFetch(
        `${YALIDINE_BASE}/histories/?tracking=${encodeURIComponent(trackingId)}`,
        { headers: headers(creds) },
        FETCH_TIMEOUT_MS,
      ),
    ]);

    // Parcel GET: object envelope (defensive: array tolerated); read
    // status ?? parcel_status.
    let parcelVerdict: YalidineStatusVerdict | null = null;
    let estimatedDelivery: string | undefined;
    if (parcelRes.status === "fulfilled" && parcelRes.value.ok) {
      try {
        const row = extractParcelRow(await parcelRes.value.json());
        if (row) {
          const rawStatus =
            typeof row.status === "string" && row.status
              ? row.status
              : typeof row.parcel_status === "string"
                ? row.parcel_status
                : "";
          if (rawStatus) {
            parcelVerdict = mapYalidineStatus(rawStatus);
          }
          if (typeof row.delivery_date === "string" && row.delivery_date) {
            estimatedDelivery = row.delivery_date;
          }
        }
      } catch {
        // Unparseable parcel body — events decide the status.
      }
    }

    // History: paginated envelope { data: [...], has_more, total_count }
    // (defensive: bare array tolerated). Rows are typically newest-first;
    // events are built oldest-first with CARRY-FORWARD semantics — transit
    // no-ops and unmapped rows keep the last known meaningful status
    // (starting from "pending") so nothing regresses and nothing is silently
    // swallowed (the raw status always leads the details).
    const events: TrackingEvent[] = [];
    let lastMeaningful: DeliveryStatus = "pending";
    if (historyRes.status === "fulfilled" && historyRes.value.ok) {
      try {
        const payload: unknown = await historyRes.value.json();
        const rows: unknown[] = Array.isArray(payload)
          ? payload
          : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
            ? ((payload as { data: unknown[] }).data)
            : [];
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          const row = rows[i] as YalidineHistoryRow | null;
          if (!row || typeof row !== "object") continue;
          const rawStatus = typeof row.status === "string" ? row.status : "";
          const reason =
            typeof row.reason === "string" && row.reason ? row.reason : "";
          const details = `${rawStatus}${reason ? ` — ${reason}` : ""}`;
          const verdict = mapYalidineStatus(rawStatus);
          const event: TrackingEvent = {
            status: lastMeaningful,
            timestamp:
              typeof row.date_status === "string" && row.date_status
                ? row.date_status
                : new Date().toISOString(),
            location:
              typeof row.center_name === "string" ? row.center_name : undefined,
            details,
          };
          if (verdict.status !== null) {
            lastMeaningful = verdict.status;
            event.status = verdict.status;
          }
          events.push(event);
        }
      } catch {
        // Unparseable history body — no events.
      }
    }

    // Final status: the parcel GET's mapped verdict wins when meaningful;
    // otherwise the last meaningful event verdict; otherwise "pending".
    const status: DeliveryStatus =
      parcelVerdict && parcelVerdict.status !== null
        ? parcelVerdict.status
        : lastMeaningful;

    return {
      trackingId,
      status,
      events,
      estimatedDelivery,
      deliveryCompany: "Yalidine",
    };
  },

  async cancelShipment(
    trackingId: string,
    creds: DeliveryCredentials,
  ): Promise<{ success: boolean; error?: string }> {
    if (!creds.apiId || !creds.apiToken) {
      return { success: false, error: "Identifiants Yalidine manquants." };
    }
    try {
      const res = await retryFetch(
        `${YALIDINE_BASE}/parcels/${encodeURIComponent(trackingId)}/`,
        {
          method: "DELETE",
          headers: headers(creds),
        },
        FETCH_TIMEOUT_MS,
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { success: false, error: `Erreur ${res.status}: ${text.slice(0, 200)}` };
      }
      // Yalidine answers HTTP 200 EVEN WHEN THE DELETE FAILED — the truth is
      // in the body: [{ tracking, deleted }]. Only deleted === true counts;
      // HTTP 200 with deleted=false is a FAILURE. Missing/unparseable body is
      // a failure too.
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      const rows: unknown[] = Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object"
          ? Array.isArray((payload as { data?: unknown }).data)
            ? ((payload as { data: unknown[] }).data)
            : [payload]
          : [];
      const matched = rows.find(
        (row) =>
          !!row &&
          typeof row === "object" &&
          (row as { tracking?: unknown }).tracking === trackingId,
      );
      const row = (matched ?? rows[0]) as
        | { deleted?: unknown; message?: unknown; error?: unknown }
        | undefined;
      if (row && row.deleted === true) {
        return { success: true };
      }
      const message =
        (typeof row?.message === "string" && row.message) ||
        (typeof row?.error === "string" && row.error) ||
        "";
      return {
        success: false,
        error:
          message ||
          "Suppression non confirmée par Yalidine (deleted != true ou réponse illisible).",
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "erreur inconnue",
      };
    }
  },
};
