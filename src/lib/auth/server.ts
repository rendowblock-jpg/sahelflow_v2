import "server-only";

import { existsSync } from "node:fs";
import { cache } from "react";
import { cookies } from "next/headers";

import { logAudit } from "@/lib/audit";
import {
  openAuthSecretValue,
  sealAuthSecretValue,
} from "@/lib/crypto/auth-secret-seal";
import { ProtectedDataCorruptionError } from "@/lib/crypto/protected-data-error";
import type { ServiceContext } from "@/lib/data/service-base";
import { db, shopContext } from "@/lib/db";
import type { Phase2Action } from "@/lib/identity/permissions";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import {
  bindOwnerIdentitySession,
  identityAuthorityMarkerPath,
  identityAuthorityPath,
  resolveDurableIdentityActor,
} from "@/lib/identity/control-authority";
import {
  resolveSessionAuthority,
  type SessionAuthorityResult,
} from "@/lib/identity/session-authority";
import { assertProcessShopAuthority } from "@/lib/shops/authority";
import { SahelFlowError } from "@/types/errors";
import {
  AUTH_COOKIE,
  AUTH_SECRET_ENV,
  SESSION_ACTIVITY_WRITE_INTERVAL_MS,
  SESSION_INACTIVITY_TIMEOUT_MS,
  SESSION_OVERALL_TIMEOUT_MS,
  SESSION_TTL_MS,
  SENSITIVE_REAUTH_WINDOW_MS,
} from "./config";
import {
  createSessionToken,
  CURRENT_PBKDF2_ITERATIONS,
  generateSecret,
  getSessionIdFromToken,
  hashPin,
  verifyPin,
  verifyPinDetailed,
  verifySessionToken,
} from "./crypto";
import { requireReauthenticationIdentityEligibility } from "./reauthentication-authority";

const LEGACY_AUTH_SECRET_KEY = "auth_secret";
const LEGACY_AUTH_PIN_KEY = "auth_pin_hash";
const DIRECT_ROUTE_TEST_AUTH_ENV = "SF_DIRECT_ROUTE_TEST_AUTHORITY";
const DIRECT_ROUTE_TEST_AUTH_VALUE = "vitest-business-routes";
const IDENTITY_AUTHORITY_FOOTPRINT_KEY = "identity_authority_initialized_v1";
const IDENTITY_AUTHORITY_FOOTPRINT_VERSION = 1 as const;
const authContext = { prisma: db, shop: shopContext } satisfies ServiceContext;
// The sealed-value helpers need the key-authority delegate; the shop-authority
// extension preserves it at runtime — single-point cast mirrors the
// secrets/index.ts authorityClient pattern.
type AuthKeyAuthorityClient = Parameters<typeof sealAuthSecretValue>[0];
const authKeyAuthority = authContext.prisma as unknown as AuthKeyAuthorityClient;

let migrationDone = false;
async function migrateAuthSecretsIfNeeded(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;
  try {
    const existing = await authContext.prisma.authSecret.findUnique({
      where: { id: "default" },
    });
    if (existing) return;
    const legacySecret = await authContext.prisma.setting.findUnique({
      where: { key: LEGACY_AUTH_SECRET_KEY },
    });
    const legacyPin = await authContext.prisma.setting.findUnique({
      where: { key: LEGACY_AUTH_PIN_KEY },
    });
    if (!legacySecret?.value || !legacyPin?.value) return;
    await authContext.prisma.authSecret.create({
      data: {
        id: "default",
        secret: legacySecret.value,
        pinHash: await sealAuthSecretValue(
          authKeyAuthority,
          "pinHash",
          legacyPin.value,
        ),
      },
    });
    await authContext.prisma.setting.deleteMany({
      where: { key: { in: [LEGACY_AUTH_SECRET_KEY, LEGACY_AUTH_PIN_KEY] } },
    });
  } catch {
    // Non-fatal legacy migration attempt; authority reads below still fail closed.
  }
}

export const getAuthSecret = cache(async (): Promise<string | null> => {
  const envSecret = process.env[AUTH_SECRET_ENV];
  if (envSecret) return envSecret;
  await migrateAuthSecretsIfNeeded();
  try {
    const row = await authContext.prisma.authSecret.findUnique({
      where: { id: "default" },
    });
    if (row?.secret) return row.secret;
  } catch (error) {
    // A corrupted protected value must never degrade into the legacy Setting
    // row: callers would silently run on a stale signing secret.
    if (error instanceof ProtectedDataCorruptionError) throw error;
    // Database authority is interpreted below rather than as setup success.
  }
  try {
    const setting = await authContext.prisma.setting.findUnique({
      where: { key: LEGACY_AUTH_SECRET_KEY },
    });
    if (setting?.value) return setting.value;
  } catch {
    // Ignore the compatibility read; callers fail closed when setup is configured.
  }
  return null;
});

function isUniqueConstraintViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

/**
 * First-run owner creation. The authority row is created, never overwritten:
 * its primary key makes the database pick exactly ONE winner when two
 * submissions overlap, and the loser gets AUTH_ALREADY_SETUP without changing
 * anything (IDN-08; an upsert let the later write replace the earlier
 * submission's signing secret and PIN). The one row still repaired in place is
 * a half-written one with an empty PIN hash, which isAuthSetup() already treats
 * as "not set up"; that repair is itself a conditional single-row update.
 */
export async function setupAuth(pin: string): Promise<{ secret: string }> {
  const secret = generateSecret();
  const pinHash = await sealAuthSecretValue(
    authKeyAuthority,
    "pinHash",
    await hashPin(pin),
  );
  try {
    await authContext.prisma.authSecret.create({
      data: { id: "default", secret, pinHash },
    });
    return { secret };
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;
  }
  const repaired = await authContext.prisma.authSecret.updateMany({
    where: { id: "default", pinHash: "" },
    data: { secret, pinHash },
  });
  if (repaired.count === 1) return { secret };
  throw new SahelFlowError(
    "Auth is already set up. Use the settings page to change your PIN.",
    "AUTH_ALREADY_SETUP",
    409,
  );
}

export async function verifyAuthPinAndMaybeRehash(
  pin: string,
): Promise<{ valid: boolean; rehashed: boolean }> {
  await migrateAuthSecretsIfNeeded();
  const row = await authContext.prisma.authSecret.findUnique({
    where: { id: "default" },
  });
  if (!row?.pinHash) return { valid: false, rehashed: false };
  const storedPinHash = await openAuthSecretValue(
    authKeyAuthority,
    "pinHash",
    row.pinHash,
  );
  const result = await verifyPinDetailed(pin, storedPinHash);
  if (!result.valid) return { valid: false, rehashed: false };
  if (result.needsRehash) {
    try {
      const newHash = await sealAuthSecretValue(
        authKeyAuthority,
        "pinHash",
        await hashPin(pin, CURRENT_PBKDF2_ITERATIONS),
      );
      await authContext.prisma.authSecret.update({
        where: { id: "default" },
        data: { pinHash: newHash },
      });
      return { valid: true, rehashed: true };
    } catch {
      return { valid: true, rehashed: false };
    }
  }
  return { valid: true, rehashed: false };
}

export async function verifyAuthPin(pin: string): Promise<boolean> {
  await migrateAuthSecretsIfNeeded();
  const row = await authContext.prisma.authSecret.findUnique({
    where: { id: "default" },
  });
  if (!row?.pinHash) return false;
  const storedPinHash = await openAuthSecretValue(
    authKeyAuthority,
    "pinHash",
    row.pinHash,
  );
  return verifyPin(pin, storedPinHash);
}

export async function isAuthSetup(): Promise<boolean> {
  await migrateAuthSecretsIfNeeded();
  try {
    const row = await authContext.prisma.authSecret.findUnique({
      where: { id: "default" },
    });
    if (row?.pinHash) return true;
    const setting = await authContext.prisma.setting.findUnique({
      where: { key: LEGACY_AUTH_PIN_KEY },
    });
    return Boolean(setting?.value);
  } catch {
    throw new SahelFlowError(
      "Authentication authority is temporarily unavailable",
      "SESSION_AUTHORITY_UNAVAILABLE",
      503,
    );
  }
}

async function setSessionCookie(secret: string, sessionId: string): Promise<void> {
  const token = await createSessionToken(secret, SESSION_TTL_MS, sessionId);
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

function expectedIdentityAuthorityFootprint(): string {
  return JSON.stringify({
    formatVersion: IDENTITY_AUTHORITY_FOOTPRINT_VERSION,
    workspaceId: shopContext.workspaceId,
    installationId: shopContext.installationId,
  });
}

function parseIdentityAuthorityFootprint(value: string): {
  formatVersion: 1;
  workspaceId: string;
  installationId: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new SahelFlowError(
      "The durable identity initialization footprint is malformed",
      "IDENTITY_AUTHORITY_FOOTPRINT_INVALID",
      503,
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { formatVersion?: unknown }).formatVersion !==
      IDENTITY_AUTHORITY_FOOTPRINT_VERSION ||
    (parsed as { workspaceId?: unknown }).workspaceId !==
      shopContext.workspaceId ||
    (parsed as { installationId?: unknown }).installationId !==
      shopContext.installationId
  ) {
    throw new SahelFlowError(
      "The durable identity initialization footprint belongs to another authority",
      "IDENTITY_AUTHORITY_FOOTPRINT_MISMATCH",
      409,
    );
  }
  return parsed as {
    formatVersion: 1;
    workspaceId: string;
    installationId: string;
  };
}

async function assertIdentityAuthorityContinuity(): Promise<void> {
  const footprint = await authContext.prisma.setting.findUnique({
    where: { key: IDENTITY_AUTHORITY_FOOTPRINT_KEY },
    select: { value: true },
  });
  if (!footprint) return;
  parseIdentityAuthorityFootprint(footprint.value);

  if (
    !existsSync(identityAuthorityPath()) &&
    !existsSync(identityAuthorityMarkerPath())
  ) {
    throw new SahelFlowError(
      "Durable identity authority is missing after this shop was initialized",
      "IDENTITY_AUTHORITY_MISSING",
      503,
    );
  }
}

async function persistIdentityAuthorityFootprint(): Promise<void> {
  const value = expectedIdentityAuthorityFootprint();
  await authContext.prisma.setting.upsert({
    where: { key: IDENTITY_AUTHORITY_FOOTPRINT_KEY },
    create: { key: IDENTITY_AUTHORITY_FOOTPRINT_KEY, value },
    update: { value },
  });
}

async function revokeUnboundSession(sessionId: string): Promise<void> {
  try {
    await authContext.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // Preserve the identity-control error. A missing cookie means the failed
    // session cannot authenticate even if this cleanup also fails.
  }
}

async function bindNewSessionIdentity(
  sessionId: string,
  options: Parameters<typeof bindOwnerIdentitySession>[2] = {},
): Promise<void> {
  try {
    await assertIdentityAuthorityContinuity();
    await bindOwnerIdentitySession(sessionId, shopContext, options);
    await persistIdentityAuthorityFootprint();
  } catch (error) {
    await revokeUnboundSession(sessionId);
    throw error;
  }
}

export async function createSession(ip?: string): Promise<void> {
  const secret = await getAuthSecret();
  if (!secret) throw new Error("Auth not set up — run setup first");
  const now = new Date();
  const session = await authContext.prisma.session.create({
    data: {
      ip: ip ?? null,
      issuedAt: now,
      lastSeenAt: now,
    },
  });
  await bindNewSessionIdentity(session.id);
  await setSessionCookie(secret, session.id);
}

/**
 * Session activity touch (lastSeenAt), best effort, off the request path.
 *
 * It used to be awaited inside every request that saw a lastSeenAt older than
 * SESSION_ACTIVITY_WRITE_INTERVAL_MS. The row only changes after the first
 * write commits, so every concurrent request in that window issued its own
 * identical write on the single SQLite connection and waited for its turn;
 * on a slow disk (synced commit of 130-1400 ms in the lab) N requests queued
 * N writes and all of them stalled, and a failed write refused a request that
 * was already authenticated (HTTP 503).
 *
 * Now, per process and per session: at most one write is started per
 * interval (the memo is set synchronously, so concurrent requests see it), the
 * request never waits for the write, and a failed or slow write never changes
 * the answer. A failure only moves the next attempt out by a short back-off.
 * If the write finds no live row (count 0: revoked or deleted) the session is
 * refused at its next request. Revocation is still read from the database on
 * every request; the only thing given up is noticing a revocation in the few
 * milliseconds between that read and this write.
 *
 * A write that never settles must not stop touches for good (the inactivity
 * limit is 60 minutes), so the memo, not the pending promise, gates the next
 * attempt: a new write may start once the interval has passed.
 */
const SESSION_TOUCH_RETRY_BACKOFF_MS = 30 * 1000;
const SESSION_TOUCH_TRACKER_MAX_ENTRIES = 1024;

type SessionTouchMemo = { nextAttemptAtMs: number; attempt: number };

const sessionTouchMemo = new Map<string, SessionTouchMemo>();
/** sessionId -> time after which the entry is no longer needed. */
const sessionsRevokedByTouch = new Map<string, number>();
let sessionTouchAttempt = 0;

/** Tests only: forget every recorded touch and revocation. */
export function __resetSessionTouchTracker(): void {
  sessionTouchMemo.clear();
  sessionsRevokedByTouch.clear();
  sessionTouchAttempt = 0;
}

function pruneSessionTouchTracker(nowMs: number): void {
  if (sessionTouchMemo.size >= SESSION_TOUCH_TRACKER_MAX_ENTRIES) {
    for (const [id, memo] of sessionTouchMemo) {
      if (memo.nextAttemptAtMs <= nowMs) sessionTouchMemo.delete(id);
    }
    // Still full: drop the oldest entries (Map keeps insertion order).
    for (const id of sessionTouchMemo.keys()) {
      if (sessionTouchMemo.size < SESSION_TOUCH_TRACKER_MAX_ENTRIES) break;
      sessionTouchMemo.delete(id);
    }
  }
  if (sessionsRevokedByTouch.size >= SESSION_TOUCH_TRACKER_MAX_ENTRIES) {
    for (const [id, forgetAtMs] of sessionsRevokedByTouch) {
      if (forgetAtMs <= nowMs) sessionsRevokedByTouch.delete(id);
    }
    for (const id of sessionsRevokedByTouch.keys()) {
      if (sessionsRevokedByTouch.size < SESSION_TOUCH_TRACKER_MAX_ENTRIES) break;
      sessionsRevokedByTouch.delete(id);
    }
  }
}

function isSessionRevokedByTouch(sessionId: string, nowMs: number): boolean {
  const forgetAtMs = sessionsRevokedByTouch.get(sessionId);
  if (forgetAtMs === undefined) return false;
  if (nowMs >= forgetAtMs) {
    sessionsRevokedByTouch.delete(sessionId);
    return false;
  }
  return true;
}

/**
 * Start the touch for this session unless one was started (or failed) too
 * recently. Returns true when a write was started by this call.
 */
function startSessionTouch(sessionId: string, now: Date): boolean {
  const nowMs = now.getTime();
  const memo = sessionTouchMemo.get(sessionId);
  if (memo && nowMs < memo.nextAttemptAtMs) return false;

  pruneSessionTouchTracker(nowMs);
  sessionTouchAttempt += 1;
  const attempt = sessionTouchAttempt;
  sessionTouchMemo.set(sessionId, {
    nextAttemptAtMs: nowMs + SESSION_ACTIVITY_WRITE_INTERVAL_MS,
    attempt,
  });

  let write: Promise<{ count: number }>;
  try {
    write = Promise.resolve(
      authContext.prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { lastSeenAt: now },
      }),
    );
  } catch (error) {
    write = Promise.reject(error);
  }
  void write.then(
    (refreshed) => {
      if (refreshed.count !== 1) {
        // Revoked or deleted between the read and this write: refuse the
        // session from its next request on. A session cannot authenticate
        // after the overall timeout, so the entry can be forgotten then.
        sessionsRevokedByTouch.set(
          sessionId,
          nowMs + SESSION_OVERALL_TIMEOUT_MS,
        );
      }
    },
    () => {
      // Best effort: retry after a short back-off, unless a newer attempt
      // has already replaced this one.
      const current = sessionTouchMemo.get(sessionId);
      if (current && current.attempt === attempt) {
        current.nextAttemptAtMs = Date.now() + SESSION_TOUCH_RETRY_BACKOFF_MS;
      }
    },
  );
  return true;
}

async function resolveCurrentSessionAuthority(): Promise<SessionAuthorityResult> {
  if (process.env.NODE_ENV === "production") {
    assertProcessShopAuthority(shopContext);
  }

  const token = await getSessionToken();
  const secret = await getAuthSecret();
  let authSetup: boolean;
  try {
    authSetup = secret ? true : await isAuthSetup();
  } catch {
    return { status: "rejected", code: "SESSION_AUTHORITY_UNAVAILABLE" };
  }

  const now = new Date();
  const authority = await resolveSessionAuthority({
    token,
    secret,
    authSetup,
    now,
    overallTimeoutMs: SESSION_OVERALL_TIMEOUT_MS,
    inactivityTimeoutMs: SESSION_INACTIVITY_TIMEOUT_MS,
    verifyToken: verifySessionToken,
    getSessionId: getSessionIdFromToken,
    findSession: async (sessionId) =>
      authContext.prisma.session.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          issuedAt: true,
          lastSeenAt: true,
          revokedAt: true,
        },
      }),
  });

  if (authority.status !== "authenticated") return authority;

  const nowMs = now.getTime();
  if (isSessionRevokedByTouch(authority.sessionId, nowMs)) {
    return { status: "rejected", code: "SESSION_REVOKED" };
  }
  if (
    nowMs - authority.lastSeenAt.getTime() >= SESSION_ACTIVITY_WRITE_INTERVAL_MS &&
    startSessionTouch(authority.sessionId, now)
  ) {
    // The request does not wait for the write and its answer does not depend
    // on it: the authority above was read from the database a moment ago.
    return { ...authority, lastSeenAt: now };
  }

  return authority;
}

export const getCurrentSessionAuthority = cache(resolveCurrentSessionAuthority);

function sessionAuthorityError(
  authority: Extract<SessionAuthorityResult, { status: "rejected" }>,
): SahelFlowError {
  if (
    authority.code === "AUTH_SECRET_UNAVAILABLE" ||
    authority.code === "SESSION_AUTHORITY_UNAVAILABLE"
  ) {
    return new SahelFlowError(
      "Authentication authority is temporarily unavailable",
      authority.code,
      503,
    );
  }

  return new SahelFlowError("Unauthorized", "UNAUTHORIZED", 401);
}

async function validateDurableIdentitySession(
  authority: Extract<SessionAuthorityResult, { status: "authenticated" }>,
): Promise<void> {
  try {
    await assertIdentityAuthorityContinuity();
    const actor = await resolveDurableIdentityActor(
      authority.sessionId,
      shopContext,
    );
    if (!actor) {
      throw new SahelFlowError(
        "The authenticated session has no durable identity authority",
        "IDENTITY_SESSION_BINDING_REQUIRED",
        401,
      );
    }
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw new SahelFlowError(
      "Durable identity authority is temporarily unavailable",
      "IDENTITY_AUTHORITY_UNAVAILABLE",
      503,
    );
  }
}

async function requireDatabaseAuthenticatedSession(
  fresh = false,
): Promise<Extract<SessionAuthorityResult, { status: "authenticated" }>> {
  const authority = fresh
    ? await resolveCurrentSessionAuthority()
    : await getCurrentSessionAuthority();
  if (authority.status === "authenticated") return authority;
  if (authority.status === "setup") {
    throw new SahelFlowError(
      "Authentication setup is required",
      "AUTH_SETUP_REQUIRED",
      409,
    );
  }
  throw sessionAuthorityError(authority);
}

async function requireAuthenticatedSession(
  fresh = false,
): Promise<Extract<SessionAuthorityResult, { status: "authenticated" }>> {
  const authority = await requireDatabaseAuthenticatedSession(fresh);
  await validateDurableIdentitySession(authority);
  return authority;
}

async function requireReauthenticationCandidate(): Promise<
  Extract<SessionAuthorityResult, { status: "authenticated" }>
> {
  const authority = await requireDatabaseAuthenticatedSession(true);
  await requireReauthenticationIdentityEligibility(() =>
    validateDurableIdentitySession(authority),
  );
  return authority;
}

/**
 * Prove authority before a reauthentication request body is parsed. Current
 * durable identity and policy-stale identity are eligible; all other identity
 * failures remain blocked.
 */
export async function requireReauthenticationEligibility(): Promise<void> {
  await requireReauthenticationCandidate();
}

export async function destroySession(): Promise<void> {
  const authority = await resolveCurrentSessionAuthority();
  if (authority.status === "authenticated") {
    try {
      await authContext.prisma.session.update({
        where: { id: authority.sessionId },
        data: { revokedAt: new Date() },
      });
    } catch {
      throw new SahelFlowError(
        "Logout could not be committed. Retry to revoke this session.",
        "SESSION_REVOCATION_FAILED",
        503,
      );
    }
  } else if (
    authority.status === "rejected" &&
    (authority.code === "AUTH_SECRET_UNAVAILABLE" ||
      authority.code === "SESSION_AUTHORITY_UNAVAILABLE")
  ) {
    throw sessionAuthorityError(authority);
  }

  const store = await cookies();
  store.delete(AUTH_COOKIE);
}

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(AUTH_COOKIE)?.value;
}

export const isAuthenticated = cache(async (): Promise<boolean> => {
  try {
    await requireAuthenticatedSession();
    return true;
  } catch {
    return false;
  }
});

function directBusinessRouteTestCompatibilityEnabled(): boolean {
  return (
    (process.env.NODE_ENV === "test" || process.env.VITEST === "true") &&
    process.env[DIRECT_ROUTE_TEST_AUTH_ENV] === DIRECT_ROUTE_TEST_AUTH_VALUE
  );
}

/**
 * Authenticate legacy/self-service boundaries, or enforce one exact Phase 2
 * action set for operational routes. The action-aware form dynamically enters
 * the trusted actor layer to avoid an auth/trusted-actor module cycle.
 */
export async function requireAuth(): Promise<void>;
export async function requireAuth(
  requiredActions: Phase2Action | readonly Phase2Action[],
): Promise<TrustedActorContext>;
export async function requireAuth(
  requiredActions?: Phase2Action | readonly Phase2Action[],
): Promise<void | TrustedActorContext> {
  if (requiredActions !== undefined) {
    const [{ requireTrustedActor }, { assertTrustedAction }] = await Promise.all([
      import("@/lib/identity/trusted-actor"),
      import("@/lib/identity/authorization"),
    ]);
    const actorContext = await requireTrustedActor();
    const actions =
      typeof requiredActions === "string"
        ? [requiredActions]
        : requiredActions;
    for (const action of actions) {
      assertTrustedAction(actorContext, action, {
        shopId: actorContext.shop.shopId,
      });
    }
    return actorContext;
  }
  if (directBusinessRouteTestCompatibilityEnabled()) {
    // Legacy direct route tests use a clean disposable DB. They may bypass only
    // before authentication is configured; configured-auth negative tests still
    // exercise the real session boundary. Database errors fail closed.
    if (!(await isAuthSetup())) return;
  }
  await requireAuthenticatedSession();
}

/** Rotate the current session after a successful PIN proof. */
export async function reauthenticateCurrentSession(
  pin: string,
  ip?: string,
): Promise<{ reauthenticated: boolean; reason?: "pin_invalid" }> {
  const authority = await requireReauthenticationCandidate();
  const { valid } = await verifyAuthPinAndMaybeRehash(pin);
  if (!valid) return { reauthenticated: false, reason: "pin_invalid" };

  const secret = await getAuthSecret();
  if (!secret) {
    throw new SahelFlowError(
      "Authentication authority is temporarily unavailable",
      "AUTH_SECRET_UNAVAILABLE",
      503,
    );
  }

  const now = new Date();
  const newSession = await authContext.prisma.$transaction(async (tx) => {
    const revoked = await tx.session.updateMany({
      where: { id: authority.sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) {
      throw new SahelFlowError("Unauthorized", "UNAUTHORIZED", 401);
    }
    return tx.session.create({
      data: {
        ip: ip ?? null,
        issuedAt: now,
        lastSeenAt: now,
      },
    });
  });

  await bindNewSessionIdentity(newSession.id, {
    revokeSessionIds: [authority.sessionId],
  });
  await setSessionCookie(secret, newSession.id);
  return { reauthenticated: true };
}

/**
 * Require a PIN proof issued within the high-risk window.
 *
 * Founder decision, 3 Nov 2026: a live signed-in session counts as PIN proof,
 * so the default window is the sign-in's own lifetime and a request that gets
 * past `requireAuthenticatedSession(true)` (not expired, not idle, not revoked,
 * durable identity current) is never asked for the PIN again. A dead session
 * still fails 401 there. A caller may pass a smaller window to ask again.
 */
export async function requireRecentReauthentication(
  maxAgeMs: number = SENSITIVE_REAUTH_WINDOW_MS,
): Promise<void> {
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) {
    throw new TypeError("Reauthentication age must be a positive integer");
  }
  // Read the clock BEFORE the session is resolved: a session the authority just
  // accepted (younger than the same 24 h) can then never look older than the
  // default window here because a few milliseconds passed in between.
  const requestedAtMs = Date.now();
  const authority = await requireAuthenticatedSession(true);
  const ageMs = requestedAtMs - authority.issuedAt.getTime();
  if (ageMs < 0 || ageMs >= maxAgeMs) {
    throw new SahelFlowError(
      "Recent PIN verification is required",
      "REAUTHENTICATION_REQUIRED",
      403,
    );
  }
}

/** Change the PIN, revoke every active session, and establish one replacement. */
export async function changeAuthPin(
  currentPin: string,
  newPin: string,
  ip?: string,
): Promise<{ changed: boolean; reason?: "current_pin_invalid" }> {
  const authority = await requireAuthenticatedSession(true);
  const valid = await verifyAuthPin(currentPin);
  if (!valid) return { changed: false, reason: "current_pin_invalid" };

  const secret = await getAuthSecret();
  if (!secret) {
    throw new SahelFlowError(
      "Authentication authority is temporarily unavailable",
      "AUTH_SECRET_UNAVAILABLE",
      503,
    );
  }

  const newHash = await sealAuthSecretValue(
    authKeyAuthority,
    "pinHash",
    await hashPin(newPin),
  );
  const now = new Date();
  const newSession = await authContext.prisma.$transaction(async (tx) => {
    const currentRevoked = await tx.session.updateMany({
      where: { id: authority.sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
    if (currentRevoked.count !== 1) {
      throw new SahelFlowError("Unauthorized", "UNAUTHORIZED", 401);
    }
    await tx.session.updateMany({
      where: { revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.authSecret.update({
      where: { id: "default" },
      data: { pinHash: newHash },
    });
    return tx.session.create({
      data: {
        ip: ip ?? null,
        issuedAt: now,
        lastSeenAt: now,
      },
    });
  });

  await bindNewSessionIdentity(newSession.id, {
    revokeAllOtherSessions: true,
  });
  await setSessionCookie(secret, newSession.id);
  return { changed: true };
}

export async function auditLog(
  action: string,
  metadata?: Record<string, unknown>,
  ip?: string,
): Promise<void> {
  await logAudit(authContext, { action, ip, metadata });
}

export async function getCurrentUserKey(): Promise<string> {
  const authority = await getCurrentSessionAuthority();
  return authority.status === "authenticated" ? authority.sessionId : "default";
}
