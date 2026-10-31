import { createHash } from "node:crypto";

const BASE64URL = /^[A-Za-z0-9_-]*$/;

export function base64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64url");
}

// Strict on purpose: no padding, no other alphabet, only the canonical spelling.
export function base64urlDecode(text: string): Buffer | null {
  if (typeof text !== "string" || !BASE64URL.test(text)) return null;
  const bytes = Buffer.from(text, "base64url");
  return bytes.toString("base64url") === text ? bytes : null;
}

// The only identifier of a subscription that may reach a log or a result.
export function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 12);
}
