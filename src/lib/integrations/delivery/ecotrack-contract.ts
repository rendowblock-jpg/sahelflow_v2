/**
 * EcoTrack (ecotrack.dz platform) API contract helpers — pure module.
 *
 * Encodes the live-proven EcoTrack contract extracted from CodFlow
 * (cod-server/src/endpoints/delivery-companies/providers/ecotrack/*
 * @ 00f18fa, Apache-2.0): the query-param create body, the THREE failure
 * styles (typed business codes, the 50/min rate limit, Laravel 422 bags),
 * the index-string bulk keying quirk, and the defensive bulk-tracking parse.
 *
 * Nothing here performs I/O; the adapter (ecotrack.ts) composes these with
 * retryFetch. Pure functions keep the contract drift-guardable in tests.
 */

/** Canonical single-order create path of the true EcoTrack v1 API. */
export const ECOTRACK_V1_CREATE_PATH = "/api/v1/create/order";

/**
 * Detect the true EcoTrack v1 dialect from a configured create URL.
 *
 * The `ecotrack` transport historically speaks the NOEST-profile dialect
 * (form body + api_token/user_guid) for EcoTrack-branded couriers. When the
 * seller's configured create URL IS the canonical EcoTrack v1 path, the
 * adapter switches to the Bearer + query-param contract extracted from
 * CodFlow instead. Detection is URL-path based so no new credential field
 * is required and historical rows keep their dialect.
 */
export function isEcotrackV1CreateUrl(value: string | undefined | null): boolean {
  if (!value?.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" && parsed.pathname.endsWith(ECOTRACK_V1_CREATE_PATH);
  } catch {
    return false;
  }
}

/** EcoTrack throttles at 50 requests/minute with this exact Laravel message. */
export const ECOTRACK_RATE_LIMIT_MESSAGE = "Too Many Attempts.";

/** Typed business failure codes returned on HTTP 200 with success:false. */
export const ECOTRACK_BUSINESS_ERRORS: Record<number, string> = {
  10001: "order is not modifiable — it was already validated (locked)",
  10002: "wilaya is not served by this EcoTrack tenant",
  10003: "return cannot be requested for this order",
};

export interface EcotrackParsedFailure {
  kind: "rate_limit" | "business" | "validation" | "http";
  errorCode?: number;
  message: string;
}

/**
 * Flatten an API error-bag into a human-readable string.
 *
 * Handles the two recorded shapes (contract verbatim from upstream utils.ts):
 *   - ZR Express ASP.NET `ValidationProblemDetails.errors`: an array of
 *     `{ code, description, type }` objects (or plain strings).
 *   - Laravel / EcoTrack style: a Record<field, string | string[]>.
 *
 * @returns Human-readable string, or null when empty/absent.
 */
export function flattenErrorBag(errors: unknown): string | null {
  if (!errors) return null;

  if (Array.isArray(errors)) {
    if (errors.length === 0) return null;
    return errors
      .map((entry) => {
        if (typeof entry === "string") return entry;
        const obj = entry as { description?: string; message?: string };
        return obj.description ?? obj.message ?? JSON.stringify(entry);
      })
      .join(" | ");
  }

  if (typeof errors !== "object") return null;
  const entries = Object.entries(errors as Record<string, unknown>);
  if (entries.length === 0) return null;
  return entries
    .map(([field, value]) => {
      const messages = Array.isArray(value) ? value.map(String) : [String(value)];
      return `${field}: ${messages.join(", ")}`;
    })
    .join(" | ");
}

/**
 * Parse ANY EcoTrack failure into one typed outcome.
 *
 *   1. HTTP 429 / body message "Too Many Attempts."  → rate_limit (50 req/min)
 *   2. HTTP 200 + { success:false, error:10001|10002|10003 } → business
 *   3. HTTP 422 Laravel validation bag               → validation
 *   4. anything else                                 → http
 *
 * Business failures ride HTTP 200 — callers MUST consult this parser even
 * when the response status is ok.
 */
export function parseEcotrackFailure(
  status: number,
  body: unknown,
): EcotrackParsedFailure {
  const record = (body ?? {}) as {
    success?: boolean;
    error?: number;
    message?: string;
    errors?: unknown;
  };

  if (status === 429 || record.message === ECOTRACK_RATE_LIMIT_MESSAGE) {
    return {
      kind: "rate_limit",
      message: "EcoTrack rate limit exceeded (50 requests/minute) — retry later",
    };
  }

  const detail = flattenErrorBag(record.errors);
  if (record.success === false && typeof record.error === "number") {
    const named = ECOTRACK_BUSINESS_ERRORS[record.error];
    const message = detail ?? record.message ?? named ?? "EcoTrack business failure";
    const prefix = named ? `EcoTrack ${record.error} (${named})` : `EcoTrack ${record.error}`;
    return { kind: "business", errorCode: record.error, message: `${prefix}: ${message}` };
  }

  if (status === 422 || detail) {
    const message = detail
      ? `${record.message ?? "EcoTrack request failed"} — ${detail}`
      : record.message ?? `EcoTrack validation failed (HTTP ${status})`;
    return { kind: "validation", message };
  }

  return {
    kind: "http",
    message: record.message ?? `EcoTrack request failed with HTTP ${status}`,
  };
}

/** Required + optional query fields of POST /api/v1/create/order (verbatim). */
export interface EcotrackCreateOrderFields {
  nomClient: string;
  telephone: string;
  adresse: string;
  codeWilaya: number;
  commune: string;
  montant: number;
  type?: number; // 1 = Livraison (default), 4 = Recouvrement
  telephone2?: string;
  reference?: string;
  codePostal?: string; // stop-desk station code
  stopDesk?: boolean;
  produit?: string;
  remarque?: string;
  weight?: number;
  fragile?: boolean;
  stock?: number;
  boutique?: string;
  gpsLink?: string;
}

/**
 * Build the create-order QUERY STRING.
 *
 * Contract quirk (live-proven upstream): EcoTrack's single-order endpoint has
 * NO JSON body — every field travels in the query string, optional ones only
 * when present. `type` defaults to 1 (Livraison).
 */
export function buildEcotrackCreateQuery(fields: EcotrackCreateOrderFields): URLSearchParams {
  const params = new URLSearchParams({
    nom_client: fields.nomClient,
    telephone: fields.telephone,
    adresse: fields.adresse,
    code_wilaya: String(fields.codeWilaya),
    commune: fields.commune,
    montant: String(fields.montant),
    type: String(fields.type ?? 1),
  });
  if (fields.telephone2) params.set("telephone_2", fields.telephone2);
  if (fields.reference) params.set("reference", fields.reference);
  if (fields.codePostal) params.set("code_postal", fields.codePostal);
  if (fields.stopDesk != null) params.set("stop_desk", fields.stopDesk ? "1" : "0");
  if (fields.produit) params.set("produit", fields.produit);
  if (fields.remarque) params.set("remarque", fields.remarque);
  if (fields.weight != null) params.set("weight", String(fields.weight));
  if (fields.fragile != null) params.set("fragile", fields.fragile ? "1" : "0");
  if (fields.stock != null) params.set("stock", String(fields.stock));
  if (fields.boutique) params.set("boutique", fields.boutique);
  if (fields.gpsLink) params.set("gps_link", fields.gpsLink);
  return params;
}

/**
 * Build the bulk-create BODY — EcoTrack's recorded quirk: the orders object
 * is keyed by INDEX STRING, not an array:
 *   { "orders": { "0": {...}, "1": {...} } }   (POST /api/v1/create/orders, ≤ 100)
 */
export function buildEcotrackBulkBody(
  orders: Array<Record<string, unknown>>,
): { orders: Record<string, Record<string, unknown>> } {
  const keyed: Record<string, Record<string, unknown>> = {};
  orders.forEach((order, index) => {
    keyed[String(index)] = order;
  });
  return { orders: keyed };
}

export interface EcotrackBulkTrackingEntry {
  tracking: string;
  status?: string;
  activity?: Array<Record<string, unknown>>;
}

/**
 * Parse the bulk tracking response DEFENSIVELY (get/trackings/info).
 *
 * The success shape is unverified upstream (no documented example), so this
 * accepts an array of rows carrying a `tracking` field OR an object keyed by
 * tracking (with or without a `data` wrapper). Rows are matched to the
 * REQUESTED tracking numbers only — never positionally (the live-proven
 * warning: a lazy "take the first row" client attaches the wrong parcel's
 * status).
 */
export function parseEcotrackBulkTrackingResponse(
  payload: unknown,
  requested: string[],
): EcotrackBulkTrackingEntry[] {
  const requestedSet = new Set(requested);
  const entries: EcotrackBulkTrackingEntry[] = [];

  const absorb = (tracking: unknown, row: unknown): void => {
    if (typeof tracking !== "string" || !requestedSet.has(tracking)) return;
    const record = (row ?? {}) as Record<string, unknown>;
    entries.push({
      tracking,
      status: typeof record.status === "string" ? record.status : undefined,
      activity: Array.isArray(record.activity)
        ? (record.activity as Array<Record<string, unknown>>)
        : undefined,
    });
  };

  if (Array.isArray(payload)) {
    for (const row of payload) {
      absorb((row as Record<string, unknown> | null)?.tracking, row);
    }
    return entries;
  }

  if (payload != null && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const container =
      record.data != null && typeof record.data === "object" && !Array.isArray(record.data)
        ? (record.data as Record<string, unknown>)
        : record;
    for (const [tracking, row] of Object.entries(container)) {
      absorb(tracking, row);
    }
  }

  return entries;
}

/** Reconciliation page cap recorded upstream (get/orders pagination). */
export const ECOTRACK_RECONCILE_MAX_PAGES = 10;
