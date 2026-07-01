import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, changeAuthPin, auditLog } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";

const ChangePinSchema = z.object({
  currentPin: z.string().min(1, "Current PIN is required"),
  newPin: z.string().min(8, "New PIN must be at least 8 characters").max(32, "New PIN too long"),
});

export const POST = withErrorHandler(async (req: Request) => {
  await requireAuth();
  const body = await req.json();
  const parsed = ChangePinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  if (parsed.data.newPin === parsed.data.currentPin) {
    return NextResponse.json(
      { error: "New PIN must be different from the current PIN" },
      { status: 400 },
    );
  }
  const result = await changeAuthPin(parsed.data.currentPin, parsed.data.newPin);
  if (!result.changed) {
    return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 401 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  void auditLog("auth.pin.change", {}, ip);
  return NextResponse.json({ success: true });
}, "POST /api/auth/change-pin");
