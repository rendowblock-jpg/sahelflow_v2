/**
 * Pure helpers that keep the sidecar's inbound envelope inside what the app
 * accepts, and that explain a refusal without ever repeating its content.
 *
 * The app validates every spooled envelope with a strict schema before it
 * stores anything (`whatsappInboundEnvelopeSchema` in
 * src/lib/whatsapp/inbound-ingress.ts and the phone-outbound twin in
 * src/lib/whatsapp/phone-outbound.ts). The sidecar's own spool check only
 * demands a JID and a message ID, so a field the provider delivered in an odd
 * shape used to pass spooling and then be refused by the app on every retry,
 * forever, with nothing in the diagnostics saying why.
 *
 * Rule for every conform function below: a value the app already accepts comes
 * out as the value the app would have stored (same trimming, same number).
 * The app binds a provider event to a hash of those stored values, so a replay
 * that arrives in a different shape would be refused as "bound to different
 * content". Only values the app would have refused are changed.
 *
 * Imports are type-only, so this can be tested without the provider.
 */
import type { IncomingMessage } from "./whatsapp";

/** The longest string the app accepts for a JID, message ID or display name. */
const APP_FIELD_MAX = 256;

/** How many refused fields one diagnostics line names, and how long it may be. */
const MAX_REPORTED_ISSUES = 6;
const MAX_REPORTED_PATH_SEGMENTS = 8;
const MAX_REPORT_CHARS = 150;

/** A sender JID the app will accept, or undefined when there is none worth sending. */
export function conformParticipant(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  // The app counts characters (code points), not UTF-16 units, since zod 4.5.
  const length = Array.from(trimmed).length;
  return length >= 1 && length <= APP_FIELD_MAX ? trimmed : undefined;
}

/**
 * The sender's display name as the app accepts it. A display name is cosmetic,
 * so an over-long one is shortened rather than letting it block the message.
 * An empty name stays empty: the app accepts it and has stored it that way.
 */
export function conformPushName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let name = value.trim();
  const characters = Array.from(name);
  if (characters.length > APP_FIELD_MAX) {
    // Cut by characters (code points), as the app counts them: never half of a surrogate pair.
    name = characters.slice(0, APP_FIELD_MAX).join("").trim();
  }
  return name;
}

/**
 * The provider's message time as a non-negative whole number of seconds, which
 * is all the app accepts. Baileys hands over a plain number or a protobuf
 * `Long` (`low` and `high` are signed 32-bit halves; `low` goes negative for
 * times after January 2038). Anything else is 0, exactly as before: a decimal
 * string is deliberately NOT read, because the sidecar has always sent 0 for
 * one and the app may already hold the event that way.
 */
export function conformMessageTimestamp(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return 0;
    const whole = Math.floor(value);
    return Number.isSafeInteger(whole) ? whole : 0;
  }
  if (value !== null && typeof value === "object") {
    const { low, high } = value as { low?: unknown; high?: unknown };
    if (typeof low === "number" && Number.isFinite(low)) {
      const upper = typeof high === "number" && Number.isFinite(high) ? high : 0;
      // A negative signed Long is not a point in time.
      if (upper < 0) return 0;
      const combined = upper * 4_294_967_296 + (low >>> 0);
      return Number.isSafeInteger(combined) ? combined : 0;
    }
  }
  return 0;
}

/**
 * A copy of a spooled provider message with the three fields the app is strict
 * about made to fit. Applied to a record that is already queued, so a record
 * spooled by an older sidecar is sent in an acceptable shape too.
 */
export function conformIncomingForApp(message: IncomingMessage): IncomingMessage {
  return {
    ...message,
    key: {
      ...message.key,
      participant: conformParticipant(message.key.participant),
    },
    messageTimestamp: conformMessageTimestamp(message.messageTimestamp),
    pushName: conformPushName(message.pushName),
  };
}

function reportedSegment(value: unknown): string {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 1000) {
    return String(value);
  }
  if (typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value)) {
    return value;
  }
  return "?";
}

function reportedCode(value: unknown): string {
  return typeof value === "string" && /^[a-z_]{1,32}$/.test(value) ? value : "?";
}

/**
 * Which fields the app refused, and why, from the `details` of its 400
 * REQUEST_VALIDATION_FAILED answer. Only the field path and the validation code
 * are kept ("message.key.participant:too_small"). The app's own message text and
 * anything it echoed back are dropped, because they can hold what the customer
 * wrote. Returns null when there is nothing usable to say.
 */
export function summarizeRejectedFields(details: unknown): string | null {
  if (!Array.isArray(details)) return null;
  const parts: string[] = [];
  for (const issue of details.slice(0, MAX_REPORTED_ISSUES)) {
    if (issue === null || typeof issue !== "object") continue;
    const { path, code } = issue as { path?: unknown; code?: unknown };
    const segments = Array.isArray(path)
      ? path.slice(0, MAX_REPORTED_PATH_SEGMENTS).map(reportedSegment)
      : [];
    parts.push(`${segments.length > 0 ? segments.join(".") : "root"}:${reportedCode(code)}`);
  }
  if (parts.length === 0) return null;
  return parts.join(";").slice(0, MAX_REPORT_CHARS);
}
