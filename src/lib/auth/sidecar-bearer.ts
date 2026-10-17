import { constantTimeEqual } from "./constant-time";

/**
 * The WhatsApp sidecar's bearer check (IDN-11), in one place.
 *
 * The sidecar is a contained local process, not a browser: it authenticates its
 * two private callbacks with the per-launch SIDECAR_TOKEN. The outer door
 * (src/proxy.ts) and the route handlers (via authenticateWhatsAppSidecar) both
 * decide through this function, so the two layers cannot drift apart. Where the
 * EXPECTED token comes from stays the caller's business (the proxy reads the
 * environment only; the routes also read the token file the sidecar publishes).
 *
 * Pure and dependency-light on purpose: the proxy imports it.
 */
export const SIDECAR_TOKEN_MIN_LENGTH = 16;

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

export function sidecarBearerMatches(
  authorization: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!expected || expected.length < SIDECAR_TOKEN_MIN_LENGTH) return false;
  const supplied = BEARER_PATTERN.exec(authorization ?? "")?.[1];
  return Boolean(supplied && constantTimeEqual(supplied, expected));
}
