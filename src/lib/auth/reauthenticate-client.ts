/**
 * Client side of POST /api/auth/reauthenticate (F-0023).
 *
 * The server answers 401 for two different things: a wrong PIN (code INVALID_CREDENTIALS) and a dead session (code
 * UNAUTHORIZED, also when the session was revoked a moment earlier by a successful reauthentication, which rotates
 * the session cookie). Every panel used to turn any 401 into "Incorrect PIN", so a correct PIN could be reported as
 * wrong. This helper reads `body.code` and returns one typed answer, so the screens can say the true thing.
 *
 * It also sends one request at a time: a second call made while the first is still in flight shares the first
 * request and its answer, because a second POST would carry the cookie the first one is about to revoke.
 */

export type ReauthResult =
  | { kind: "ok" }
  | { kind: "incorrect" }
  | { kind: "session-expired" }
  | { kind: "locked"; retryAfterSec?: number }
  | { kind: "unavailable" }
  /**
   * The client gave up waiting (15 s). Unlike "unavailable" the server may still finish and rotate the session, so the
   * next attempt could read 401. The screen tells the seller to wait, then reload. Nothing retries by itself.
   */
  | { kind: "slow" }
  | { kind: "invalid" };

/** Everything except success: what a screen has to explain to the seller. */
export type ReauthFailure = Exclude<ReauthResult, { kind: "ok" }>;

export const REAUTHENTICATE_TIMEOUT_MS = 15_000;

const REAUTHENTICATE_URL = "/api/auth/reauthenticate";

let inFlight: Promise<ReauthResult> | null = null;

async function readCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "code" in body) {
      const code = (body as { code?: unknown }).code;
      return typeof code === "string" ? code : undefined;
    }
  } catch {
    // An unreadable body carries no code; the status alone decides.
  }
  return undefined;
}

function readRetryAfterSec(response: Response): number | undefined {
  // Some render tests answer with a plain object that has no headers: never throw on that.
  const raw = response.headers?.get?.("Retry-After");
  if (!raw) return undefined;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

async function classify(response: Response): Promise<ReauthResult> {
  if (response.ok) return { kind: "ok" };
  if (response.status === 400) return { kind: "invalid" };
  if (response.status === 401) {
    // Only the server's own wrong-PIN code may be shown as a wrong PIN. Any other 401 means the session is gone.
    return (await readCode(response)) === "INVALID_CREDENTIALS"
      ? { kind: "incorrect" }
      : { kind: "session-expired" };
  }
  if (response.status === 429) {
    const retryAfterSec = readRetryAfterSec(response);
    return retryAfterSec === undefined ? { kind: "locked" } : { kind: "locked", retryAfterSec };
  }
  return { kind: "unavailable" };
}

async function send(pin: string): Promise<ReauthResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<ReauthResult>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve({ kind: "slow" });
    }, REAUTHENTICATE_TIMEOUT_MS);
  });
  const request = fetch(REAUTHENTICATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
    signal: controller.signal,
  }).then(classify);
  try {
    return await Promise.race([request, timeout]);
  } catch {
    // Only our own 15 s abort is "slow"; a network failure (including an abort-like error of its own) is "unavailable".
    return timedOut ? { kind: "slow" } : { kind: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

/** Confirm the PIN for the current session. Never rejects; never has two requests in flight. */
export function reauthenticateWithPin(pin: string): Promise<ReauthResult> {
  if (inFlight) return inFlight;
  const attempt = send(pin).finally(() => {
    if (inFlight === attempt) inFlight = null;
  });
  inFlight = attempt;
  return attempt;
}
