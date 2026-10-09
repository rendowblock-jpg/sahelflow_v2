import { NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  checkLoginRateLimit,
  getClientIp,
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/auth/rate-limit";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { changeOwnTeamPin } from "@/lib/identity/team-member-administration";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    currentPin: z.string().min(1).max(32),
    newPin: z.string().min(8).max(32),
  })
  .strict();

/**
 * POST /api/auth/me/pin — a team member changes their own PIN. The owner PIN
 * keeps its own route (it also protects the installation's encryption).
 */
export const POST = withErrorHandler(async (request: Request) => {
  const context = await requireTrustedActor();
  if (context.actor.kind !== "person" || context.actor.role === "owner") {
    throw new SahelFlowError(
      "Only a team member can change their PIN here",
      "ACTION_FORBIDDEN",
      403,
    );
  }

  const ip = getClientIp(request.headers);
  const limit = checkLoginRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later.", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || parsed.data.currentPin === parsed.data.newPin) {
    return NextResponse.json(
      {
        error: parsed.success
          ? "New PIN must be different from the current PIN"
          : "New PIN must be at least 8 characters",
        code: "REQUEST_VALIDATION_FAILED",
      },
      { status: 400 },
    );
  }

  recordLoginAttempt(ip);
  const result = await changeOwnTeamPin({
    sessionId: context.actor.sessionId,
    currentPin: parsed.data.currentPin,
    newPin: parsed.data.newPin,
    shop: context.shop,
    auditActor: trustedActorAuditIdentity(context.actor),
  });
  if (!result) {
    const failure = recordLoginFailure(ip);
    if (!failure.allowed && failure.locked) {
      return NextResponse.json(
        { error: "Too many failed attempts. Account temporarily locked.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(failure.retryAfterMs / 1000)) },
        },
      );
    }
    return NextResponse.json(
      { error: "Current PIN is incorrect", code: "INVALID_CREDENTIALS" },
      { status: 403 },
    );
  }
  recordLoginSuccess(ip);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}, "POST /api/auth/me/pin");
