/**
 * Svix webhook signature verification — pure module (dormant).
 *
 * ZR Express (new platform) delivers webhooks through Svix. CodFlow's
 * live-proven verification is transcribed here verbatim in contract terms
 * (cod-server/src/endpoints/webhooks/svix-verify.ts @ 00f18fa, Apache-2.0),
 * re-expressed with node:crypto because SahelFlow runs on the desktop
 * runtime, not Cloudflare Workers.
 *
 * DORMANT BY DESIGN: FD-061's extraction boundary explicitly does NOT port
 * CodFlow's webhook receivers — the SahelFlow desktop cannot receive inbound
 * webhooks and tracking stays pull + reconcile. This module carries only the
 * verification CONSTANTS and primitive so the contract is pinned and tested
 * for the future control-plane receiver (#230) or a Founder-authorized
 * surface. No route or handler is wired to it.
 *
 * Contract (https://docs.svix.com/receiving/verifying-payloads/how-manual):
 *   - Signed content is exactly "{svix-id}.{svix-timestamp}.{rawBody}".
 *   - Secret header format "whsec_<base64-encoded-secret>"; the prefix is
 *     stripped and the remainder base64-decodes to the raw HMAC key.
 *   - Signature header "v1,<base64>"; the header may carry several
 *     space-separated candidates and ANY match authenticates.
 *   - Anti-replay: |now − svix-timestamp| > 300 s is rejected.
 *   - HMAC-SHA256, compared against every v1 candidate.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export interface SvixSignatureHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/** Compute the base64 v1 signature for a signed delivery (test/ops helper). */
export function computeSvixSignature(
  secret: string,
  id: string,
  timestamp: string,
  rawBody: string,
): string {
  const keyBytes = decodeSvixKey(secret);
  if (!keyBytes) throw new Error("Invalid Svix secret: not base64 after the whsec_ prefix");
  return createHmac("sha256", keyBytes)
    .update(`${id}.${timestamp}.${rawBody}`, "utf8")
    .digest("base64");
}

function decodeSvixKey(secret: string): Buffer | null {
  const base64Secret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  try {
    return Buffer.from(base64Secret, "base64");
  } catch {
    return null;
  }
}

function signaturesMatch(candidate: string, computed: string): boolean {
  const left = Buffer.from(candidate, "utf8");
  const right = Buffer.from(computed, "utf8");
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

/**
 * Verify an inbound Svix-signed delivery against the endpoint secret.
 * Returns false (never throws) for missing headers, a malformed or
 * out-of-tolerance timestamp, an undecodable secret, or a signature mismatch.
 */
export function verifySvixSignature(
  rawBody: string,
  headers: SvixSignatureHeaders,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const seconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(seconds)) return false;
  const nowSeconds = Math.floor(nowMs / 1000);
  if (Math.abs(nowSeconds - seconds) > SVIX_TOLERANCE_SECONDS) return false;

  let keyBytes: Buffer;
  try {
    keyBytes = decodeSvixKey(secret) ?? Buffer.alloc(0);
    if (keyBytes.length === 0) return false;
  } catch {
    return false;
  }

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const computed = createHmac("sha256", keyBytes)
    .update(signedContent, "utf8")
    .digest("base64");

  // The svix-signature header may contain multiple "v1,<base64>" entries
  // separated by spaces; the delivery is accepted when ANY matches.
  for (const candidate of signature.split(" ")) {
    const [version, value] = candidate.split(",");
    if (version === "v1" && value && signaturesMatch(value, computed)) {
      return true;
    }
  }
  return false;
}
