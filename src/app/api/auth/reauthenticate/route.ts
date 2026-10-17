import { NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  auditLog,
  getCurrentSessionAuthority,
  reauthenticateCurrentSession,
  requireReauthenticationEligibility,
} from "@/lib/auth/server";
import {
  checkLoginRateLimit,
  getClientIp,
  getConfirmationLimiterKey,
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/auth/rate-limit";
import { shopContext } from "@/lib/db";
import { prepareTeamReauthentication } from "@/lib/identity/team-reauthentication";
import { registerTeamSessionAuthority } from "@/lib/identity/team-revocation-authority";
import { rotateTeamDatabaseSession } from "@/lib/identity/team-session";
import { SahelFlowError } from "@/types/errors";

const Schema = z.object({ pin: z.string().min(1, "PIN is required") });

export const POST = withErrorHandler(async (req: Request) => {
  await requireReauthenticationEligibility();
  // Audit metadata only (client-controlled): never a limiter key (IDN-01).
  const ip = getClientIp(req.headers);
  // The allowance belongs to the verified session whose PIN is being proven, so
  // a forged forwarding header cannot buy a fresh one and another session's
  // failures cannot spend it.
  const authority = await getCurrentSessionAuthority();
  if (authority.status !== "authenticated") {
    throw new SahelFlowError("Unauthorized", "UNAUTHORIZED", 401);
  }
  const limiterKey = getConfirmationLimiterKey(authority.sessionId);
  const limit = checkLoginRateLimit(limiterKey);
  if (!limit.allowed) {
    // Audit S2-5: coded rejection bodies — exact English strings kept verbatim;
    // Retry-After headers preserved via NextResponse bodies.
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

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    recordLoginAttempt(limiterKey);
    return NextResponse.json(
      { error: "PIN is required", code: "REQUEST_VALIDATION_FAILED" },
      { status: 400 },
    );
  }

  recordLoginAttempt(limiterKey);
  const teamAttempt = await prepareTeamReauthentication(
    authority.sessionId,
    parsed.data.pin,
    shopContext,
  );

  let reauthenticated = false;
  let subject: "owner" | "team" = teamAttempt.subject;
  if (teamAttempt.subject === "team") {
    if (teamAttempt.grant) {
      await registerTeamSessionAuthority({
        sessionId: teamAttempt.grant.sessionId,
        actor: teamAttempt.grant.actor,
        shop: shopContext,
      });
      await rotateTeamDatabaseSession(
        authority.sessionId,
        teamAttempt.grant.sessionId,
        ip,
      );
      reauthenticated = true;
    }
  } else {
    const result = await reauthenticateCurrentSession(parsed.data.pin, ip);
    reauthenticated = result.reauthenticated;
    subject = "owner";
  }

  if (!reauthenticated) {
    const failure = recordLoginFailure(limiterKey);
    void auditLog(
      "auth.reauthenticate.failed",
      { reason: "pin_invalid", subject },
      ip,
    );
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
  void auditLog(
    "auth.reauthenticate.success",
    { sessionRotated: true, subject },
    ip,
  );
  return NextResponse.json({ success: true, sessionRotated: true });
}, "POST /api/auth/reauthenticate");
