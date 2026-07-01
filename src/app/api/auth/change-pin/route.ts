import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, changeAuthPin } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";

/**
 * SEC-002: Dedicated PIN-change endpoint that verifies the current PIN before
 * writing the new one. This closes the "compromised session changes PIN via
 * PUT /api/settings" hole — the only way to change the PIN now is to prove
 * knowledge of the current PIN.
 *
 * The new PIN must be ≥ 8 chars (SEC-001). The hash is written at CURRENT
 * PBKDF2 iterations (600k) regardless of the old hash's iteration count.
 */
const ChangePinSchema = z.object({
  currentPin: z.string().min(1, "Current PIN is required"),
  newPin: z
    .string()
    .min(8, "New PIN must be at least 8 characters")
    .max(32, "New PIN too long"),
});

export const POST = withErrorHandler(async (req: Request) => {
  // Defense-in-depth: must be authenticated. (Middleware already enforces this
  // for non-public routes, but requireAuth() re-verifies against the DB secret.)
  await requireAuth();

  const body = await req.json();
  const parsed = ChangePinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  // Reject no-op change (new === current) — would silently succeed otherwise
  if (parsed.data.newPin === parsed.data.currentPin) {
    return NextResponse.json(
      { error: "New PIN must be different from the current PIN" },
      { status: 400 },
    );
  }

  const result = await changeAuthPin(parsed.data.currentPin, parsed.data.newPin);
  if (!result.changed) {
    // currentPin didn't verify — 401 (don't reveal whether auth is set up)
    return NextResponse.json(
      { error: "Current PIN is incorrect" },
      { status: 401 },
    );
  }

  return NextResponse.json({ success: true });
}, "POST /api/auth/change-pin");
