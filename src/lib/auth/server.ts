import "server-only";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import {
  AUTH_COOKIE,
  AUTH_PIN_SETTING_KEY,
  AUTH_SECRET_SETTING_KEY,
  AUTH_SECRET_ENV,
  SESSION_TTL_MS,
} from "./config";
import { createSessionToken, generateSecret, hashPin, verifyPin } from "./crypto";

/**
 * Get the auth secret — from env var first (fast, no DB), then from DB.
 * If neither exists, returns null (setup mode).
 */
export async function getAuthSecret(): Promise<string | null> {
  // 1. Env var (set after first setup + restart)
  const envSecret = process.env[AUTH_SECRET_ENV];
  if (envSecret) return envSecret;

  // 2. DB (Setting table)
  try {
    const setting = await db.setting.findUnique({
      where: { key: AUTH_SECRET_SETTING_KEY },
    });
    if (setting?.value) return setting.value;
  } catch {
    // DB might not be ready during first-run
  }

  return null;
}

/**
 * Initialize auth on first setup: generate secret + hash PIN + store both.
 * Returns the secret so the caller can write it to .env.local.
 */
export async function setupAuth(pin: string): Promise<{ secret: string }> {
  const secret = generateSecret();
  const pinHash = await hashPin(pin);

  await db.setting.upsert({
    where: { key: AUTH_SECRET_SETTING_KEY },
    create: { key: AUTH_SECRET_SETTING_KEY, value: secret },
    update: { value: secret },
  });
  await db.setting.upsert({
    where: { key: AUTH_PIN_SETTING_KEY },
    create: { key: AUTH_PIN_SETTING_KEY, value: pinHash },
    update: { value: pinHash },
  });

  return { secret };
}

/**
 * Verify a PIN against the stored hash.
 * Returns true if the PIN is correct (or if no PIN is set = setup mode).
 */
export async function verifyAuthPin(pin: string): Promise<boolean> {
  const setting = await db.setting.findUnique({
    where: { key: AUTH_PIN_SETTING_KEY },
  });
  if (!setting?.value) return false; // No PIN set — must setup first
  return verifyPin(pin, setting.value);
}

/**
 * Check if auth is set up (PIN exists).
 */
export async function isAuthSetup(): Promise<boolean> {
  try {
    const setting = await db.setting.findUnique({
      where: { key: AUTH_PIN_SETTING_KEY },
    });
    return !!setting?.value;
  } catch {
    return false;
  }
}

/**
 * Create a session: generate token + set httpOnly cookie.
 * Call this from a Server Action or API route after verifying the PIN.
 */
export async function createSession(): Promise<void> {
  const secret = await getAuthSecret();
  if (!secret) throw new Error("Auth not set up — run setup first");
  const token = await createSessionToken(secret, SESSION_TTL_MS);
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/**
 * Destroy the session: clear the cookie.
 */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}

/**
 * Get the session token from the request cookies (for API routes).
 */
export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(AUTH_COOKIE)?.value;
}

/**
 * Check if the current request is authenticated.
 * Used by API routes as a guard.
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getSessionToken();
  const secret = await getAuthSecret();
  if (!secret) return true; // setup mode — allow
  if (!token) return false;
  const { verifySessionToken } = await import("./crypto");
  return verifySessionToken(token, secret);
}

/**
 * Require authentication — throws if not authenticated.
 * Use in API routes: `await requireAuth();`
 */
export async function requireAuth(): Promise<void> {
  const ok = await isAuthenticated();
  if (!ok) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}
