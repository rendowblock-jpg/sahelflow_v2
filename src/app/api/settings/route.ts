import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllSettings, setSetting } from "@/lib/settings";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings — list all settings (non-secret).
 *
 * Session 29 fix (AUDIT-2 A5): previously this had NO auth check, leaking
 * license payload (with machine IDs), daily_report_phone, profile PII,
 * and any other settings to anyone who could reach the route. The Next.js
 * middleware protects it, but defense-in-depth requires the route itself
 * to enforce auth.
 */
export async function GET(): Promise<NextResponse> {
  await requireAuth();
  const settings = await getAllSettings();
  return NextResponse.json({ settings });
}

const updateSchema = z.object({
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

/**
 * PUT /api/settings — bulk-update settings.
 * Body: { settings: { key: value, ... } }
 * Values are coerced to strings (booleans → "true"/"false", numbers → "123").
 */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const input = updateSchema.parse(body);

  // W2-5: capture before-state (all settings before update) for audit.
  const before = await getAllSettings();

  for (const [key, value] of Object.entries(input.settings)) {
    await setSetting(key, value);
  }

  const settings = await getAllSettings();
  // Fire-and-forget audit log — settings mutations are security-sensitive
  // (license payload, daily_report_phone, profile PII).
  void logAudit({
    action: "settings.updated",
    entity: "settings",
    actor: "user",
    before: before as Record<string, unknown>,
    after: settings as Record<string, unknown>,
    metadata: { updatedKeys: Object.keys(input.settings) },
  });
  return NextResponse.json({ settings });
}, "PUT /api/settings");
