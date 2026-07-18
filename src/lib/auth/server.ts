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
  getSessionIdFromToken,
  CURRENT_PBKDF2_ITERATIONS,
} from "./crypto";
import { SahelFlowError } from "@/types/errors";
import type { ServiceContext } from "@/lib/data/service-base";

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
    return !!row?.pinHash;
  } catch {
    try {
      const setting = await authContext.prisma.setting.findUnique({ where: { key: LEGACY_AUTH_PIN_KEY } });
      return !!setting?.value;
    } catch {
      return false;
    }
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

export async function destroySession(): Promise<void> {
  const token = await getSessionToken();
  const sid = getSessionIdFromToken(token);
  if (sid) {
    try {
      await authContext.prisma.session.update({ where: { id: sid }, data: { revokedAt: new Date() } });
    } catch { /* non-fatal */ }
  }
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(AUTH_COOKIE)?.value;
}

export const isAuthenticated = cache(async (): Promise<boolean> => {
  const token = await getSessionToken();
  const secret = await getAuthSecret();
  // Fail-OPEN only when auth is genuinely not set up (no AuthSecret row).
  // If auth IS set up but the secret is missing/corrupted, fail CLOSED.
  if (!secret) {
    const setup = await isAuthSetup();
    return !setup; // not setup → allow (setup mode); setup but no secret → deny
  }
  if (!token) return false;
  const { verifySessionToken } = await import("./crypto");
  const hmacValid = await verifySessionToken(token, secret);
  if (!hmacValid) return false;
  const sid = getSessionIdFromToken(token);
  if (!sid) return true; // legacy token — allow, will expire naturally
  try {
    const session = await authContext.prisma.session.findUnique({ where: { id: sid } });
    if (!session) return false;
    if (session.revokedAt) return false;
    return true;
  } catch {
    // DB error during session revocation check — HMAC is valid, so the token
    // itself is legitimate. Fail-open here is defense-in-depth (the HMAC is
    // the primary gate), but revoked sessions may briefly work until the DB
    // recovers. Acceptable for a local-first single-user app.
    return true;
  }
});

export async function requireAuth(): Promise<void> {
  const ok = await isAuthenticated();
  if (!ok) {
    throw new SahelFlowError("Unauthorized", "UNAUTHORIZED", 401);
  }
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
 * Returns "default" if no session token is present or the token is
 * unverifiable — this preserves backward-compatible behavior in setups
 * where auth isn't fully configured (e.g. dev mode).
 */
export async function getCurrentUserKey(): Promise<string> {
  const token = await getSessionToken();
  if (!token) return "default";
  const sid = getSessionIdFromToken(token);
  return sid ?? "default";
}
