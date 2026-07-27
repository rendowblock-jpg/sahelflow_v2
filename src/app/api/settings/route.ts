import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllSettings, setSetting } from "@/lib/settings";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { db, shopContext, type DbClient } from "@/lib/db";
import {
  assertDemoAllowsDailyReportSettings,
  withDemoPolicyLock,
} from "@/lib/demo/algerian-demo-policy";

export const dynamic = "force-dynamic";

const SETTINGS_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

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

  // Serialize with demo load/remove and report generation, then keep the
  // effective-state check and every settings write in one SQLite transaction.
  // This closes the check-then-write race: either the demo transaction commits
  // first and this update is rejected, or these settings commit first and demo
  // loading observes the effectful state and refuses to seed.
  const { before, settings } = await withDemoPolicyLock(() =>
    db.$transaction(async (transaction) => {
      const prisma = transaction as unknown as DbClient;
      const context = { prisma, shop: shopContext };

      // W2-5: capture before-state (all non-reserved settings) for audit.
      const beforeState = await getAllSettings(context);
      const effectiveAfter = {
        ...beforeState,
        ...input.settings,
      } as Record<string, unknown>;

      // Demo orders are intentionally realistic but may never be delivered to a
      // real WhatsApp destination. Check the complete effective after-state so
      // a partial update cannot retain an existing phone or enabled schedule.
      await assertDemoAllowsDailyReportSettings(prisma, effectiveAfter);

      // `setSetting` also rejects lifecycle marker keys. Because this runs inside
      // the transaction, a request mixing a reserved key with ordinary settings
      // cannot partially apply before the rejection.
      for (const [key, value] of Object.entries(input.settings)) {
        await setSetting(context, key, value);
      }

      return {
        before: beforeState,
        settings: await getAllSettings(context),
      };
    }, SETTINGS_TRANSACTION_OPTIONS),
  );

  // Fire-and-forget audit log — settings mutations are security-sensitive
  // (daily_report_phone, profile PII and other operational preferences).
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
