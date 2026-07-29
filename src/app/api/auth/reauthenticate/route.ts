import { NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  auditLog,
  reauthenticateCurrentSession,
  requireAuth,
} from "@/lib/auth/server";
import {
  checkLoginRateLimit,
  getClientIp,
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/auth/rate-limit";

const Schema = z.object({ pin: z.string().min(1, "PIN is required") });

export const POST = withErrorHandler(async (req: Request) => {
  await requireAuth();
  const ip = getClientIp(req.headers);
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

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    recordLoginAttempt(ip);
    return NextResponse.json({ error: "PIN is required" }, { status: 400 });
  }

  recordLoginAttempt(ip);
  const result = await reauthenticateCurrentSession(parsed.data.pin, ip);
  if (!result.reauthenticated) {
    const failure = recordLoginFailure(ip);
    void auditLog("auth.reauthenticate.failed", { reason: result.reason }, ip);
    if (!failure.allowed && failure.locked) {
      return NextResponse.json(
        { error: "Too many failed attempts. Account temporarily locked." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(failure.retryAfterMs / 1000)) },
        },
      );
    }
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  recordLoginSuccess(ip);
  void auditLog("auth.reauthenticate.success", { sessionRotated: true }, ip);
  return NextResponse.json({ success: true, sessionRotated: true });
}, "POST /api/auth/reauthenticate");
