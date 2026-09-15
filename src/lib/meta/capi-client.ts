/**
 * Meta Conversions API (CAPI) client — pure send module.
 *
 * Contract transcribed verbatim from the live-proven CodFlow engine
 * (cod-server/src/lib/capi.ts @ 00f18fa, Apache-2.0), re-expressed with
 * node:crypto because SahelFlow runs on the desktop runtime, not Cloudflare
 * Workers.
 *
 * Semantics:
 *   - All PII is SHA-256 hashed before sending (Meta requirement). Phones are
 *     normalized to the Algerian country code 213.
 *   - Throws on network errors and Meta 5xx (RETRYABLE by the outbox effect).
 *   - Returns { success: false } on 4xx (Meta rejects the whole batch —
 *     terminal failure record, never retried).
 *   - `event_id` equals the order id so the browser pixel's same-ID event
 *     dedups (48 h window, matching event_name).
 */

import { createHash } from "node:crypto";

const META_API_VERSION = "v26.0";
const META_API_BASE = "https://graph.facebook.com";
const DZ_COUNTRY_CODE = "213";

export const META_CAPI_ENDPOINT = `${META_API_BASE}/${META_API_VERSION}`;

function sha256hex(value: string): string {
  return createHash("sha256").update(value.toLowerCase().replace(/\s+/g, ""), "utf8").digest("hex");
}

function normalisePhone(raw: string): string {
  let p = raw.replace(/\D/g, "");
  p = p.replace(/^0+/, "");
  if (!p.startsWith(DZ_COUNTRY_CODE)) p = DZ_COUNTRY_CODE + p;
  return p;
}

/** a-z only, diacritics folded — for ct/zp-style values per Meta docs. */
function normaliseAsciiText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Unicode letters only, diacritics folded, lowercased — for fn/ln. */
function normaliseName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}]/gu, "");
}

export interface CapiUserData {
  phone: string;
  firstName?: string | null;
  lastName?: string | null;
  externalId?: string | null;
  city?: string | null;
  postalCode?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
}

export interface CapiEventPayload {
  eventName: "Lead" | "Purchase";
  eventId: string;
  eventTime: number; // unix seconds
  /** Verified-domain page URL — required by Meta for website events. */
  eventSourceUrl?: string | null;
  userData: CapiUserData;
  /** DZD value — required for Purchase. */
  value?: number;
  currency?: string;
  contentIds?: string[];
  testEventCode?: string | null;
}

export interface CapiResult {
  success: boolean;
  fbtraceId?: string;
  error?: string;
  httpStatus?: number;
}

export async function sendCapiEvent(
  pixelId: string,
  accessToken: string,
  payload: CapiEventPayload,
): Promise<CapiResult> {
  const ud = payload.userData;

  const userData: Record<string, string> = {
    ph: sha256hex(normalisePhone(ud.phone)),
    country: sha256hex("dz"),
  };
  if (ud.firstName) userData.fn = sha256hex(normaliseName(ud.firstName));
  if (ud.lastName) userData.ln = sha256hex(normaliseName(ud.lastName));
  if (ud.externalId) userData.external_id = sha256hex(ud.externalId);
  if (ud.city) userData.ct = sha256hex(normaliseAsciiText(ud.city));
  if (ud.postalCode) userData.zp = sha256hex(ud.postalCode);
  if (ud.fbc) userData.fbc = ud.fbc;
  if (ud.fbp) userData.fbp = ud.fbp;
  if (ud.clientIpAddress) userData.client_ip_address = ud.clientIpAddress;
  if (ud.clientUserAgent) userData.client_user_agent = ud.clientUserAgent;

  const eventData: Record<string, unknown> = {
    event_name: payload.eventName,
    event_time: payload.eventTime,
    event_id: payload.eventId,
    action_source: "website",
    user_data: userData,
  };
  if (payload.eventSourceUrl) eventData.event_source_url = payload.eventSourceUrl;

  if (payload.value !== undefined) {
    eventData.custom_data = {
      value: payload.value,
      currency: payload.currency ?? "DZD",
      ...(payload.contentIds?.length
        ? { content_ids: payload.contentIds, content_type: "product" }
        : {}),
    };
  }

  const body: Record<string, unknown> = {
    data: [eventData],
  };
  if (payload.testEventCode) body.test_event_code = payload.testEventCode;

  const url = `${META_CAPI_ENDPOINT}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Meta CAPI network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const json = (await res.json().catch(() => null)) as {
    events_received?: number;
    fbtrace_id?: string;
    error?: { message?: string };
  } | null;

  if (res.status >= 500) {
    throw new Error(`Meta CAPI server error ${res.status}: ${json?.error?.message ?? "no message"}`);
  }
  if (!res.ok) {
    return { success: false, error: json?.error?.message ?? `HTTP ${res.status}`, httpStatus: res.status };
  }

  return {
    success: true,
    fbtraceId: json?.events_received === 1 ? json?.fbtrace_id : undefined,
    httpStatus: res.status,
  };
}
