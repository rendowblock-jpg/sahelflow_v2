import { NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  auditLog,
  reauthenticateCurrentSession,
  requireAuth,
} from "@/lib/auth/server";
import { getClientIp } from "@/lib/auth/rate-limit";

const Schema = z.object({ pin: z.string().min(1, "PIN is required") });

export const POST = withErrorHandler(async (req: Request) => {
  await requireAuth();
  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "PIN is required" }, { status: 400 });
  }

  const ip = getClientIp(req.headers);
  const result = await reauthenticateCurrentSession(parsed.data.pin, ip);
  if (!result.reauthenticated) {
    void auditLog("auth.reauthenticate.failed", {}, ip);
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  void auditLog("auth.reauthenticate.success", { sessionRotated: true }, ip);
  return NextResponse.json({ success: true, sessionRotated: true });
}, "POST /api/auth/reauthenticate");
