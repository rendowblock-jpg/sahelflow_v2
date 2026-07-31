import "server-only";

import { existsSync } from "node:fs";
import { cache } from "react";
import { cookies } from "next/headers";

import { logAudit } from "@/lib/audit";
import type { ServiceContext } from "@/lib/data/service-base";
import { db, shopContext } from "@/lib/db";
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

const LEGACY_AUTH_SECRET_KEY = "auth_secret";
const LEGACY_AUTH_PIN_KEY = "auth_pin_hash";
const DIRECT_ROUTE_TEST_AUTH_ENV = "SF_DIRECT_ROUTE_TEST_AUTHORITY";
const DIRECT_ROUTE_TEST_AUTH_VALUE = "vitest-business-routes";
const IDENTITY_AUTHORITY_FOOTPRINT_KEY = "identity_authority_initialized_v1";
const IDENTITY_AUTHORITY_FOOTPRINT_VERSION = 1 as const;
const authContext = { prisma: db, shop: shopContext } satisfies ServiceContext;

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
        pinHash: legacyPin.value,
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
  } catch {
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

export async function setupAuth(pin: string): Promise<{ secret: string }> {
  const secret = generateSecret();
  const pinHash = await hashPin(pin);
  await authContext.prisma.authSecret.upsert({
    where: { id: "default" },
    create: { id: "default", secret, pinHash },
    update: { secret, pinHash },
  });
  return { secret };
}

export async function verifyAuthPinAndMaybeRehash(
  pin: string,
): Promise<{ valid: boolean; rehashed: boolean }> {
  await migrateAuthSecretsIfNeeded();
  const row = await authContext.prisma.authSecret.findUnique({
    where: { id: "default" },
  });
  if (!row?.pinHash) return { valid: false, rehashed: false };
  const result = await verifyPinDetailed(pin, row.pinHash);
  if (!result.valid) return { valid: false, rehashed: false };
  if (result.needsRehash) {
    try {
      const newHash = await hashPin(pin, CURRENT_PBKDF2_ITERATIONS);
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
  return verifyPin(pin, row.pinHash);
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

  if (
    authority.status === "authenticated" &&
    now.getTime() - authority.lastSeenAt.getTime() >=
      SESSION_ACTIVITY_WRITE_INTERVAL_MS
  ) {
    try {
      const refreshed = await authContext.prisma.session.updateMany({
        where: { id: authority.sessionId, revokedAt: null },
        data: { lastSeenAt: now },
      });
      if (refreshed.count !== 1) {
        return { status: "rejected", code: "SESSION_REVOKED" };
      }
      return { ...authority, lastSeenAt: now };
    } catch {
      return { status: "rejected", code: "SESSION_AUTHORITY_UNAVAILABLE" };
    }
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

async function requireAuthenticatedSession(
  fresh = false,
): Promise<Extract<SessionAuthorityResult, { status: "authenticated" }>> {
  const authority = fresh
    ? await resolveCurrentSessionAuthority()
    : await getCurrentSessionAuthority();
  if (authority.status === "authenticated") {
    await validateDurableIdentitySession(authority);
    return authority;
  }
  if (authority.status === "setup") {
    throw new SahelFlowError(
      "Authentication setup is required",
      "AUTH_SETUP_REQUIRED",
      409,
    );
  }
  throw sessionAuthorityError(authority);
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

export async function requireAuth(): Promise<void> {
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
  const authority = await requireAuthenticatedSession(true);
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

/** Require a PIN proof issued within the bounded high-risk window. */
export async function requireRecentReauthentication(
  maxAgeMs: number = SENSITIVE_REAUTH_WINDOW_MS,
): Promise<void> {
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) {
    throw new TypeError("Reauthentication age must be a positive integer");
  }
  const authority = await requireAuthenticatedSession(true);
  const ageMs = Date.now() - authority.issuedAt.getTime();
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

  const newHash = await hashPin(newPin);
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
