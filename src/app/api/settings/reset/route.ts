import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const resetSchema = z.object({
  confirm: z.literal("RESET"),
});

/**
 * POST /api/settings/reset — wipe all business data (orders, customers,
 * products, deliveries, returns, conversations, messages, automations, etc.)
 * but preserve auth (AuthSecret, Session), license (Setting: active_license_*),
 * and shop config (shops table, app-meta).
 *
 * Requires `confirm: "RESET"` in the body (defense against accidental clicks).
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();

  const body = await req.json();
  const input = resetSchema.parse(body);

  await db.$transaction(async (tx) => {
    // Delete in dependency order (children before parents).
    await tx.orderChange.deleteMany({});
    await tx.refund.deleteMany({});
    await tx.return.deleteMany({});
    await tx.delivery.deleteMany({});
    await tx.orderItem.deleteMany({});
    await tx.order.deleteMany({});
    await tx.message.deleteMany({});
    await tx.conversation.deleteMany({});
    await tx.cannedResponse.deleteMany({});
    await tx.productVariant.deleteMany({});
    await tx.product.deleteMany({});
    await tx.category.deleteMany({});
    await tx.expense.deleteMany({});
    await tx.customer.deleteMany({});
    await tx.automationLog.deleteMany({});
    await tx.automation.deleteMany({});
    await tx.aiChatMessage.deleteMany({});
    await tx.aiChatSession.deleteMany({});
    await tx.extractionMetric.deleteMany({});
    await tx.notification.deleteMany({});
    await tx.dailyAnalyticsReport.deleteMany({});
    await tx.auditLog.deleteMany({});
    // Settings — clear business settings but KEEP auth/license/integration creds
    const protectedKeys = [
      "active_license_status", "active_license_payload",
      "gemini_api_key", "google_sheets_sa",
      "delivery_yalidine_api_id", "delivery_yalidine_api_token",
      "delivery_maystro_api_token", "delivery_zr_api_token", "delivery_dhd_api_token",
    ];
    await tx.setting.deleteMany({
      where: { NOT: { key: { in: protectedKeys } } },
    });
  });

  await logAudit({
    entity: "system",
    entityId: "database",
    action: "reset",
    actor: "user",
    before: { confirm: input.confirm },
    after: { wiped: "all business data" },
  });

  return NextResponse.json({ ok: true, message: "Database reset. Redirecting to setup." });
}, "POST /api/settings/reset");
