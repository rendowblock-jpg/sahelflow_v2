import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
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

const LEGACY_AUTH_SECRET_KEY = "auth_secret";
const LEGACY_AUTH_PIN_KEY = "auth_pin_hash";

let migrationDone = false;
async function migrateAuthSecretsIfNeeded(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;
  try {
    const existing = await db.authSecret.findUnique({ where: { id: "default" } });
    if (existing) return;
    const legacySecret = await db.setting.findUnique({ where: { key: LEGACY_AUTH_SECRET_KEY } });
    const legacyPin = await db.setting.findUnique({ where: { key: LEGACY_AUTH_PIN_KEY } });
    if (!legacySecret?.value || !legacyPin?.value) return;
    await db.authSecret.create({
      data: { id: "default", secret: legacySecret.value, pinHash: legacyPin.value },
    });
    await db.setting.deleteMany({ where: { key: { in: [LEGACY_AUTH_SECRET_KEY, LEGACY_AUTH_PIN_KEY] } } });
  } catch {
    // Non-fatal
  }
}

export const getAuthSecret = cache(async (): Promise<string | null> => {
  const envSecret = process.env[AUTH_SECRET_ENV];
  if (envSecret) return envSecret;
  await migrateAuthSecretsIfNeeded();
  try {
    const row = await db.authSecret.findUnique({ where: { id: "default" } });
    if (row?.secret) return row.secret;
  } catch { /* DB not ready */ }
  try {
    const setting = await db.setting.findUnique({ where: { key: LEGACY_AUTH_SECRET_KEY } });
    if (setting?.value) return setting.value;
  } catch { /* ignore */ }
  return null;
});

export async function setupAuth(pin: string): Promise<{ secret: string }> {
  const secret = generateSecret();
  const pinHash = await hashPin(pin);
  await db.authSecret.upsert({
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
  const row = await db.authSecret.findUnique({ where: { id: "default" } });
  if (!row?.pinHash) return { valid: false, rehashed: false };
  const result = await verifyPinDetailed(pin, row.pinHash);
  if (!result.valid) return { valid: false, rehashed: false };
  if (result.needsRehash) {
    try {
      const newHash = await hashPin(pin, CURRENT_PBKDF2_ITERATIONS);
      await db.authSecret.update({ where: { id: "default" }, data: { pinHash: newHash } });
      return { valid: true, rehashed: true };
    } catch {
      return { valid: true, rehashed: false };
    }
  }
  return { valid: true, rehashed: false };
}

export async function verifyAuthPin(pin: string): Promise<boolean> {
  await migrateAuthSecretsIfNeeded();
  const row = await db.authSecret.findUnique({ where: { id: "default" } });
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
  await db.authSecret.update({ where: { id: "default" }, data: { pinHash: newHash } });
  return { changed: true };
}

export async function isAuthSetup(): Promise<boolean> {
  await migrateAuthSecretsIfNeeded();
  try {
    const row = await db.authSecret.findUnique({ where: { id: "default" } });
    return !!row?.pinHash;
  } catch {
    try {
      const setting = await db.setting.findUnique({ where: { key: LEGACY_AUTH_PIN_KEY } });
      return !!setting?.value;
    } catch {
      return false;
    }
  }
}

export async function createSession(ip?: string): Promise<void> {
  const secret = await getAuthSecret();
  if (!secret) throw new Error("Auth not set up — run setup first");
  const session = await db.session.create({ data: { ip: ip ?? null } });
  const token = await createSessionToken(secret, SESSION_TTL_MS, session.id);
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  void db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
}

export async function destroySession(): Promise<void> {
  const token = await getSessionToken();
  const sid = getSessionIdFromToken(token);
  if (sid) {
    try {
      await db.session.update({ where: { id: sid }, data: { revokedAt: new Date() } });
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
  if (!secret) return true;
  if (!token) return false;
  const { verifySessionToken } = await import("./crypto");
  const hmacValid = await verifySessionToken(token, secret);
  if (!hmacValid) return false;
  const sid = getSessionIdFromToken(token);
  if (!sid) return true; // legacy token — allow, will expire naturally
  try {
    const session = await db.session.findUnique({ where: { id: sid } });
    if (!session) return false;
    if (session.revokedAt) return false;
    return true;
  } catch {
    return true; // DB error — fail-open (HMAC valid, session check is defense-in-depth)
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
  try {
    await db.auditLog.create({
      data: {
        action,
        ip: ip ?? null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch { /* best-effort */ }
}
