import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthSetup,
  verifyAuthPinAndMaybeRehash,
  getAuthSecret,
} from "@/lib/auth/server";
import { createSessionToken } from "@/lib/auth/crypto";
import { SESSION_TTL_MS, AUTH_COOKIE } from "@/lib/auth/config";
import {
  checkLoginRateLimit,
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
  getClientIp,
} from "@/lib/auth/rate-limit";

const LoginSchema = z.object({
  pin: z.string().min(1, "PIN is required"),
});

/**
 * POST /api/auth/login
 *
 * SEC-001 hardening:
 *   - Per-IP rate limit: 5 attempts/min, progressive lockout (2s/8s/60s/15min
 *     at 3/5/8/10 fails), 15-min lockout after 10 fails.
 *   - Constant 1s delay on every attempt — slows brute-force without leaking
 *     whether the account exists (the delay applies before the PIN is checked).
 *   - PBKDF2 600k (verified in verifyAuthPinAndMaybeRehash) + transparent
 *     re-hash of legacy 100k hashes on successful login.
 */
export async function POST(req: Request) {
  // ── 1. Constant delay (anti-brute-force, doesn't leak account existence) ──
  // Runs before any validation so timing is uniform across request shapes.
  await new Promise((r) => setTimeout(r, 1000));

  // ── 2. Rate limit check ──────────────────────────────────────────────────
  const ip = getClientIp(req.headers);
  const rl = checkLoginRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  // ── 3. Parse + validate body ─────────────────────────────────────────────
  const body = await req.json().catch(() => ({}));
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    // Count the malformed attempt against the rate limit (anti-enumeration)
    recordLoginAttempt(ip);
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  // ── 4. Check auth is set up ──────────────────────────────────────────────
  const setup = await isAuthSetup();
  if (!setup) {
    return NextResponse.json(
      { error: "Auth not set up yet", needsSetup: true },
      { status: 409 },
    );
  }

  // ── 5. Record the attempt (sliding-window counter) ───────────────────────
  recordLoginAttempt(ip);

  // ── 6. Verify PIN (+ transparent rehash of legacy hashes) ────────────────
  const { valid } = await verifyAuthPinAndMaybeRehash(parsed.data.pin);
  if (!valid) {
    const failResult = recordLoginFailure(ip);
    // If the failure triggered a lockout, include Retry-After
    if (!failResult.allowed && failResult.locked) {
      return NextResponse.json(
        { error: "Too many failed attempts. Account temporarily locked." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(failResult.retryAfterMs / 1000)) },
        },
      );
    }
    return NextResponse.json(
      { error: "Incorrect PIN" },
      { status: 401 },
    );
  }

  // ── 7. Success — reset fail counter + create session ─────────────────────
  recordLoginSuccess(ip);

  const secret = await getAuthSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Auth configuration error" },
      { status: 500 },
    );
  }

  const token = await createSessionToken(secret, SESSION_TTL_MS);
  const res = NextResponse.json({ success: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  return res;
}
