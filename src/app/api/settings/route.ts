import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllSettings, setSetting } from "@/lib/settings";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { db, shopContext, type DbClient } from "@/lib/db";
import { withDemoPolicyLock } from "@/lib/demo/algerian-demo-policy";

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
export const GET = withErrorHandler(async (): Promise<NextResponse> => {
  await requireAuth("settings.read");
  const settings = await getAllSettings({ prisma: db, shop: shopContext });
  return NextResponse.json({ settings });
}, "GET /api/settings");

// Audit S3-13: bounded settings payload — the previous record accepted any
// key count/length and value size, and every entry is written inside one
// 30s SQLite transaction. Zod failures surface as coded 400
// REQUEST_VALIDATION_FAILED via withErrorHandler.
const updateSchema = z.object({
  settings: z
    .record(
      z.string().max(64),
      z.union([z.string().max(4000), z.number().finite(), z.boolean()]),
    )
    .refine(
      (record) => Object.keys(record).length <= 64,
      "Settings update is limited to 64 keys",
    ),
});

/**
 * PUT /api/settings — bulk-update settings.
 * Body: { settings: { key: value, ... } }
 * Values are coerced to strings (booleans → "true"/"false", numbers → "123").
 */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("settings.manage");
  const body = await req.json();
  const input = updateSchema.parse(body);

  // Serialize with demo load/remove and report generation, then keep every
  // settings write in one SQLite transaction. FD-052 option A (coexist):
  // effectful daily-report settings are accepted while the demo is loaded —
  // demo rows are Founder-accepted contributors to reports until removed.
  const { before, settings } = await withDemoPolicyLock(() =>
    db.$transaction(async (transaction) => {
      const prisma = transaction as unknown as DbClient;
      const context = { prisma, shop: shopContext };

      // W2-5: capture before-state (all non-reserved settings) for audit.
      const beforeState = await getAllSettings(context);

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
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "settings.updated",
      entity: "settings",
      actor: trustedActorAuditIdentity(actorContext.actor),
      before: before as Record<string, unknown>,
      after: settings as Record<string, unknown>,
      metadata: { updatedKeys: Object.keys(input.settings) },
    },
  );
  return NextResponse.json({ settings });
}, "PUT /api/settings");
