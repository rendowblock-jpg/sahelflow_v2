import { NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { auditLog, isAuthSetup } from "@/lib/auth/server";
import {
  checkLoginRateLimit,
  getClientIp,
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/auth/rate-limit";
import { shopContext } from "@/lib/db";
import { acceptTeamInvitation } from "@/lib/identity/team-directory";
import { registerTeamSessionAuthority } from "@/lib/identity/team-revocation-authority";
import { establishTeamSession } from "@/lib/identity/team-session";

const schema = z
  .object({
    token: z.string().min(1).max(256),
    requestId: z.string().uuid(),
    displayName: z.string().trim().min(1).max(80),
    loginId: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]{2,31}$/),
    pin: z.string().min(8).max(32),
  })
  .strict();

/** POST /api/auth/invitations/accept — public, single-use member enrollment. */
export const POST = withErrorHandler(async (request: Request) => {
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

  if (!(await isAuthSetup())) {
    return NextResponse.json(
      { error: "Authentication setup is required", needsSetup: true },
      { status: 409 },
    );
  }

  const input = schema.parse(await request.json());
  recordLoginAttempt(ip);

  try {
    const grant = await acceptTeamInvitation(input, shopContext);
    await registerTeamSessionAuthority({
      sessionId: grant.sessionId,
      actor: grant.actor,
      shop: shopContext,
    });
    const session = await establishTeamSession(grant.sessionId, ip);
    recordLoginSuccess(ip);
    void auditLog(
      "team.invitation.accepted",
      {
        personId: grant.actor.personId,
        memberId: grant.actor.workspaceMemberId,
        deviceId: grant.actor.deviceId,
        invitationId: grant.invitationId,
        role: grant.actor.role,
        replayed: grant.replayed || session.replayed,
      },
      ip,
    );
    return NextResponse.json({
      success: true,
      member: {
        personId: grant.actor.personId,
        memberId: grant.actor.workspaceMemberId,
        deviceId: grant.actor.deviceId,
        displayName: grant.displayName,
        loginId: grant.loginId,
        role: grant.actor.role,
      },
      replayed: grant.replayed || session.replayed,
    });
  } catch (error) {
    const failure = recordLoginFailure(ip);
    void auditLog(
      "team.invitation.acceptance_failed",
      {
        reason:
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "unknown",
      },
      ip,
    );
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
    throw error;
  }
}, "POST /api/auth/invitations/accept");
