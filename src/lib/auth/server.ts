import "server-only";
import { cache } from "react";
import { db, shopContext } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { cookies } from "next/headers";
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
  generateSecret,
  hashPin,
  verifyPin,
  verifyPinDetailed,
  verifySessionToken,
  getSessionIdFromToken,
  CURRENT_PBKDF2_ITERATIONS,
} from "./crypto";
import { SahelFlowError } from "@/types/errors";
import type { ServiceContext } from "@/lib/data/service-base";
import {
  resolveSessionAuthority,
  type SessionAuthorityResult,
} from "@/lib/identity/session-authority";
import { assertProcessShopAuthority } from "@/lib/shops/authority";

const LEGACY_AUTH_SECRET_KEY = "auth_secret";
const LEGACY_AUTH_PIN_KEY = "auth_pin_hash";
const authContext = { prisma: db, shop: shopContext } satisfies ServiceContext;

let migrationDone = false;
async function migrateAuthSecretsIfNeeded(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;
  try {
    const existing = await authContext.prisma.authSecret.findUnique({ where: { id: "default" } });
    if (existing) return;
    const legacySecret = await authContext.prisma.setting.findUnique({ where: { key: LEGACY_AUTH_SECRET_KEY } });
    const legacyPin = await authContext.prisma.setting.findUnique({ where: { key: LEGACY_AUTH_PIN_KEY } });
    if (!legacySecret?.value || !legacyPin?.value) return;
    await authContext.prisma.authSecret.create({
      data: { id: "default", secret: legacySecret.value, pinHash: legacyPin.value },
    });
    await authContext.prisma.setting.deleteMany({ where: { key: { in: [LEGACY_AUTH_SECRET_KEY, LEGACY_AUTH_PIN_KEY] } } });
  } catch {
    // Non-fatal legacy migration attempt; authority reads below still fail closed.
  }
}

export const getAuthSecret = cache(async (): Promise<string | null> => {
  const envSecret = process.env[AUTH_SECRET_ENV];
  if (envSecret) return envSecret;
  await migrateAuthSecretsIfNeeded();
  try {
    const row = await authContext.prisma.authSecret.findUnique({ where: { id: "default" } });
    if (row?.secret) return row.secret;
  } catch { /* DB not ready */ }
  try {
    const setting = await authContext.prisma.setting.findUnique({ where: { key: LEGACY_AUTH_SECRET_KEY } });
    if (setting?.value) return setting.value;
  } catch { /* ignore */ }
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
  const row = await authContext.prisma.authSecret.findUnique({ where: { id: "default" } });
  if (!row?.pinHash) return { valid: false, rehashed: false };
  const result = await verifyPinDetailed(pin, row.pinHash);
  if (!result.valid) return { valid: false, rehashed: false };
  if (result.needsRehash) {
    try {
      const newHash = await hashPin(pin, CURRENT_PBKDF2_ITERATIONS);
      await authContext.prisma.authSecret.update({ where: { id: "default" }, data: { pinHash: newHash } });
      return { valid: true, rehashed: true };
    } catch {
      return { valid: true, rehashed: false };
    }
  }
  return { valid: true, rehashed: false };
}

export async function verifyAuthPin(pin: string): Promise<boolean> {
  await migrateAuthSecretsIfNeeded();
  const row = await authContext.prisma.authSecret.findUnique({ where: { id: "default" } });
  if (!row?.pinHash) return false;
  return verifyPin(pin, row.pinHash);
}

export async function isAuthSetup(): Promise<boolean> {
  await migrateAuthSecretsIfNeeded();
  try {
    const row = await authContext.prisma.authSecret.findUnique({ where: { id: "default" } });
    if (row?.pinHash) return true;
    const setting = await authContext.prisma.setting.findUnique({ where: { key: LEGACY_AUTH_PIN_KEY } });
    return !!setting?.value;
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

async function requireAuthenticatedSession(
  fresh = false,
): Promise<Extract<SessionAuthorityResult, { status: "authenticated" }>> {
  const authority = fresh
    ? await resolveCurrentSessionAuthority()
    : await getCurrentSessionAuthority();
  if (authority.status === "authenticated") return authority;
  if (authority.status === "setup") {
    throw new SahelFlowError("Authentication setup is required", "AUTH_SETUP_REQUIRED", 409);
  }
  throw sessionAuthorityError(authority);
}

export async function destroySession(): Promise<void> {
  try {
    const authority = await resolveCurrentSessionAuthority();
    if (authority.status === "authenticated") {
      await authContext.prisma.session.updateMany({
        where: { id: authority.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      }).catch(() => {
        // Cookie clearing must remain possible even when revocation persistence fails.
      });
    }
  } catch {
    // No unverified session identity is ever revoked.
  }

  const store = await cookies();
  store.delete(AUTH_COOKIE);
}

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(AUTH_COOKIE)?.value;
}

export const isAuthenticated = cache(async (): Promise<boolean> => {
  const authority = await getCurrentSessionAuthority();
  return authority.status === "authenticated";
});

export async function requireAuth(): Promise<void> {
  await requireAuthenticatedSession();
}

/**
 * Rotate the current session after a successful PIN proof. The old cookie's
 * session ID is revoked transactionally, so possession of the previous token
 * cannot inherit the new authentication freshness.
 */
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

/**
 * Change the local PIN, revoke every prior session, and establish one new
 * current session. Credential changes therefore cannot leave stolen cookies
 * active on another browser or device.
 */
export async function changeAuthPin(
  currentPin: string,
  newPin: string,
  ip?: string,
): Promise<{ changed: boolean; reason?: "current_pin_invalid" }> {
  await requireAuthenticatedSession(true);
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
    await tx.authSecret.update({
      where: { id: "default" },
      data: { pinHash: newHash },
    });
    await tx.session.updateMany({
      where: { revokedAt: null },
      data: { revokedAt: now },
    });
    return tx.session.create({
      data: {
        ip: ip ?? null,
        issuedAt: now,
        lastSeenAt: now,
      },
    });
  });

  await setSessionCookie(secret, newSession.id);
  return { changed: true };
}

export async function auditLog(
  action: string,
  metadata?: Record<string, unknown>,
  ip?: string,
): Promise<void> {
  await logAudit(
    authContext,
    { action, ip, metadata },
  );
}

export async function getCurrentUserKey(): Promise<string> {
  const authority = await getCurrentSessionAuthority();
  return authority.status === "authenticated" ? authority.sessionId : "default";
}
