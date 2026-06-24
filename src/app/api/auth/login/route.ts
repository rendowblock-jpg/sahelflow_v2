import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthSetup, verifyAuthPin, getAuthSecret } from "@/lib/auth/server";
import { createSessionToken } from "@/lib/auth/crypto";
import { SESSION_TTL_MS, AUTH_COOKIE } from "@/lib/auth/config";

const LoginSchema = z.object({
  pin: z.string().min(1, "PIN is required"),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
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

  const valid = await verifyAuthPin(parsed.data.pin);
  if (!valid) {
    return NextResponse.json(
      { error: "Incorrect PIN" },
      { status: 401 },
    );
  }

  // Create session — set cookie via Set-Cookie header
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
