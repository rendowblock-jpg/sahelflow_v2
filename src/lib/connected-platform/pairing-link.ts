// The link and typing code the desktop shows when it pairs a phone, and the
// ten-minute countdown. Pure and isomorphic (the phone parses the same text).
import { deviceFingerprint, parsePairingLink } from "./web/fingerprint";

/**
 * Where the phone app will live. That host is NOT created yet: it is the
 * Founder's word (new cloud resource). Everything after the "#" never reaches
 * a server, so changing this constant later does not change the secrets.
 */
export const PHONE_APP_ORIGIN = "https://app.sahelflow.com";
/**
 * The "Your phone" card in Settings is shown only when this is true. It stays false until the phone app has a real home:
 * the host above exists, PWA_ORIGINS is set on the relay and the relay database migrations 0002 and 0003 are applied.
 * All of that is the Founder's word. Until then a seller would be offered a link that opens nothing.
 */
export const PHONE_PAIRING_AVAILABLE = false;
export const PAIRING_TTL_MS = 10 * 60 * 1000;

const ORIGIN = /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/;
const PIN_SEGMENT = /^[0-9A-Fa-f]{16}$/;

export type DesktopPairingFragment = Readonly<{ pairingId: string; pairingToken: string; pin: string }>;

export type DesktopPairingLink = Readonly<{
  link: string;
  /** "#p=<pairingId>.<token>.<16 hex>" */
  hash: string;
  /** The same three segments in groups of 4 characters, for typing. */
  code: string;
  pin: string;
}>;

function groupsOfFour(segment: string): string {
  return segment.match(/.{1,4}/g)?.join(" ") ?? "";
}

function pinFromSegment(segment: string): string | null {
  if (!PIN_SEGMENT.test(segment)) return null;
  const upper = segment.toUpperCase();
  return `${upper.slice(0, 4)}-${upper.slice(4, 8)}-${upper.slice(8, 12)}-${upper.slice(12, 16)}`;
}

/** Strict: exactly "#p=<id>.<token>.<16 hex>". Null for anything else. Never throws. */
export function parseDesktopPairingHash(hash: string): DesktopPairingFragment | null {
  if (typeof hash !== "string" || !hash.startsWith("#p=") || hash.length > 400) return null;
  const parts = hash.slice(3).split(".");
  if (parts.length !== 3) return null;
  const [pairingId, pairingToken, segment] = parts;
  if (pairingId === undefined || pairingToken === undefined || segment === undefined) return null;
  const base = parsePairingLink(`#p=${pairingId}.${pairingToken}`);
  const pin = pinFromSegment(segment);
  if (!base || !pin) return null;
  return Object.freeze({ pairingId: base.pairingId, pairingToken: base.pairingToken, pin });
}

export async function buildDesktopPairingLink(input: Readonly<{
  pairingId: string;
  pairingToken: string;
  /** Raw 32-byte Ed25519 key in base64 (the desktop's signing public key). */
  desktopSigningPublicKey: string;
  origin?: string;
}>): Promise<DesktopPairingLink | null> {
  const origin = input.origin ?? PHONE_APP_ORIGIN;
  if (!ORIGIN.test(origin)) return null;
  const pin = await deviceFingerprint(input.desktopSigningPublicKey);
  if (!pin) return null;
  const body = `${input.pairingId}.${input.pairingToken}.${pin.replaceAll("-", "")}`;
  const hash = `#p=${body}`;
  const parsed = parseDesktopPairingHash(hash);
  if (!parsed) return null;
  return Object.freeze({
    link: `${origin}/${hash}`,
    hash,
    code: body.split(".").map(groupsOfFour).join(" / "),
    pin,
  });
}

/** Reads what the seller typed or pasted ("xxxx xxxx / ... / ..."). Null when it does not parse. */
export function parseTypingCode(text: string): DesktopPairingFragment | null {
  if (typeof text !== "string" || text.length > 600) return null;
  const segments = text.split("/").map((part) => part.replace(/\s+/g, ""));
  if (segments.length !== 3) return null;
  return parseDesktopPairingHash(`#p=${segments.join(".")}`);
}

export type PairingCountdown = Readonly<{
  remainingMs: number;
  /** "09:59" */
  label: string;
  expired: boolean;
  /** 1 at the start, 0 at the end. */
  progress: number;
}>;

/** Time left on a pairing. The clock is a parameter so it can be faked. */
export function pairingCountdown(expiresAtMs: number, nowMs: number, ttlMs: number = PAIRING_TTL_MS): PairingCountdown {
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs)) {
    return { remainingMs: 0, label: "00:00", expired: true, progress: 0 };
  }
  // Never more than the ttl, even if the relay's clock runs ahead of ours.
  const remainingMs = Math.min(ttlMs, Math.max(0, expiresAtMs - nowMs));
  const seconds = Math.ceil(remainingMs / 1000);
  const label = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return {
    remainingMs,
    label,
    expired: remainingMs === 0,
    progress: Math.min(1, remainingMs / ttlMs),
  };
}
