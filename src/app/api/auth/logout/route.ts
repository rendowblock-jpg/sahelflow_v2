import { NextResponse } from "next/server";
import { destroySession, auditLog } from "@/lib/auth/server";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await destroySession();
  void auditLog("auth.logout", {}, ip);
  return NextResponse.json({ success: true });
}
