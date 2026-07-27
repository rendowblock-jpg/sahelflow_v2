import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllSettings, setSetting } from "@/lib/settings";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import { assertDemoAllowsDailyReportSettings } from "@/lib/demo/algerian-demo-policy";

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
  const settings = await getAllSettings({ prisma: db, shop: shopContext });
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
  const context = { prisma: db, shop: shopContext };

  // W2-5: capture before-state (all settings before update) for audit.
  const before = await getAllSettings(context);
  const effectiveAfter = {
    ...before,
    ...input.settings,
  } as Record<string, unknown>;

  // Demo orders are intentionally realistic but may never be delivered to a
  // real WhatsApp destination. Check the complete effective after-state so an
  // update cannot enable the schedule while retaining an existing phone (or set
  // a phone while retaining an enabled schedule). Clearing both remains allowed.
  await assertDemoAllowsDailyReportSettings(db, effectiveAfter);

  for (const [key, value] of Object.entries(input.settings)) {
    await setSetting(context, key, value);
  }

  const settings = await getAllSettings(context);
  // Fire-and-forget audit log — settings mutations are security-sensitive
  // (license payload, daily_report_phone, profile PII).
  void logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "settings.updated",
      entity: "settings",
      actor: "user",
      before: before as Record<string, unknown>,
      after: settings as Record<string, unknown>,
      metadata: { updatedKeys: Object.keys(input.settings) },
    },
  );
  return NextResponse.json({ settings });
}, "PUT /api/settings");
