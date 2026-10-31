// Sends one Web Push message. Everything outside is injected: the network
// (fetchImpl), the clock (now) and, for tests only, the address guard.
import { encryptPayload } from "./encrypt";
import { PUSH_POLICY, buildPayload, serializePayload, topicFor, type PushKind } from "./payload";
import { assertPushEndpoint } from "./ssrf";
import { base64urlDecode, endpointHash } from "./util";
import { buildVapidHeader } from "./vapid";

export const DEFAULT_TIMEOUT_MS = 10_000;
// One retry per entry: 1, 5 and 15 minutes after the failed try.
export const BACKOFF_MS: readonly number[] = [60_000, 300_000, 900_000];
export const MAX_RETRIES = 3;
const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 3_600_000;

export type PushFetchInit = {
  method: "POST";
  headers: Record<string, string>;
  body: Uint8Array;
  redirect: "error";
  credentials: "omit";
  cache: "no-store";
  referrerPolicy: "no-referrer";
  signal: AbortSignal;
};
export type PushFetchResponse = {
  status: number;
  headers: { get(name: string): string | null };
};
export type PushFetch = (url: string, init: PushFetchInit) => Promise<PushFetchResponse>;

export type SendPushInput = {
  subscription: { endpoint: string; p256dh: string; auth: string };
  kind: PushKind;
  count: number;
  vapid: { privateKey: string; publicKey: string; subject: string };
  fetchImpl: PushFetch;
  /** Epoch milliseconds. */
  now: number;
  /** Which try this is, from 1. After a "retry" result, pass its nextAttempt. */
  attempt?: number;
  /** Keep the same id across retries of one event. Default: random. */
  id?: string;
  /** Tests only, and only by passing it in: the default is the production allow-list. */
  endpointGuard?: (endpoint: string) => URL;
  timeoutMs?: number;
};

// A result never holds the endpoint, the keys or the payload: only a short hash.
type Common = { endpointHash: string; httpStatus: number | null };
export type SendResult =
  | (Common & { status: "ok" | "gone" | "gave_up" | "vapid_problem" | "bug" | "blocked" })
  | (Common & { status: "retry"; retryAfterMs: number; nextAttempt: number });

function parseRetryAfter(value: string | null, now: number): number | null {
  if (value === null) return null;
  const text = value.trim();
  let ms: number;
  if (/^\d{1,9}$/.test(text)) {
    ms = Number(text) * 1000;
  } else if (/^[A-Za-z]{3}, /.test(text)) {
    const at = Date.parse(text);
    if (Number.isNaN(at)) return null;
    ms = at - now;
  } else {
    return null;
  }
  return Math.min(Math.max(ms, MIN_RETRY_MS), MAX_RETRY_MS);
}

export async function sendPush(input: SendPushInput): Promise<SendResult> {
  const attempt = input.attempt === undefined ? 1 : input.attempt;
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError("attempt must be a whole number from 1");
  }
  const hash = endpointHash(input.subscription.endpoint);
  const done = (
    status: "ok" | "gone" | "gave_up" | "vapid_problem" | "bug" | "blocked",
    httpStatus: number | null,
  ): SendResult => ({ status, httpStatus, endpointHash: hash });
  const retryOrGiveUp = (httpStatus: number | null, wanted: number | null): SendResult => {
    if (attempt > MAX_RETRIES) return done("gave_up", httpStatus);
    const wait = wanted === null ? (BACKOFF_MS[attempt - 1] ?? MAX_RETRY_MS) : wanted;
    return { status: "retry", httpStatus, endpointHash: hash, retryAfterMs: wait, nextAttempt: attempt + 1 };
  };

  // A bad kind or count is the caller's bug: throw before anything else happens.
  const payload = buildPayload({ kind: input.kind, count: input.count, now: input.now, id: input.id });

  let url: URL;
  try {
    url = (input.endpointGuard ?? assertPushEndpoint)(input.subscription.endpoint);
  } catch {
    return done("blocked", null);
  }

  const uaPublic = base64urlDecode(input.subscription.p256dh);
  const authSecret = base64urlDecode(input.subscription.auth);
  if (!uaPublic || uaPublic.length !== 65 || uaPublic[0] !== 4 || !authSecret || authSecret.length !== 16) {
    return done("bug", null);
  }

  let body: Buffer;
  try {
    body = encryptPayload({ plaintext: serializePayload(payload), uaPublic, authSecret });
  } catch {
    return done("bug", null);
  }

  let authorization: string;
  try {
    authorization = buildVapidHeader({
      endpoint: url.href,
      privateKey: input.vapid.privateKey,
      publicKey: input.vapid.publicKey,
      subject: input.vapid.subject,
      now: input.now,
    });
  } catch {
    return done("vapid_problem", null);
  }

  const policy = PUSH_POLICY[payload.k];
  const headers: Record<string, string> = {
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(policy.ttlSeconds),
    Urgency: policy.urgency,
    Topic: topicFor(authSecret, payload.k),
    Authorization: authorization,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: PushFetchResponse;
  try {
    response = await input.fetchImpl(url.href, {
      method: "POST",
      headers,
      body: new Uint8Array(body),
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
  } catch {
    // The error text may contain the address: it is dropped on purpose.
    return retryOrGiveUp(null, null);
  } finally {
    clearTimeout(timer);
  }

  const status = response.status;
  if (status >= 200 && status < 300) return done("ok", status);
  if (status === 404 || status === 410) return done("gone", status);
  if (status === 401 || status === 403) return done("vapid_problem", status);
  if (status === 429) return retryOrGiveUp(status, parseRetryAfter(response.headers.get("retry-after"), input.now));
  if (status >= 500 && status < 600) return retryOrGiveUp(status, null);
  return done("bug", status);
}
