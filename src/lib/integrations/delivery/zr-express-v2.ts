/**
 * ZR Express adapter — NEW platform dialect (api.zrexpress.app).
 *
 * Contract corrected against the live-proven ZR Express integration in CodFlow
 * (github.com/bighadj22/codflow @ 00f18fa, Apache-2.0; live-verified upstream
 * against the production API on 2026-09-10).
 *
 * The legacy dialect (Procolis, token+key headers) lives in `zr-express.ts`
 * and stays the default; this dialect activates when the seller stores the
 * new-platform credentials (apiToken = "API Key", tenant = "Tenant ID").
 *
 * Auth: two custom headers — `X-Api-Key` + `X-Tenant` (do NOT use Bearer).
 * Base: https://api.zrexpress.app, prefix /api/v1.
 *
 * Live-proven contract points carried over verbatim:
 *   - ZR uses UUID territories (wilaya/commune); its keyword search is
 *     ACCENT-SENSITIVE and its territory DB stores accent-free names, so all
 *     name searches run through stripAccents ("Béchar" → 0 results).
 *   - City resolution: search the stripped wilaya name, then the wilaya code
 *     (pageSize 200 — the default page of 50 often omits the wilaya row).
 *     Four wilayas are UNSERVED (33 Illizi, 37 Tindouf, 50 Bordj Badji
 *     Mokhtar, 56 Djanet): parcel creation fails loudly, never guesses.
 *   - District resolution is STRICT: parent-id match, then accent-insensitive
 *     name equality — NO fallback to items[0] (an unmatched commune must fail
 *     the dispatch, never deliver to an arbitrary commune).
 *   - Stop desks are HUBS (POST /hubs/search, isPickupPoint:true) — NOT
 *     territories. Creating a pickup-point parcel with a territory UUID as
 *     hubId answers HubNotFound; the hub id (stationCode) is what parcel
 *     creation expects. The hub carries its own district/city territories.
 *   - Create = POST /customers/individual {name, phone:{number1, number2?}}
 *     → customer UUID, then POST /parcels. The single create returns the
 *     parcel UUID only; the tracking number arrives via GET /parcels/{id}.
 *   - No validation step: parcels are active immediately after creation.
 *   - Labels: POST /parcels/labels/individual/pdf → temporary SAS URL
 *     (~1 h); label failure never fails the shipment.
 *   - Tracking: GET /parcels/{trackingNumber} resolves the UUID, then
 *     GET /parcels/{id}/state-history — the history path accepts ONLY the
 *     UUID. The parcel GET's `state` verdict and `isReturn` flag (the only
 *     fully reliable terminal return signal) outrank the history stream.
 *   - Cancel: DELETE /parcels/bulk/by-tracking-number (POST answers 405);
 *     404/"not found" is an idempotent success.
 *   - Status mapping: tenant-configurable free text — mapped through the
 *     verbatim default-workflow vocabulary in `zr-express-v2-status.ts`
 *     (accent/case-insensitive, description fallback, unmapped → carry
 *     forward, never guess, never move backward).
 *
 * Pricing: the extracted contract records NO pricing endpoint for the new
 * platform, so estimateCost returns an honest unavailable instead of
 * guessing (FRC-5 keeps its own external certification gate).
 */
import { env } from "@/lib/env";
import "server-only";

import wilayas from "../../../../data/wilayas.json";
import { retryFetch } from "./retry";
import { stripAccents } from "./zr-express-text";
import { mapZrV2State } from "./zr-express-v2-status";
import type {
  CancelShipmentResult,
  DeliveryCredentials,
  DeliveryCostEstimate,
  DeliveryStatus,
  ShipmentRequest,
  ShipmentResult,
  TrackingEvent,
  TrackingInfo,
} from "./types";

const ZR_V2_BASE = env.zrExpressV2ApiBase || "https://api.zrexpress.app";
const API_VERSION = "1";
const FETCH_TIMEOUT_MS = 15_000;
const HUB_PAGE_SIZE = 200;
const HUB_MAX_PAGES = 10;

/** The four wilayas with NO ZR territory (live-verified upstream). */
const UNSERVED_WILAYA_CODES = new Set([33, 37, 50, 56]);

interface ZrTerritoryItem {
  id: string;
  name?: string | null;
  code?: number | null;
  level?: string | null;
  parentId?: string | null;
}

interface ZrHubItem {
  id: string;
  name?: string | null;
  isPickupPoint?: boolean;
  address?: {
    cityTerritoryId?: string | null;
    districtTerritoryId?: string | null;
  } | null;
}

interface ZrPagedList<T> {
  items?: T[] | null;
  totalPages?: number | null;
}

interface ZrParcelResponse {
  id?: string;
  trackingNumber?: string | null;
  state?: { name?: string | null; description?: string | null } | null;
  isReturn?: boolean;
  deliveryType?: string | null;
}

interface ZrStateHistoryRow {
  newState?: { name?: string | null; description?: string | null } | null;
  createdAt?: string | null;
}

/** New-platform credentials: apiToken = X-Api-Key, tenant = X-Tenant. */
export function isZrV2Credentials(credentials: DeliveryCredentials): boolean {
  return Boolean(credentials.apiToken?.trim() && credentials.tenant?.trim());
}

function v2Headers(credentials: DeliveryCredentials): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-Key": credentials.apiToken ?? "",
    "X-Tenant": credentials.tenant ?? "",
  };
}

/** Resolve a wilaya name (FR/AR/code) to its 1–58 code from reference data. */
export function resolveWilayaCode(value: string): number | null {
  const normalized = value.trim().toLocaleLowerCase("fr");
  const match = wilayas.find(
    (item) =>
      item.name.toLocaleLowerCase("fr") === normalized ||
      stripAccents(item.name.toLocaleLowerCase("fr")) === stripAccents(normalized) ||
      item.nameAr.trim() === value.trim() ||
      String(item.code) === value.trim(),
  );
  return match?.code ?? null;
}

/** Normalize an Algerian phone to international format ("0551234500" → "+213551234500"). */
export function normalizeZrPhone(phone: string): string {
  const p = phone.trim().replace(/\s+/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return `+${p.slice(2)}`;
  if (p.startsWith("0") && p.length === 10) return `+213${p.slice(1)}`;
  return `+${p}`;
}

// In-memory per-tenant caches, populated lazily (the legacy dialect's
// pricingCache pattern; keys are prefixed by tenant).
const cityCache = new Map<string, ZrTerritoryItem>();
const hubCache = new Map<string, ZrHubItem[]>();

/** Map a state by name, falling back to its French display description. */
function stateVerdict(name: string | null | undefined, description?: string | null) {
  const byName = mapZrV2State(name);
  if (byName.status !== null) return byName;
  return mapZrV2State(description);
}

async function zrV2Fetch(
  credentials: DeliveryCredentials,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return retryFetch(
    `${ZR_V2_BASE}/api/v${API_VERSION}${path}`,
    { headers: v2Headers(credentials), ...init },
    FETCH_TIMEOUT_MS,
  );
}

async function zrV2Json<T>(response: Response, label: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`ZR Express: ${label} response is not valid JSON (HTTP ${response.status})`);
  }
}

/** Flatten ZR's ASP.NET error payload (title/detail + ValidationProblemDetails bag). */
function zrErrorMessage(payload: unknown, status: number): string {
  const record = (payload ?? {}) as {
    title?: string;
    detail?: string;
    message?: string;
    errors?: unknown;
  };
  const errors = record.errors;
  let fieldErrors: string | null = null;
  if (Array.isArray(errors)) {
    fieldErrors = errors
      .map((entry) => {
        if (typeof entry === "string") return entry;
        const obj = entry as { description?: string; message?: string };
        return obj.description ?? obj.message ?? JSON.stringify(entry);
      })
      .join(" | ");
  } else if (errors && typeof errors === "object") {
    fieldErrors = Object.entries(errors as Record<string, unknown>)
      .map(([field, value]) => {
        const messages = Array.isArray(value) ? value.map(String) : [String(value)];
        return `${field}: ${messages.join(", ")}`;
      })
      .join(" | ");
  }
  return (
    [record.title, record.detail, fieldErrors].filter(Boolean).join(" — ") ||
    record.message ||
    `ZR Express HTTP ${status}`
  );
}

async function searchTerritories(
  credentials: DeliveryCredentials,
  keyword: string,
  extra: Record<string, unknown> = {},
): Promise<ZrTerritoryItem[]> {
  const response = await zrV2Fetch(credentials, "/territories/search", {
    method: "POST",
    body: JSON.stringify({ keyword, pageSize: 50, pageNumber: 1, ...extra }),
  });
  const payload = await zrV2Json<ZrPagedList<ZrTerritoryItem>>(response, "territory search");
  if (!response.ok) throw new Error(zrErrorMessage(payload, response.status));
  return payload.items ?? [];
}

/**
 * Resolve the ZR city (wilaya) territory — accent-stripped name search first,
 * then the wilaya code with a wider page (live-verified upstream strategy).
 */
async function resolveCity(
  credentials: DeliveryCredentials,
  tenant: string,
  wilayaCode: number,
  wilayaName: string,
): Promise<ZrTerritoryItem> {
  const cacheKey = `${tenant}:${wilayaCode}`;
  const cached = cityCache.get(cacheKey);
  if (cached) return cached;

  const isTarget = (t: ZrTerritoryItem) => t.code === wilayaCode && t.level === "wilaya";

  const byName = await searchTerritories(credentials, stripAccents(wilayaName));
  const nameMatch = byName.find(isTarget);
  if (nameMatch) {
    cityCache.set(cacheKey, nameMatch);
    return nameMatch;
  }

  const byCode = await searchTerritories(credentials, String(wilayaCode), {
    pageSize: 200,
  });
  const codeMatch = byCode.find(isTarget);
  if (codeMatch) {
    cityCache.set(cacheKey, codeMatch);
    return codeMatch;
  }

  throw new Error(
    `ZR Express: no territory for wilaya ${wilayaCode} ("${wilayaName}"). ` +
      `The carrier does not serve this wilaya (verified unserved: 33 Illizi, ` +
      `37 Tindouf, 50 Bordj Badji Mokhtar, 56 Djanet), or the name does not ` +
      `match ZR's territory list.`,
  );
}

/**
 * Resolve the ZR district (commune) territory — STRICT: parent match, then
 * accent-insensitive name equality. Never falls back to items[0].
 */
async function resolveDistrict(
  credentials: DeliveryCredentials,
  communeName: string,
  city: ZrTerritoryItem,
  isStopDesk = false,
): Promise<ZrTerritoryItem> {
  const extra = isStopDesk ? { deliveryType: { value: "pickup-point" } } : {};
  const items = await searchTerritories(
    credentials,
    stripAccents(communeName),
    extra,
  );
  const communes = items.filter((t) => t.level === "commune");

  const byParent = communes.find((t) => t.parentId === city.id);
  if (byParent) return byParent;

  const needle = stripAccents(communeName).toLowerCase();
  const byName = communes.find(
    (t) => stripAccents(t.name ?? "").toLowerCase() === needle,
  );
  if (byName) return byName;

  throw new Error(
    `ZR Express: could not resolve commune "${communeName}" in ` +
      `${city.name ?? city.id}. Check the commune name against ZR's ` +
      `territory list (accent-free spellings).`,
  );
}

/** Load the tenant's pickup-point hubs (paginated, cached per tenant). */
async function loadHubs(credentials: DeliveryCredentials, tenant: string): Promise<ZrHubItem[]> {
  const cached = hubCache.get(tenant);
  if (cached) return cached;

  const hubs: ZrHubItem[] = [];
  for (let page = 1; page <= HUB_MAX_PAGES; page += 1) {
    const response = await zrV2Fetch(credentials, "/hubs/search", {
      method: "POST",
      body: JSON.stringify({ pageSize: HUB_PAGE_SIZE, pageNumber: page }),
    });
    const payload = await zrV2Json<ZrPagedList<ZrHubItem>>(response, "hub search");
    if (!response.ok) throw new Error(zrErrorMessage(payload, response.status));
    const items = payload.items ?? [];
    hubs.push(...items);
    const totalPages = payload.totalPages ?? 1;
    if (items.length === 0 || page >= totalPages) break;
  }
  hubCache.set(tenant, hubs);
  return hubs;
}

/**
 * Resolve the hub backing a stop-desk station code: new syncs store the hub
 * id itself; legacy syncs stored the pickup-point territory UUID — match it
 * against hub.address.districtTerritoryId so old records keep working.
 */
async function resolveHubForStation(
  credentials: DeliveryCredentials,
  tenant: string,
  stationCode: string,
): Promise<ZrHubItem> {
  const hubs = await loadHubs(credentials, tenant);
  const byId = hubs.find((h) => h.id === stationCode);
  if (byId) return byId;
  const byDistrict = hubs.find((h) => h.address?.districtTerritoryId === stationCode);
  if (byDistrict) return byDistrict;
  throw new Error(
    `ZR Express: stop desk "${stationCode}" no longer matches any hub. ` +
      `Re-sync the stop desks for this delivery company.`,
  );
}

/** Create the ZR customer and return their UUID (required for parcel creation). */
async function createZrCustomer(
  credentials: DeliveryCredentials,
  name: string,
  phone: string,
): Promise<string> {
  const response = await zrV2Fetch(credentials, "/customers/individual", {
    method: "POST",
    body: JSON.stringify({ name, phone: { number1: phone } }),
  });
  const payload = await zrV2Json<{ id?: string }>(response, "customer creation");
  if (!response.ok) throw new Error(zrErrorMessage(payload, response.status));
  if (!payload.id) throw new Error("ZR Express: customer creation returned no ID");
  return payload.id;
}

/** Best-effort label fetch — a label failure never fails the shipment. */
async function fetchLabelUrl(
  credentials: DeliveryCredentials,
  trackingNumber: string,
): Promise<string | undefined> {
  try {
    const response = await zrV2Fetch(credentials, "/parcels/labels/individual/pdf", {
      method: "POST",
      body: JSON.stringify({ trackingNumbers: [trackingNumber], format: "a6" }),
    });
    if (!response.ok) return undefined;
    const payload = await zrV2Json<{
      parcelLabelFiles?: Array<{ fileUrl?: string }> | null;
    }>(response, "label generation");
    return payload.parcelLabelFiles?.[0]?.fileUrl || undefined;
  } catch {
    return undefined;
  }
}

/** Non-mutating credential probe for the api.zrexpress.app dialect. */
export async function zrV2TestConnection(
  credentials: DeliveryCredentials,
): Promise<{ ok: boolean; message: string }> {
    if (!isZrV2Credentials(credentials)) {
      return { ok: false, message: "Identifiants ZR Express manquants." };
    }
    try {
      // Non-mutating probe: the territory search validates auth + tenant and
      // exercises the same accent-stripped pipeline the booking flow uses.
      const response = await zrV2Fetch(credentials, "/territories/search", {
        method: "POST",
        body: JSON.stringify({ keyword: "alger", pageSize: 1, pageNumber: 1 }),
      });
      if (!response.ok) {
        const payload = await zrV2Json<unknown>(response, "territory search").catch(() => null);
        return {
          ok: false,
          message: `ZR Express credential probe failed: ${zrErrorMessage(payload, response.status)}`,
        };
      }
      return {
        ok: true,
        message: "ZR Express credentials and api.zrexpress.app contract were verified.",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "ZR Express connection failed.",
      };
    }
}

/**
 * The extracted (live-proven) contract records no pricing endpoint for the
 * new platform. Honest unavailability instead of a guessed tariff — live
 * fee certification stays an FRC-5 external gate.
 */
export async function zrV2EstimateCost(): Promise<DeliveryCostEstimate> {
    // The extracted (live-proven) contract records no pricing endpoint for
    // the new platform. Honest unavailability instead of a guessed tariff —
    // live fee certification stays an FRC-5 external gate.
    return {
      provider: "zrexpress",
      cost: 0,
      available: false,
      error:
        "Le nouveau contrat ZR Express (api.zrexpress.app) n'expose pas de tarification; " +
        "utilisez les identifiants Procolis (legacy) ou le tableau de bord ZR Express.",
    };
}

/** Full booking flow: customer → territory/hub → parcel → tracking number. */
export async function zrV2CreateShipment(
  request: ShipmentRequest,
  credentials: DeliveryCredentials,
): Promise<ShipmentResult> {
    if (!isZrV2Credentials(credentials)) {
      return { success: false, trackingId: "", cost: 0, error: "Identifiants ZR Express manquants." };
    }
    const tenant = credentials.tenant?.trim() ?? "";

    try {
      const wilayaCode = resolveWilayaCode(request.customer.wilaya);
      if (!wilayaCode) {
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `Wilaya "${request.customer.wilaya}" non reconnue.`,
        };
      }
      if (UNSERVED_WILAYA_CODES.has(wilayaCode)) {
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `ZR Express ne dessert pas la wilaya ${wilayaCode} ("${request.customer.wilaya}").`,
        };
      }

      const phone = normalizeZrPhone(request.customer.phone);
      const customerId = await createZrCustomer(credentials, request.customer.name, phone);

      let cityId: string;
      let districtId: string;
      let hubId: string | null = null;
      if (request.stopDeskId) {
        // Pickup-point parcels are delivered to a HUB; the hub carries its own
        // district + city territories, so no separate territory search is needed.
        const hub = await resolveHubForStation(credentials, tenant, request.stopDeskId);
        districtId = hub.address?.districtTerritoryId ?? "";
        cityId = hub.address?.cityTerritoryId ?? "";
        hubId = hub.id;
        if (!districtId || !cityId) {
          return {
            success: false,
            trackingId: "",
            cost: 0,
            error: `ZR Express: le hub ${hub.id} n'a pas de territoire ville/commune — adresse de livraison impossible.`,
          };
        }
      } else {
        const city = await resolveCity(credentials, tenant, wilayaCode, request.customer.wilaya);
        const district = await resolveDistrict(credentials, request.customer.commune, city);
        cityId = city.id;
        districtId = district.id;
      }

      const productDescription = request.items
        .map((item) => `${item.name} x${item.quantity}`)
        .join(", ");
      const amount = request.totalPrice;

      const parcelPayload = {
        customer: {
          customerId,
          name: request.customer.name,
          phone: { number1: phone },
        },
        deliveryAddress: {
          cityTerritoryId: cityId,
          districtTerritoryId: districtId,
          street: request.customer.address || null,
        },
        deliveryType: request.stopDeskId ? "pickup-point" : "home",
        amount,
        description: productDescription,
        externalId: request.orderNumber,
        orderedProducts: [
          {
            productName: productDescription || request.orderNumber,
            unitPrice: amount,
            quantity: 1,
            stockType: "none",
          },
        ],
        ...(hubId ? { hubId } : {}),
      };

      const createResponse = await zrV2Fetch(credentials, "/parcels", {
        method: "POST",
        body: JSON.stringify(parcelPayload),
      });
      const created = await zrV2Json<{ id?: string }>(createResponse, "parcel creation");
      if (!createResponse.ok) {
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `ZR Express: ${zrErrorMessage(created, createResponse.status)}`,
        };
      }
      if (!created.id) {
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: "ZR Express: parcel creation returned no ID",
        };
      }

      // Single create returns the UUID only — the tracking number arrives
      // through the parcel GET (live-proven contract point).
      const parcelResponse = await zrV2Fetch(credentials, `/parcels/${created.id}`);
      const parcel = await zrV2Json<ZrParcelResponse>(parcelResponse, "parcel read");
      if (!parcelResponse.ok || !parcel.trackingNumber) {
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `ZR Express: parcel created (id=${created.id}) but tracking number not available yet`,
        };
      }

      const labelUrl = await fetchLabelUrl(credentials, parcel.trackingNumber);

      return {
        success: true,
        trackingId: parcel.trackingNumber,
        ...(labelUrl ? { labelUrl } : {}),
        cost: 0,
      };
    } catch (error) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: error instanceof Error ? error.message : "Erreur de connexion ZR Express",
      };
    }
}

/** UUID-only state-history resolution with forward-only carry-forward. */
export async function zrV2SyncTracking(
  trackingId: string,
  credentials: DeliveryCredentials,
): Promise<TrackingInfo> {
    if (!isZrV2Credentials(credentials)) {
      throw new Error("Identifiants ZR Express manquants.");
    }

    // UUID-only state-history resolution: the history path answers 404 for a
    // tracking number — resolve the parcel UUID via GET /parcels/{tracking}.
    const parcelResponse = await zrV2Fetch(credentials, `/parcels/${encodeURIComponent(trackingId)}`);
    if (!parcelResponse.ok) {
      const payload = await zrV2Json<unknown>(parcelResponse, "parcel read").catch(() => null);
      throw new Error(
        `ZR Express tracking failed: ${zrErrorMessage(payload, parcelResponse.status)}`,
      );
    }
    const parcel = await zrV2Json<ZrParcelResponse>(parcelResponse, "parcel read");
    if (!parcel.id) {
      throw new Error(`ZR Express returned no parcel UUID for "${trackingId}".`);
    }

    const historyResponse = await zrV2Fetch(
      credentials,
      `/parcels/${encodeURIComponent(parcel.id)}/state-history`,
    );
    if (!historyResponse.ok) {
      const payload = await zrV2Json<unknown>(historyResponse, "state history").catch(() => null);
      throw new Error(
        `ZR Express tracking failed: ${zrErrorMessage(payload, historyResponse.status)}`,
      );
    }
    const history = await zrV2Json<ZrStateHistoryRow[]>(historyResponse, "state history");
    const rows = Array.isArray(history) ? history : [];

    // Rows are ordered oldest-first by createdAt when timestamps parse;
    // otherwise the API order is preserved. Events are built with
    // CARRY-FORWARD semantics — unmapped/no-op states never move backward.
    const ordered = rows
      .map((row, index) => ({ row, index, time: Date.parse(row.createdAt ?? "") }))
      .sort((left, right) => {
        const leftValid = Number.isFinite(left.time);
        const rightValid = Number.isFinite(right.time);
        if (leftValid && rightValid && left.time !== right.time) return left.time - right.time;
        return left.index - right.index;
      })
      .map(({ row }) => row);

    const events: TrackingEvent[] = [];
    let lastMeaningful: DeliveryStatus = "pending";
    for (const row of ordered) {
      const rawState = row.newState?.name ?? row.newState?.description ?? "";
      const verdict = stateVerdict(row.newState?.name, row.newState?.description);
      if (verdict.status !== null) {
        lastMeaningful = verdict.status;
      }
      events.push({
        status: lastMeaningful,
        timestamp: row.createdAt ?? new Date().toISOString(),
        details: rawState || "ZR Express update",
      });
    }

    // The parcel GET verdict outranks the history stream; isReturn is the
    // only fully reliable terminal return signal (live-proven).
    if (parcel.isReturn === true) {
      lastMeaningful = "returned";
    } else {
      const parcelVerdict = stateVerdict(parcel.state?.name, parcel.state?.description);
      if (parcelVerdict.status !== null) lastMeaningful = parcelVerdict.status;
    }

    return {
      trackingId: parcel.trackingNumber ?? trackingId,
      status: lastMeaningful,
      events:
        events.length > 0
          ? events
          : [
              {
                status: lastMeaningful,
                timestamp: new Date().toISOString(),
                details: "ZR Express state history received without events.",
              },
            ],
      deliveryCompany: "ZR Express",
    };
}

/** DELETE /parcels/bulk/by-tracking-number with idempotent not-found truth. */
export async function zrV2CancelShipment(
  trackingId: string,
  credentials: DeliveryCredentials,
): Promise<CancelShipmentResult> {
    if (!isZrV2Credentials(credentials)) {
      return { success: false, cancelled: false, error: "Identifiants ZR Express manquants." };
    }

    try {
      // DELETE (not POST — POST answers 405 on this path, live-verified).
      const response = await zrV2Fetch(credentials, "/parcels/bulk/by-tracking-number", {
        method: "DELETE",
        body: JSON.stringify({ trackingNumbers: [trackingId] }),
      });
      const payload = await zrV2Json<{
        successCount?: number;
        failures?: Array<{ errorCode?: string; errorMessage?: string }> | null;
      }>(response, "parcel delete").catch(() => null);

      if (!response.ok) {
        // A parcel already gone / never dispatched is an idempotent success.
        const message = payload ? zrErrorMessage(payload, response.status) : `HTTP ${response.status}`;
        if (response.status === 404 || /not found/i.test(message)) {
          return { success: true, cancelled: true };
        }
        return { success: false, cancelled: false, error: `ZR Express: ${message}` };
      }

      if ((payload?.successCount ?? 0) >= 1) {
        return { success: true, cancelled: true };
      }
      const failures = payload?.failures ?? [];
      const allNotFound =
        failures.length > 0 && failures.every((f) => /not found/i.test(f.errorMessage ?? ""));
      if (allNotFound) {
        return { success: true, cancelled: true };
      }
      const reason = failures
        .map((f) => f.errorMessage ?? f.errorCode ?? "unknown")
        .join("; ");
      return {
        success: false,
        cancelled: false,
        error: `ZR Express: failed to delete parcel ${trackingId} — ${reason || "no result from the carrier"}`,
      };
    } catch (error) {
      return {
        success: false,
        cancelled: false,
        error: error instanceof Error ? error.message : "Erreur de connexion ZR Express",
      };
    }
}
