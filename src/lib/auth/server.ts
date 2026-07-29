import "server-only";
import { cache } from "react";
import { db, shopContext } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { cookies } from "next/headers";
import {
  AUTH_COOKIE,
  AUTH_SECRET_ENV,
  SESSION_TTL_MS,
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
    // Non-fatal
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

export async function changeAuthPin(
  currentPin: string,
  newPin: string,
): Promise<{ changed: boolean; reason?: string }> {
  const valid = await verifyAuthPin(currentPin);
  if (!valid) return { changed: false, reason: "current_pin_invalid" };
  const newHash = await hashPin(newPin);
  await authContext.prisma.authSecret.update({ where: { id: "default" }, data: { pinHash: newHash } });
  return { changed: true };
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

export async function createSession(ip?: string): Promise<void> {
  const secret = await getAuthSecret();
  if (!secret) throw new Error("Auth not set up — run setup first");
  const session = await authContext.prisma.session.create({ data: { ip: ip ?? null } });
  const token = await createSessionToken(secret, SESSION_TTL_MS, session.id);
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  void authContext.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
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

  return resolveSessionAuthority({
    token,
    secret,
    authSetup,
    verifyToken: verifySessionToken,
    getSessionId: getSessionIdFromToken,
    findSession: async (sessionId) =>
      authContext.prisma.session.findUnique({
        where: { id: sessionId },
        select: { id: true, revokedAt: true },
      }),
  });
}

export const getCurrentSessionAuthority = cache(resolveCurrentSessionAuthority);

export async function destroySession(): Promise<void> {
  try {
    const authority = await resolveCurrentSessionAuthority();
    if (authority.status === "authenticated") {
      try {
        await authContext.prisma.session.update({
          where: { id: authority.sessionId },
          data: { revokedAt: new Date() },
        });
      } catch { /* non-fatal */ }
    }
  } catch {
    // Clearing the local cookie must remain possible when shop or session
    // authority is unavailable. No unverified Session ID is ever revoked.
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
  return authority.status === "setup" || authority.status === "authenticated";
});

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

export async function requireAuth(): Promise<void> {
  const authority = await getCurrentSessionAuthority();
  if (authority.status === "setup" || authority.status === "authenticated") {
    return;
  }
  throw sessionAuthorityError(authority);
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

/**
 * Returns a stable identifier for the current authenticated user (their
 * auth Session.id from the cookie token). Used as the `userKey` for the AI
 * rate limiter (AI-P1) so the daily cap is enforced across all of a user's
 * AI chat sessions, not shared globally as "default".
 *
 * Returns "default" only when no authenticated session authority exists. This
 * preserves setup/development compatibility without accepting legacy no-JTI
 * tokens or bypassing revocation-store failures.
 */
export async function getCurrentUserKey(): Promise<string> {
  const authority = await getCurrentSessionAuthority();
  return authority.status === "authenticated" ? authority.sessionId : "default";
}
