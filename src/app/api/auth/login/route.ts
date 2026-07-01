import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAuthSetup,
  verifyAuthPinAndMaybeRehash,
  createSession,
  auditLog,
} from "@/lib/auth/server";
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

export async function POST(req: Request) {
  await new Promise((r) => setTimeout(r, 1000));

  const ip = getClientIp(req.headers);
  const rl = checkLoginRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    recordLoginAttempt(ip);
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const setup = await isAuthSetup();
  if (!setup) {
    return NextResponse.json(
      { error: "Auth not set up yet", needsSetup: true },
      { status: 409 },
    );
  }

  recordLoginAttempt(ip);

  const { valid } = await verifyAuthPinAndMaybeRehash(parsed.data.pin);
  if (!valid) {
    const failResult = recordLoginFailure(ip);
    void auditLog("auth.login.failed", { reason: "wrong_pin" }, ip);
    if (!failResult.allowed && failResult.locked) {
      return NextResponse.json(
        { error: "Too many failed attempts. Account temporarily locked." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(failResult.retryAfterMs / 1000)) } },
      );
    }
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  recordLoginSuccess(ip);
  await createSession(ip);
  void auditLog("auth.login.success", {}, ip);

  return NextResponse.json({ success: true });
}
