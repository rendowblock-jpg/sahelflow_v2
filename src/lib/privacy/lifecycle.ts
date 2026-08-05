import "server-only";

import { db, shopContext } from "@/lib/db";
import { withDemoPolicyLock } from "@/lib/demo/algerian-demo-policy";
import { withPrivacyEraseTransaction } from "@/lib/maintenance/privacy-erase-transaction";

const EXPORT_FORMAT_VERSION = 1 as const;
const EXPORT_MAX_BYTES = 32 * 1024 * 1024;

export type PrivacyEraseMode = "business-reset" | "privacy-erase";

export interface PrivacyLifecycleReceipt {
  formatVersion: 1;
  mode: PrivacyEraseMode;
  workspaceId: string;
  installationId: string;
  shopId: string;
  shopIncarnationId: string;
  completedAt: string;
  retainedAuthorities: readonly string[];
}

/**
 * Export subject/business data through the protected Prisma client so encrypted
 * columns are opened only for the authorized response. Credential values and
 * key material are never included; setting names are exported for transparency.
 */
export async function createShopPrivacyExport(): Promise<Buffer> {
  const [
    customers,
    orders,
    conversations,
    auditLogs,
    aiSessions,
    settings,
  ] = await Promise.all([
    db.customer.findMany({ orderBy: { createdAt: "asc" } }),
    db.order.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        items: true,
        delivery: true,
        returns: { include: { notes_rel: true } },
        orderChanges: true,
        refunds: true,
      },
    }),
    db.conversation.findMany({
      orderBy: { createdAt: "asc" },
      include: { messages: { orderBy: { timestamp: "asc" } } },
    }),
    db.auditLog.findMany({ orderBy: { createdAt: "asc" } }),
    db.aiChatSession.findMany({
      orderBy: { createdAt: "asc" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
    db.setting.findMany({
      select: { key: true, updatedAt: true },
      orderBy: { key: "asc" },
    }),
  ]);

  const payload = Buffer.from(
    `${JSON.stringify(
      {
        formatVersion: EXPORT_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        authority: {
          workspaceId: shopContext.workspaceId,
          installationId: shopContext.installationId,
          shopId: shopContext.shopId,
          shopIncarnationId: shopContext.shopIncarnationId,
          registryRevision: shopContext.registryRevision,
        },
        exclusions: [
          "credential values",
          "protected key material",
          "session secrets",
          "backup recovery secrets",
          "ephemeral runtime state",
        ],
        customers,
        orders,
        conversations,
        auditLogs,
        aiSessions,
        settingMetadata: settings,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  if (payload.length > EXPORT_MAX_BYTES) {
    payload.fill(0);
    throw new Error(
      "Privacy export exceeds the local response limit; use the encrypted all-shop backup for complete installation portability.",
    );
  }
  return payload;
}

/**
 * One canonical dependency-ordered erase. Both reset and privacy erase remove
 * credentials instead of preserving hidden access to the previous workspace.
 * Installation authentication, revocation history, migration history, wrapped
 * random key descriptors and public wilaya reference data remain as explicit
 * non-business authority. Every other durable Prisma model is deleted here.
 */
export async function executeShopErase(
  mode: PrivacyEraseMode,
): Promise<PrivacyLifecycleReceipt> {
  await withDemoPolicyLock(() =>
    withPrivacyEraseTransaction(async (tx) => {
      // Sensitive AI proposals and approvals precede their parent proposal.
      await tx.aiActionApproval.deleteMany({});
      await tx.aiActionExecution.deleteMany({});
      await tx.aiActionProposal.deleteMany({});

      // Durable automation attempts precede steps and runs.
      await tx.automationStepAttempt.deleteMany({});
      await tx.automationStepRun.deleteMany({});
      await tx.automationRun.deleteMany({});

      // Commerce item/run attempts precede their items/pages/runs.
      await tx.commerceSyncItemAttempt.deleteMany({});
      await tx.commerceSyncRunAttempt.deleteMany({});
      await tx.commerceSyncItem.deleteMany({});
      await tx.commerceSyncPage.deleteMany({});
      await tx.commerceSyncRun.deleteMany({});

      // Provider attempts restrict their ingress event parents.
      await tx.providerIngressAttempt.deleteMany({});
      await tx.providerIngressEvent.deleteMany({});
      await tx.providerCapabilityCertification.deleteMany({});

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

      await tx.codSettlementLineMatch.deleteMany({});
      await tx.codSettlementCorrection.deleteMany({});
      await tx.codSettlementLine.deleteMany({});
      await tx.codSettlement.deleteMany({});
      await tx.codCollectionCorrection.deleteMany({});
      await tx.codCollection.deleteMany({});

      await tx.collaborationMention.deleteMany({});
      await tx.collaborationComment.deleteMany({});
      await tx.collaborationHandover.deleteMany({});
      await tx.collaborationAssignment.deleteMany({});
      await tx.collaborationWorkgroupMember.deleteMany({});
      await tx.collaborationQueue.deleteMany({});
      await tx.collaborationWorkgroup.deleteMany({});

      await tx.compensationFact.deleteMany({});
      await tx.projectionInvalidation.deleteMany({});
      await tx.profitabilityCostSnapshot.deleteMany({});
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
      await tx.integration.deleteMany({});
      await tx.counter.deleteMany({});
      await tx.auditLog.deleteMany({});

      // Credentials and provider configuration are confidential data. Both the
      // dedicated encrypted store and non-secret settings are erased.
      await tx.secret.deleteMany({});
      await tx.setting.deleteMany({});

      // Keep revocation/security history but terminate every active session so
      // a completed erase cannot leave another live browser or device session.
      await tx.session.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }),
  );

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    mode,
    workspaceId: shopContext.workspaceId,
    installationId: shopContext.installationId,
    shopId: shopContext.shopId,
    shopIncarnationId: shopContext.shopIncarnationId,
    completedAt: new Date().toISOString(),
    retainedAuthorities: [
      "installation authentication and revoked-session history",
      "Prisma migration history",
      "wrapped purpose-separated protected-key descriptors",
      "public wilaya reference data",
      "post-operation non-PII audit receipt",
    ],
  };
}
