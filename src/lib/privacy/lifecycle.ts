import "server-only";

import { db, shopContext } from "@/lib/db";
import { withDemoPolicyLock } from "@/lib/demo/algerian-demo-policy";
import { withPrivacyEraseTransaction } from "@/lib/maintenance/privacy-erase-transaction";

const PRIVACY_EXPORT_FORMAT_VERSION = 2 as const;
const PRIVACY_ERASE_RECEIPT_FORMAT_VERSION = 1 as const;
const EXPORT_MAX_BYTES = 32 * 1024 * 1024;

const PRIVACY_EXPORT_EXCLUDED_MODELS = [
  "AuthSecret",
  "ProtectedKeyAuthority",
  "Secret",
  "Session",
  "WilayaRiskProfile",
] as const;

/**
 * Exact model-level export authority derived from the Phase 4 data inventory.
 * Every included model is loaded through the protected Prisma client so
 * contextual protected fields are opened only for this authorized response.
 * Setting values remain excluded; only their non-secret metadata is exported.
 */
const PRIVACY_EXPORT_MODEL_LOADERS = {
  AiActionApproval: () => db.aiActionApproval.findMany(),
  AiActionExecution: () => db.aiActionExecution.findMany(),
  AiActionProposal: () => db.aiActionProposal.findMany(),
  AiChatMessage: () => db.aiChatMessage.findMany(),
  AiChatSession: () => db.aiChatSession.findMany(),
  AuditLog: () => db.auditLog.findMany(),
  Automation: () => db.automation.findMany(),
  AutomationLog: () => db.automationLog.findMany(),
  AutomationRun: () => db.automationRun.findMany(),
  AutomationStepAttempt: () => db.automationStepAttempt.findMany(),
  AutomationStepRun: () => db.automationStepRun.findMany(),
  BusinessAggregateVersion: () => db.businessAggregateVersion.findMany(),
  BusinessCommand: () => db.businessCommand.findMany(),
  CannedResponse: () => db.cannedResponse.findMany(),
  CanonicalDeliveryEvent: () => db.canonicalDeliveryEvent.findMany(),
  CanonicalExchangeOrder: () => db.canonicalExchangeOrder.findMany(),
  CanonicalExchangeRequest: () => db.canonicalExchangeRequest.findMany(),
  CanonicalExchangeRequestItem: () =>
    db.canonicalExchangeRequestItem.findMany(),
  CanonicalRefund: () => db.canonicalRefund.findMany(),
  CanonicalRefundReversal: () => db.canonicalRefundReversal.findMany(),
  CanonicalReturnCase: () => db.canonicalReturnCase.findMany(),
  CanonicalReturnEvent: () => db.canonicalReturnEvent.findMany(),
  CanonicalReturnInspection: () => db.canonicalReturnInspection.findMany(),
  CanonicalReturnItem: () => db.canonicalReturnItem.findMany(),
  Category: () => db.category.findMany(),
  CodCollection: () => db.codCollection.findMany(),
  CodCollectionCorrection: () => db.codCollectionCorrection.findMany(),
  CodSettlement: () => db.codSettlement.findMany(),
  CodSettlementCorrection: () => db.codSettlementCorrection.findMany(),
  CodSettlementLine: () => db.codSettlementLine.findMany(),
  CodSettlementLineMatch: () => db.codSettlementLineMatch.findMany(),
  CollaborationAssignment: () => db.collaborationAssignment.findMany(),
  CollaborationComment: () => db.collaborationComment.findMany(),
  CollaborationHandover: () => db.collaborationHandover.findMany(),
  CollaborationMention: () => db.collaborationMention.findMany(),
  CollaborationQueue: () => db.collaborationQueue.findMany(),
  CollaborationWorkgroup: () => db.collaborationWorkgroup.findMany(),
  CollaborationWorkgroupMember: () =>
    db.collaborationWorkgroupMember.findMany(),
  CommerceSyncItem: () => db.commerceSyncItem.findMany(),
  CommerceSyncItemAttempt: () => db.commerceSyncItemAttempt.findMany(),
  CommerceSyncPage: () => db.commerceSyncPage.findMany(),
  CommerceSyncRun: () => db.commerceSyncRun.findMany(),
  CommerceSyncRunAttempt: () => db.commerceSyncRunAttempt.findMany(),
  CompensationFact: () => db.compensationFact.findMany(),
  Conversation: () => db.conversation.findMany(),
  Counter: () => db.counter.findMany(),
  Customer: () => db.customer.findMany(),
  Delivery: () => db.delivery.findMany(),
  DomainEvent: () => db.domainEvent.findMany(),
  Expense: () => db.expense.findMany(),
  ExtractionMetric: () => db.extractionMetric.findMany(),
  FinancialMovement: () => db.financialMovement.findMany(),
  Integration: () => db.integration.findMany(),
  InventoryMovement: () => db.inventoryMovement.findMany(),
  InventoryReservation: () => db.inventoryReservation.findMany(),
  Message: () => db.message.findMany(),
  Order: () => db.order.findMany(),
  OrderChange: () => db.orderChange.findMany(),
  OrderItem: () => db.orderItem.findMany(),
  OutboxIntent: () => db.outboxIntent.findMany(),
  PhoneReputation: () => db.phoneReputation.findMany(),
  Product: () => db.product.findMany(),
  ProductVariant: () => db.productVariant.findMany(),
  ProfitabilityCostSnapshot: () =>
    db.profitabilityCostSnapshot.findMany(),
  ProjectionInvalidation: () => db.projectionInvalidation.findMany(),
  ProviderCapabilityCertification: () =>
    db.providerCapabilityCertification.findMany(),
  ProviderIngressAttempt: () => db.providerIngressAttempt.findMany(),
  ProviderIngressEvent: () => db.providerIngressEvent.findMany(),
  Refund: () => db.refund.findMany(),
  Return: () => db.return.findMany(),
  ReturnNote: () => db.returnNote.findMany(),
  Setting: () =>
    db.setting.findMany({
      select: { key: true, updatedAt: true },
      orderBy: { key: "asc" },
    }),
  StorefrontConfig: () => db.storefrontConfig.findMany(),
  WhatsAppOutboundEffect: () => db.whatsAppOutboundEffect.findMany(),
  WhatsAppTemplate: () => db.whatsAppTemplate.findMany(),
} as const;

type PrivacyExportModel = keyof typeof PRIVACY_EXPORT_MODEL_LOADERS;

async function loadPrivacyExportModels(): Promise<
  Record<PrivacyExportModel, unknown>
> {
  const modelNames = Object.keys(
    PRIVACY_EXPORT_MODEL_LOADERS,
  ) as PrivacyExportModel[];
  const entries = await Promise.all(
    modelNames.map(async (model) => {
      const rows = await PRIVACY_EXPORT_MODEL_LOADERS[model]();
      return [model, rows] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<PrivacyExportModel, unknown>;
}

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
 * Export every inventory-declared seller, subject, business and relevant
 * operational model through the protected Prisma client. Credential values,
 * key material, active-session authority and public reference data are excluded
 * exactly as declared by the Phase 4 privacy inventory.
 */
export async function createShopPrivacyExport(): Promise<Buffer> {
  const models = await loadPrivacyExportModels();

  const payload = Buffer.from(
    `${JSON.stringify(
      {
        formatVersion: PRIVACY_EXPORT_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        authority: {
          workspaceId: shopContext.workspaceId,
          installationId: shopContext.installationId,
          shopId: shopContext.shopId,
          shopIncarnationId: shopContext.shopIncarnationId,
          registryRevision: shopContext.registryRevision,
        },
        inventory: {
          includedModels: Object.keys(PRIVACY_EXPORT_MODEL_LOADERS),
          excludedModels: PRIVACY_EXPORT_EXCLUDED_MODELS,
          settingValuesExcluded: true,
        },
        exclusions: [
          "credential values",
          "protected key material",
          "session and installation authentication authority",
          "backup recovery secrets",
          "public rebuildable wilaya reference data",
          "ephemeral runtime state",
        ],
        models,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  if (payload.length > EXPORT_MAX_BYTES) {
    payload.fill(0);
    throw new Error(
      "Privacy export exceeds the local response limit; no partial portability file was created.",
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
    formatVersion: PRIVACY_ERASE_RECEIPT_FORMAT_VERSION,
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
