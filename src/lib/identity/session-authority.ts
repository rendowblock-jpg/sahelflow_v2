export type SessionAuthorityRecord = Readonly<{
  id: string;
  issuedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}>;

export type SessionAuthorityRejectionCode =
  | "AUTH_SECRET_UNAVAILABLE"
  | "SESSION_REQUIRED"
  | "SESSION_INVALID"
  | "LEGACY_SESSION_UNSUPPORTED"
  | "SESSION_NOT_FOUND"
  | "SESSION_REVOKED"
  | "SESSION_OVERALL_EXPIRED"
  | "SESSION_INACTIVE"
  | "SESSION_AUTHORITY_UNAVAILABLE";

export type SessionAuthorityResult =
  | Readonly<{ status: "setup" }>
  | Readonly<{
      status: "authenticated";
      sessionId: string;
      issuedAt: Date;
      lastSeenAt: Date;
    }>
  | Readonly<{
      status: "rejected";
      code: SessionAuthorityRejectionCode;
    }>;

export type ResolveSessionAuthorityInput = Readonly<{
  token: string | undefined;
  secret: string | null;
  authSetup: boolean;
  now: Date;
  overallTimeoutMs: number;
  inactivityTimeoutMs: number;
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

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/**
 * Resolve the current local session through one fail-closed authority boundary.
 * Setup remains a separate onboarding state, never authenticated authority.
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

  if (
    !isValidDate(input.now) ||
    !isValidDate(session.issuedAt) ||
    !isValidDate(session.lastSeenAt) ||
    !Number.isSafeInteger(input.overallTimeoutMs) ||
    input.overallTimeoutMs <= 0 ||
    !Number.isSafeInteger(input.inactivityTimeoutMs) ||
    input.inactivityTimeoutMs <= 0
  ) {
    return { status: "rejected", code: "SESSION_INVALID" };
  }

  const nowMs = input.now.getTime();
  const issuedAtMs = session.issuedAt.getTime();
  const lastSeenAtMs = session.lastSeenAt.getTime();
  if (issuedAtMs > nowMs || lastSeenAtMs < issuedAtMs || lastSeenAtMs > nowMs) {
    return { status: "rejected", code: "SESSION_INVALID" };
  }
  if (nowMs - issuedAtMs >= input.overallTimeoutMs) {
    return { status: "rejected", code: "SESSION_OVERALL_EXPIRED" };
  }
  if (nowMs - lastSeenAtMs >= input.inactivityTimeoutMs) {
    return { status: "rejected", code: "SESSION_INACTIVE" };
  }

  return {
    status: "authenticated",
    sessionId,
    issuedAt: session.issuedAt,
    lastSeenAt: session.lastSeenAt,
  };
}
