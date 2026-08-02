import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRecentReauthentication } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { withDemoPolicyLock } from "@/lib/demo/algerian-demo-policy";
import {
  assertTrustedAction,
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

const resetSchema = z.object({
  confirm: z.literal("RESET"),
});

const RESET_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
} as const;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("settings.manage");
  assertTrustedAction(actorContext, "approvals.approve");
  await requireRecentReauthentication();

  const body = await req.json();
  const input = resetSchema.parse(body);
  const context = { prisma: db, shop: shopContext };

  await withDemoPolicyLock(() =>
    context.prisma.$transaction(async (tx) => {
      // Canonical return/refund facts restrict BusinessCommand, Order, OrderItem,
      // Product and Delivery deletion. Delete the append-only children first.
      await tx.canonicalRefundReversal.deleteMany({});
      await tx.canonicalRefund.deleteMany({});
      await tx.canonicalExchangeOrder.deleteMany({});
      await tx.canonicalReturnInspection.deleteMany({});
      await tx.canonicalExchangeRequestItem.deleteMany({});
      await tx.canonicalExchangeRequest.deleteMany({});
      await tx.canonicalReturnItem.deleteMany({});
      await tx.canonicalReturnEvent.deleteMany({});
      await tx.canonicalReturnCase.deleteMany({});
      await tx.canonicalDeliveryEvent.deleteMany({});

      // Canonical COD facts restrict both BusinessCommand and Order deletion.
      await tx.codSettlementLineMatch.deleteMany({});
      await tx.codSettlementCorrection.deleteMany({});
      await tx.codSettlementLine.deleteMany({});
      await tx.codSettlement.deleteMany({});
      await tx.codCollectionCorrection.deleteMany({});
      await tx.codCollection.deleteMany({});

      // Collaboration facts and routing state are shop-operational data. Remove
      // dependent rows before queues and workgroups so a full reset cannot
      // expose a previous workspace's internal comments or assignments.
      await tx.collaborationMention.deleteMany({});
      await tx.collaborationComment.deleteMany({});
      await tx.collaborationHandover.deleteMany({});
      await tx.collaborationAssignment.deleteMany({});
      await tx.collaborationWorkgroupMember.deleteMany({});
      await tx.collaborationQueue.deleteMany({});
      await tx.collaborationWorkgroup.deleteMany({});

      await tx.compensationFact.deleteMany({});
      await tx.projectionInvalidation.deleteMany({});
      await tx.financialMovement.deleteMany({});
      await tx.inventoryMovement.deleteMany({});
      await tx.inventoryReservation.deleteMany({});
      await tx.outboxIntent.deleteMany({});
      await tx.domainEvent.deleteMany({});
      await tx.businessCommand.deleteMany({});
      await tx.businessAggregateVersion.deleteMany({});

      await tx.extractionMetric.deleteMany({});
      await tx.returnNote.deleteMany({});
      await tx.orderChange.deleteMany({});
      await tx.refund.deleteMany({});
      await tx.return.deleteMany({});
      await tx.delivery.deleteMany({});
      await tx.orderItem.deleteMany({});
      await tx.order.deleteMany({});
      // The durable effect row restricts deletion of its Message authority.
      await tx.whatsAppOutboundEffect.deleteMany({});
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

      const protectedExactKeys = [
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
    actor: trustedActorAuditIdentity(actorContext.actor),
    before: { confirm: input.confirm },
    after: { wiped: "all business data and operational configuration" },
  });

  return NextResponse.json({
    ok: true,
    message: "Database reset. Redirecting to setup.",
  });
}, "POST /api/settings/reset");
