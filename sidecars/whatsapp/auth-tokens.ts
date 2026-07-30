import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const WS_GRANT_PURPOSE = "sahelflow/whatsapp/websocket-grant/v1";
const PROVIDER_ACCOUNT_PURPOSE = "sahelflow/whatsapp/provider-account/v1";
const DEFAULT_TTL_MS = 30_000;
const MIN_TTL_MS = 5_000;
const MAX_TTL_MS = 60_000;
const DURABLE_EFFECT_PATTERN =
  /^wa:[0-9a-f]{32}:([0-9a-f]{64}):(text|daily-report):[A-Za-z0-9_-]{1,80}$/;

interface WebSocketGrantPayload {
  v: 1;
  exp: number;
  sub: string;
  nonce: string;
}

export interface VerifiedWebSocketGrant {
  expiresAt: number;
  subject: string;
}

function assertRestToken(restToken: string): void {
  if (restToken.length < 16) {
    throw new Error("Sidecar REST token is too short");
  }
}

function normalizedSubject(subject: string): string {
  const value = subject.trim();
  if (!value || value.length > 200) {
    throw new Error("WebSocket grant subject is invalid");
  }
  return value;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function signature(restToken: string, encodedPayload: string): string {
  return createHmac("sha256", restToken)
    .update(WS_GRANT_PURPOSE)
    .update("\0")
    .update(encodedPayload)
    .digest("base64url");
}

/**
 * Normalize Baileys' account JID to the stable WhatsApp account number. Device
 * suffixes such as `:12` and the server suffix are deliberately excluded.
 */
export function normalizeWhatsAppAccountId(accountId: string): string {
  const localPart = accountId.trim().split("@")[0] ?? "";
  const primary = localPart.split(":")[0] ?? "";
  const digits = primary.replace(/\D/g, "");
  if (!/^\d{6,20}$/.test(digits)) {
    throw new Error("WhatsApp account identity is invalid");
  }
  return digits;
}

/** Hash provider identity before it enters a durable effect key or receipt file. */
export function hashWhatsAppAccountId(accountId: string): string {
  return createHash("sha256")
    .update(PROVIDER_ACCOUNT_PURPOSE)
    .update("\0")
    .update(normalizeWhatsAppAccountId(accountId))
    .digest("hex");
}

/** Return the provider-account hash embedded in a governed durable effect key. */
export function getWhatsAppEffectAccountHash(effectKey: string): string | null {
  return DURABLE_EFFECT_PATTERN.exec(effectKey)?.[1] ?? null;
}

/** Fail closed when a queued/replayed effect belongs to another paired account. */
export function effectKeyMatchesWhatsAppAccount(
  effectKey: string,
  accountId: string,
): boolean {
  const expected = getWhatsAppEffectAccountHash(effectKey);
  if (!expected) return false;
  try {
    return safeEqual(expected, hashWhatsAppAccountId(accountId));
  } catch {
    return false;
  }
}

/**
 * Issue a short-lived browser-visible grant for the push-only WebSocket.
 * The private REST credential is never exposed, and a retained browser grant
 * becomes unusable shortly after the authenticated app session stops renewing it.
 */
export function createSidecarWebSocketGrant(
  restToken: string,
  subject: string,
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
): string {
  assertRestToken(restToken);
  if (!Number.isFinite(now) || !Number.isInteger(now)) {
    throw new Error("WebSocket grant clock is invalid");
  }
  if (!Number.isInteger(ttlMs) || ttlMs < MIN_TTL_MS || ttlMs > MAX_TTL_MS) {
    throw new Error("WebSocket grant lifetime is invalid");
  }
  const payload: WebSocketGrantPayload = {
    v: 1,
    exp: now + ttlMs,
    sub: normalizedSubject(subject),
    nonce: randomBytes(16).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encoded}.${signature(restToken, encoded)}`;
}

/** Verify signature, version, bounded lifetime and expiry at the sidecar boundary. */
export function verifySidecarWebSocketGrant(
  grant: string,
  restToken: string,
  now = Date.now(),
): VerifiedWebSocketGrant | null {
  try {
    assertRestToken(restToken);
    if (grant.length > 1024) return null;
    const parts = grant.split(".");
    if (parts.length !== 2) return null;
    const [encoded, suppliedSignature] = parts;
    if (!encoded || !suppliedSignature) return null;
    if (!safeEqual(suppliedSignature, signature(restToken, encoded))) return null;

    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<WebSocketGrantPayload>;
    if (
      parsed.v !== 1 ||
      !Number.isSafeInteger(parsed.exp) ||
      typeof parsed.sub !== "string" ||
      !parsed.sub ||
      parsed.sub.length > 200 ||
      typeof parsed.nonce !== "string" ||
      !/^[0-9a-f]{32}$/.test(parsed.nonce)
    ) {
      return null;
    }
    if (parsed.exp <= now || parsed.exp > now + MAX_TTL_MS) return null;
    return { expiresAt: parsed.exp, subject: parsed.sub };
  } catch {
    return null;
  }
}
