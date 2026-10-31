// Pure helpers for the phone list: merge what the relay knows with what the
// desktop approved, relative "last seen", and the human refusal for the limit.
import { pairingCode } from "./web/fingerprint";

export type DeviceStatus = "pending" | "approved" | "revoked";

export type DeviceView = Readonly<{
  deviceId: string;
  memberId: string;
  /** The relay stores no name; the interface localises "Phone 1", "Phone 2". */
  name: string | null;
  fingerprint: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  /** When the relay recorded the revocation, if it did. */
  revokedAt: string | null;
  status: DeviceStatus;
  revocationEpoch: number;
}>;

export type LocalDeviceState = Readonly<{
  /** deviceId -> approved at (ms). */
  approved: Readonly<Record<string, number>>;
  /** deviceId -> when this desktop created the pairing (ms). */
  created: Readonly<Record<string, number>>;
}>;

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const SQL_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

// D1's CURRENT_TIMESTAMP is UTC without a zone marker.
function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(SQL_TIME.test(value) ? `${value.replace(" ", "T")}Z` : value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** What the seller typed from the phone, reduced to the code alphabet (0-9 A-F, upper case). */
export function normalizePairingCodeInput(typed: string): string {
  if (typeof typed !== "string") return "";
  return typed
    .normalize("NFKC")
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[^0-9a-fA-F]/g, "")
    .toUpperCase();
}

/** True only when the typed text is exactly the device's code. A device with no code never matches. */
export function pairingCodeMatches(typed: string, deviceCode: string | null): boolean {
  if (!deviceCode) return false;
  const wanted = normalizePairingCodeInput(deviceCode);
  return wanted.length === 16 && normalizePairingCodeInput(typed) === wanted;
}

export async function mergeDevices(rows: readonly unknown[], local: LocalDeviceState): Promise<DeviceView[]> {
  const views: DeviceView[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const deviceId = String(row.device_id ?? "");
    const memberId = String(row.member_id ?? "");
    if (!ID.test(deviceId) || !ID.test(memberId)) continue;
    const createdMs = local.created[deviceId];
    const relayRevoked = typeof row.revoked_at === "string" && row.revoked_at.length > 0;
    const epoch = typeof row.revocation_epoch === "number" && Number.isSafeInteger(row.revocation_epoch) ? row.revocation_epoch : 0;
    views.push({
      deviceId,
      memberId,
      name: null,
      // Covers the signing key AND the RSA key: a row without a usable RSA key has no code, so it cannot be approved.
      fingerprint: await pairingCode(row.signing_public_key as string, row.encryption_public_key),
      createdAt: isoOrNull(row.created_at) ?? (createdMs === undefined ? null : new Date(createdMs).toISOString()),
      lastSeenAt: isoOrNull(row.last_seen_at),
      revokedAt: isoOrNull(row.revoked_at),
      status: relayRevoked ? "revoked" : local.approved[deviceId] === undefined ? "pending" : "approved",
      revocationEpoch: epoch,
    });
  }
  return views.sort((a, b) =>
    (a.createdAt ?? "9999").localeCompare(b.createdAt ?? "9999") || a.deviceId.localeCompare(b.deviceId));
}

/** Value and unit for Intl.RelativeTimeFormat ("now" is 0 seconds with numeric: "auto"). */
export function relativeTimeParts(thenMs: number, nowMs: number): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  if (!Number.isFinite(thenMs) || !Number.isFinite(nowMs)) return { value: 0, unit: "second" };
  const seconds = Math.round((thenMs - nowMs) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return { value: 0, unit: "second" };
  if (abs < 45 * 60) return { value: Math.round(seconds / 60), unit: "minute" };
  if (abs < 22 * 3600) return { value: Math.round(seconds / 3600), unit: "hour" };
  if (abs < 45 * 86400) return { value: Math.round(seconds / 86400), unit: "day" };
  return { value: Math.round(seconds / (30 * 86400)), unit: "month" };
}

export type PairingRefusal = Readonly<{ code: string; status: number; message: string }>;

/** What the seller is told when the relay refuses a new pairing. Null: not a known refusal. */
export function pairingRefusalFromRelay(status: number, relayCode: string): PairingRefusal | null {
  if (status === 403 && relayCode === "entitlement_limit_reached") {
    return {
      code: "PHONE_DEVICE_LIMIT",
      status: 409,
      message: "The limit of paired phones is reached (3 for the owner, 2 for each team member). Remove a phone you no longer use, then try again.",
    };
  }
  if (status === 429) {
    return { code: "PHONE_PAIRING_RATE_LIMITED", status: 429, message: "Too many attempts. Wait a minute and try again." };
  }
  if (status === 401) {
    return { code: "PHONE_RELAY_REFUSED", status: 409, message: "This shop is not recognised by the connected service. Check the connection in Settings." };
  }
  if (status === 503 || status === 504 || relayCode === "remote_unavailable" || relayCode === "remote_timeout") {
    return { code: "PHONE_RELAY_UNAVAILABLE", status: 503, message: "The connected service cannot be reached. Check the internet connection and try again." };
  }
  return null;
}
