import { NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, changeAuthPin, auditLog } from "@/lib/auth/server";
import {
  checkLoginRateLimit,
  getClientIp,
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/auth/rate-limit";

const ChangePinSchema = z.object({
  currentPin: z.string().min(1, "Current PIN is required"),
  newPin: z.string().min(8, "New PIN must be at least 8 characters").max(32, "New PIN too long"),
});

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

  const body = await req.json();
  const parsed = ChangePinSchema.safeParse(body);
  if (!parsed.success) {
    recordLoginAttempt(ip);
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  if (parsed.data.newPin === parsed.data.currentPin) {
    recordLoginAttempt(ip);
    return NextResponse.json(
      { error: "New PIN must be different from the current PIN" },
      { status: 400 },
    );
  }

  recordLoginAttempt(ip);
  const result = await changeAuthPin(
    parsed.data.currentPin,
    parsed.data.newPin,
    ip,
  );
  if (!result.changed) {
    const failure = recordLoginFailure(ip);
    void auditLog("auth.pin.change.failed", { reason: result.reason }, ip);
    if (!failure.allowed && failure.locked) {
      return NextResponse.json(
        { error: "Too many failed attempts. Account temporarily locked." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(failure.retryAfterMs / 1000)) },
        },
      );
    }
    return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 401 });
  }

  recordLoginSuccess(ip);
  void auditLog("auth.pin.change", { sessionsRotated: true }, ip);
  return NextResponse.json({ success: true, sessionRotated: true });
}, "POST /api/auth/change-pin");
