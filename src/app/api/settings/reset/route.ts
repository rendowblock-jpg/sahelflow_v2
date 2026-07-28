import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { withDemoPolicyLock } from "@/lib/demo/algerian-demo-policy";

export const dynamic = "force-dynamic";

const resetSchema = z.object({
  confirm: z.literal("RESET"),
});

const RESET_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
} as const;

/**
 * POST /api/settings/reset — wipe all business data and seller-created
 * operational configuration while preserving authentication, license authority,
 * reference data and existing integration credentials.
 *
 * Requires `confirm: "RESET"` in the body (defense against accidental clicks).
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();

  const body = await req.json();
  const input = resetSchema.parse(body);
  const context = { prisma: db, shop: shopContext };

  // Serialize with demo lifecycle and report effects so reset cannot remove the
  // marker halfway through a concurrent send or seed. The one transaction keeps
  // the public storefront, catalog, demo markers and dependent records aligned.
  await withDemoPolicyLock(() =>
    context.prisma.$transaction(async (tx) => {
      // Delete canonical business-truth children before their command and
      // aggregate authorities. The stable wrapped envelope key remains in Secret
      // so reset does not silently rotate or orphan encrypted key authority.
      await tx.compensationFact.deleteMany({});
      await tx.projectionInvalidation.deleteMany({});
      await tx.financialMovement.deleteMany({});
      await tx.inventoryMovement.deleteMany({});
      await tx.inventoryReservation.deleteMany({});
      await tx.outboxIntent.deleteMany({});
      await tx.domainEvent.deleteMany({});
      await tx.businessCommand.deleteMany({});
      await tx.businessAggregateVersion.deleteMany({});

      // Delete legacy/current business records in dependency order (children
      // before parents).
      await tx.extractionMetric.deleteMany({});
      await tx.returnNote.deleteMany({});
      await tx.orderChange.deleteMany({});
      await tx.refund.deleteMany({});
      await tx.return.deleteMany({});
      await tx.delivery.deleteMany({});
      await tx.orderItem.deleteMany({});
      await tx.order.deleteMany({});
      await tx.message.deleteMany({});
      await tx.conversation.deleteMany({});
      await tx.cannedResponse.deleteMany({});
      await tx.whatsAppTemplate.deleteMany({});
      await tx.storefrontConfig.deleteMany({});
      await tx.productVariant.deleteMany({});
      await tx.product.deleteMany({});
      await tx.category.deleteMany({});
      await tx.expense.deleteMany({});
      await tx.customer.deleteMany({});
      await tx.automationLog.deleteMany({});
      await tx.automation.deleteMany({});
      await tx.aiChatMessage.deleteMany({});
      await tx.aiChatSession.deleteMany({});
      await tx.phoneReputation.deleteMany({});
      await tx.counter.deleteMany({});
      await tx.auditLog.deleteMany({});

      // Preserve authentication/license and legacy integration credentials. All
      // demo markers, daily-report destinations and ordinary business settings
      // are removed. Dedicated Secret/Integration tables are intentionally
      // preserved by the reset contract, including the internal wrapped
      // business-envelope key.
      const protectedExactKeys = [
        "active_machine_id",
        "gemini_api_key",
        "google_sheets_sa",
        "delivery_yalidine_api_id",
        "delivery_yalidine_api_token",
        "delivery_maystro_api_token",
        "delivery_zr_api_token",
        "delivery_dhd_api_token",
      ];
      const protectedSettings = await tx.setting.findMany({
        where: {
          OR: [
            { key: { startsWith: "active_license" } },
            { key: { in: protectedExactKeys } },
          ],
        },
        select: { key: true },
      });
      await tx.setting.deleteMany({
        where: {
          key: {
            notIn: protectedSettings.map((setting) => setting.key),
          },
        },
      });
    }, RESET_TRANSACTION_OPTIONS),
  );

  await logAudit(context, {
    entity: "system",
    entityId: "database",
    action: "reset",
    actor: "user",
    before: { confirm: input.confirm },
    after: { wiped: "all business data and operational configuration" },
  });

  return NextResponse.json({
    ok: true,
    message: "Database reset. Redirecting to setup.",
  });
}, "POST /api/settings/reset");
