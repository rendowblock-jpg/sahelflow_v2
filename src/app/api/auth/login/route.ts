import { NextResponse } from "next/server";
import { z } from "zod";

import {
  auditLog,
  createSession,
  isAuthSetup,
  verifyAuthPinAndMaybeRehash,
} from "@/lib/auth/server";
import {
  checkLoginRateLimit,
  getClientIp,
  getLoginLimiterKey,
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/auth/rate-limit";
import { shopContext } from "@/lib/db";
import { createActiveTeamLoginSession } from "@/lib/identity/team-credentials";
import { registerTeamSessionAuthority } from "@/lib/identity/team-revocation-authority";
import { establishTeamSession } from "@/lib/identity/team-session";
import { logger } from "@/lib/logger";

const LoginSchema = z
  .object({
    pin: z.string().min(1, "PIN is required"),
    loginId: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]{2,31}$/)
      .optional(),
  })
  .strict();

/**
 * Audit S2-5: every rejection body carries a stable `code` alongside the exact
 * English `error` string — the login page and translate-server-error rules
 * match that text verbatim, so it must not change. This route deliberately
 * stays hand-rolled (rate-limit headers + limiter side effects differ from
 * withErrorHandler); an unexpected throw is formatted as coded 500
 * AUTH_INTERNAL_ERROR with the same JSON shape instead of Next's non-JSON 500.
 */
export async function POST(request: Request) {
  try {
    return await loginHandler(request);
  } catch (error) {
    logger.error("api.POST /api/auth/login.unexpected", error instanceof Error ? error : undefined);
    return NextResponse.json(
      {
        error: "Login failed due to an internal error. Please try again.",
        code: "AUTH_INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}

async function loginHandler(request: Request): Promise<NextResponse> {
  // Audit metadata only (client-controlled): kept for session/audit records.
  const ip = getClientIp(request.headers);
  // Limiter bucket key (audit 7-a F14): loopback-consistent, not spoofable,
  // so replayed x-forwarded-for values cannot rotate the bucket.
  const limiterKey = getLoginLimiterKey(request.headers);
  const limit = checkLoginRateLimit(limiterKey);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Too many attempts. Please try again later.",
        code: "RATE_LIMITED",
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  const parsed = LoginSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    recordLoginAttempt(limiterKey);
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid request",
        code: "REQUEST_VALIDATION_FAILED",
      },
      { status: 400 },
    );
  }

  if (!(await isAuthSetup())) {
    return NextResponse.json(
      {
        error: "Auth not set up yet",
        code: "AUTH_SETUP_REQUIRED",
        needsSetup: true,
      },
      { status: 409 },
    );
  }

  recordLoginAttempt(limiterKey);

  if (parsed.data.loginId) {
    const grant = await createActiveTeamLoginSession(
      parsed.data.loginId,
      parsed.data.pin,
      shopContext,
    );
    if (!grant) {
      const failure = recordLoginFailure(limiterKey);
      void auditLog("auth.login.failed", { reason: "member_credentials" }, ip);
      if (!failure.allowed && failure.locked) {
        return NextResponse.json(
          {
            error: "Too many failed attempts. Account temporarily locked.",
            code: "RATE_LIMITED",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil(failure.retryAfterMs / 1000)),
            },
          },
        );
      }
      return NextResponse.json(
        { error: "Incorrect login or PIN", code: "INVALID_CREDENTIALS" },
        { status: 401 },
      );
    }

    await registerTeamSessionAuthority({
      sessionId: grant.sessionId,
      actor: grant.actor,
      shop: shopContext,
    });
    await establishTeamSession(grant.sessionId, ip);
    recordLoginSuccess(limiterKey);
    void auditLog(
      "auth.login.success",
      {
        personId: grant.actor.personId,
        memberId: grant.actor.workspaceMemberId,
        deviceId: grant.actor.deviceId,
        role: grant.actor.role,
      },
      ip,
    );
    return NextResponse.json({
      success: true,
      member: {
        displayName: grant.displayName,
        loginId: grant.loginId,
        role: grant.actor.role,
      },
    });
  }

  const { valid } = await verifyAuthPinAndMaybeRehash(parsed.data.pin);
  if (!valid) {
    const failure = recordLoginFailure(limiterKey);
    void auditLog("auth.login.failed", { reason: "wrong_pin" }, ip);
    if (!failure.allowed && failure.locked) {
      return NextResponse.json(
        {
          error: "Too many failed attempts. Account temporarily locked.",
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(failure.retryAfterMs / 1000)),
          },
        },
      );
    }
    return NextResponse.json(
      { error: "Incorrect PIN", code: "INVALID_CREDENTIALS" },
      { status: 401 },
    );
  }

  recordLoginSuccess(limiterKey);
  await createSession(ip);
  void auditLog("auth.login.success", { role: "owner" }, ip);
  return NextResponse.json({ success: true, owner: true });
}
