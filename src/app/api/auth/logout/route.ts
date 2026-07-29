import { NextResponse } from "next/server";
import { destroySession, auditLog } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const POST = withErrorHandler(async (req: Request) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await destroySession();
  void auditLog("auth.logout", {}, ip);
  return NextResponse.json({ success: true });
}, "POST /api/auth/logout");
