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
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/auth/rate-limit";
import { shopContext } from "@/lib/db";
import { createTeamLoginSession } from "@/lib/identity/team-directory";
import { registerTeamSessionAuthority } from "@/lib/identity/team-revocation-authority";
import { establishTeamSession } from "@/lib/identity/team-session";

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

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const limit = checkLoginRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  const parsed = LoginSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    recordLoginAttempt(ip);
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  if (!(await isAuthSetup())) {
    return NextResponse.json(
      { error: "Auth not set up yet", needsSetup: true },
      { status: 409 },
    );
  }

  recordLoginAttempt(ip);

  if (parsed.data.loginId) {
    const grant = await createTeamLoginSession(
      parsed.data.loginId,
      parsed.data.pin,
      shopContext,
    );
    if (!grant) {
      const failure = recordLoginFailure(ip);
      void auditLog("auth.login.failed", { reason: "member_credentials" }, ip);
      if (!failure.allowed && failure.locked) {
        return NextResponse.json(
          { error: "Too many failed attempts. Account temporarily locked." },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil(failure.retryAfterMs / 1000)),
            },
          },
        );
      }
      return NextResponse.json({ error: "Incorrect login or PIN" }, { status: 401 });
    }

    await registerTeamSessionAuthority({
      sessionId: grant.sessionId,
      actor: grant.actor,
      shop: shopContext,
    });
    await establishTeamSession(grant.sessionId, ip);
    recordLoginSuccess(ip);
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
    const failure = recordLoginFailure(ip);
    void auditLog("auth.login.failed", { reason: "wrong_pin" }, ip);
    if (!failure.allowed && failure.locked) {
      return NextResponse.json(
        { error: "Too many failed attempts. Account temporarily locked." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(failure.retryAfterMs / 1000)),
          },
        },
      );
    }
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  recordLoginSuccess(ip);
  await createSession(ip);
  void auditLog("auth.login.success", { role: "owner" }, ip);
  return NextResponse.json({ success: true, owner: true });
}
