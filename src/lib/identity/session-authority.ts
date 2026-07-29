export type SessionAuthorityRecord = Readonly<{
  id: string;
  revokedAt: Date | null;
}>;

export type SessionAuthorityRejectionCode =
  | "AUTH_SECRET_UNAVAILABLE"
  | "SESSION_REQUIRED"
  | "SESSION_INVALID"
  | "LEGACY_SESSION_UNSUPPORTED"
  | "SESSION_NOT_FOUND"
  | "SESSION_REVOKED"
  | "SESSION_AUTHORITY_UNAVAILABLE";

export type SessionAuthorityResult =
  | Readonly<{ status: "setup" }>
  | Readonly<{ status: "authenticated"; sessionId: string }>
  | Readonly<{
      status: "rejected";
      code: SessionAuthorityRejectionCode;
    }>;

export type ResolveSessionAuthorityInput = Readonly<{
  token: string | undefined;
  secret: string | null;
  authSetup: boolean;
  verifyToken: (token: string, secret: string) => Promise<boolean>;
  getSessionId: (token: string) => string | null;
  findSession: (sessionId: string) => Promise<SessionAuthorityRecord | null>;
}>;

const MAX_SESSION_ID_LENGTH = 256;

function isExactSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SESSION_ID_LENGTH &&
    value === value.trim()
  );
}

/**
 * Resolve the current local session through one fail-closed authority boundary.
 *
 * `setup` is deliberately distinct from authentication: onboarding may continue
 * before a PIN exists, but callers that need a trusted actor must reject setup
 * mode because no authenticated principal exists yet.
 */
export async function resolveSessionAuthority(
  input: ResolveSessionAuthorityInput,
): Promise<SessionAuthorityResult> {
  if (!input.secret) {
    return input.authSetup
      ? { status: "rejected", code: "AUTH_SECRET_UNAVAILABLE" }
      : { status: "setup" };
  }

  if (!input.token) {
    return { status: "rejected", code: "SESSION_REQUIRED" };
  }

  let signatureValid = false;
  try {
    signatureValid = await input.verifyToken(input.token, input.secret);
  } catch {
    return { status: "rejected", code: "SESSION_INVALID" };
  }
  if (!signatureValid) {
    return { status: "rejected", code: "SESSION_INVALID" };
  }

  let sessionId: unknown = null;
  try {
    sessionId = input.getSessionId(input.token);
  } catch {
    return { status: "rejected", code: "SESSION_INVALID" };
  }
  if (sessionId === null) {
    return { status: "rejected", code: "LEGACY_SESSION_UNSUPPORTED" };
  }
  if (!isExactSessionId(sessionId)) {
    return { status: "rejected", code: "SESSION_INVALID" };
  }

  let session: SessionAuthorityRecord | null;
  try {
    session = await input.findSession(sessionId);
  } catch {
    return { status: "rejected", code: "SESSION_AUTHORITY_UNAVAILABLE" };
  }

  if (!session || session.id !== sessionId) {
    return { status: "rejected", code: "SESSION_NOT_FOUND" };
  }
  if (session.revokedAt) {
    return { status: "rejected", code: "SESSION_REVOKED" };
  }

  return { status: "authenticated", sessionId };
}
