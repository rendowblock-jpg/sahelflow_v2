/**
 * A page that throws ACTION_FORBIDDEN carries this digest so the route's error
 * boundary can tell "you may not open this" from a genuine failure. Next.js
 * keeps an error's own digest across the server/client boundary, while the
 * message is stripped in production builds.
 *
 * Client-safe: imported by the error boundary as well as the authorizer.
 */
export const ACTION_FORBIDDEN_DIGEST_PREFIX = "SAHELFLOW_ACTION_FORBIDDEN:";

export function forbiddenActionDigest(action: string): string {
  return `${ACTION_FORBIDDEN_DIGEST_PREFIX}${action}`;
}

/** The denied action, or null when the digest is not an access denial. */
export function forbiddenActionFromDigest(
  digest: string | undefined,
): string | null {
  if (!digest?.startsWith(ACTION_FORBIDDEN_DIGEST_PREFIX)) return null;
  const action = digest.slice(ACTION_FORBIDDEN_DIGEST_PREFIX.length);
  return /^[a-z]+(\.[a-z]+)+$/.test(action) ? action : null;
}
