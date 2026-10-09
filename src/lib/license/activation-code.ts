/**
 * Licence activation code: a signed entitlement in one copyable string.
 *
 *   SFLA1.<base64url JSON {claims, signature}>.<8-hex CRC-32 of the payload>
 *
 * The Founder's License Desk produces it and the seller pastes it, or opens
 * the `.sflicense` file that carries the same text. Whitespace and line
 * breaks are ignored, so a code that WhatsApp wrapped over several lines
 * still activates. The checksum only catches a truncated or mistyped code
 * before it reaches the server; authenticity is the Ed25519 signature, which
 * activation verifies against the offline permanent key compiled into the
 * release.
 *
 * Pure and dependency-free: it runs in the browser, on the server and inside
 * the standalone License Desk page.
 */
export const LICENSE_ACTIVATION_PREFIX = "SFLA1";
export const LICENSE_FILE_EXTENSION = ".sflicense";

export type ActivationParseErrorCode =
  | "LICENSE_CODE_EMPTY"
  | "LICENSE_CODE_UNRECOGNIZED"
  | "LICENSE_CODE_CHECKSUM"
  | "LICENSE_CODE_UNREADABLE";

export class ActivationCodeError extends Error {
  constructor(public readonly code: ActivationParseErrorCode) {
    super(code);
    this.name = "ActivationCodeError";
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32Hex(text: string): string {
  const bytes = new TextEncoder().encode(`${LICENSE_ACTIVATION_PREFIX}:${text}`);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Encode a signed entitlement (already validated by the signer). */
export function encodeActivationCode(signedEntitlement: unknown): string {
  const payload = toBase64Url(JSON.stringify(signedEntitlement));
  return `${LICENSE_ACTIVATION_PREFIX}.${payload}.${crc32Hex(payload)}`;
}

/**
 * Turn whatever the seller pasted or opened into the signed entitlement
 * object: an activation code, the content of a `.sflicense` file, or the
 * legacy raw JSON. Signature and binding checks stay on the server.
 */
export function parseActivationInput(input: string): Record<string, unknown> {
  const trimmed = input.trim();
  if (!trimmed) throw new ActivationCodeError("LICENSE_CODE_EMPTY");

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Fall through to the unreadable verdict below.
    }
    throw new ActivationCodeError("LICENSE_CODE_UNREADABLE");
  }

  const compact = trimmed.replace(/\s+/g, "");
  const start = compact.indexOf(`${LICENSE_ACTIVATION_PREFIX}.`);
  if (start < 0) throw new ActivationCodeError("LICENSE_CODE_UNRECOGNIZED");
  const parts = compact.slice(start).split(".");
  if (parts.length < 3) throw new ActivationCodeError("LICENSE_CODE_CHECKSUM");
  const payload = parts[1] ?? "";
  const checksum = (parts[2] ?? "").slice(0, 8).toLowerCase();
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || crc32Hex(payload) !== checksum) {
    throw new ActivationCodeError("LICENSE_CODE_CHECKSUM");
  }
  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through.
  }
  throw new ActivationCodeError("LICENSE_CODE_UNREADABLE");
}
