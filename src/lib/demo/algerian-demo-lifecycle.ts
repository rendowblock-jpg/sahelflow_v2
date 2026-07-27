import "server-only";

import { db, type DbClient } from "@/lib/db";
import {
  clearAlgerianDemoData,
  getAlgerianDemoStatus,
  seedAlgerianDemoData,
  type AlgerianDemoStatus,
} from "@/lib/demo/algerian-demo";
import {
  dailyReportWouldBeEffectful,
  withDemoPolicyLock,
} from "@/lib/demo/algerian-demo-policy";
import { finalizeAlgerianDemoStory } from "@/lib/demo/algerian-demo-story";
import { SETTING_KEYS } from "@/lib/settings";
import { SahelFlowError } from "@/types/errors";

const DEMO_PREFIX = "demo-";
const LEGACY_PHONE_REPUTATION_KEY = "phone_reputation_blacklist";
const TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 120_000,
} as const;

const outsideDemo = { not: { startsWith: DEMO_PREFIX } } as const;
const demoIdentity = { startsWith: DEMO_PREFIX } as const;

/**
 * Settings are normally shell preferences and do not make a shop operationally
 * non-empty. These two values are different: a configured destination or an
 * enabled schedule can send a real WhatsApp report derived from newly seeded
 * demo orders, so either one blocks loading.
 */
async function countEffectfulSettings(client: DbClient): Promise<number> {
  const rows = await client.setting.findMany({
    where: {
      key: {
        in: [SETTING_KEYS.dailyReportEnabled, SETTING_KEYS.dailyReportPhone],
      },
    },
    select: { key: true, value: true },
  });
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return dailyReportWouldBeEffectful(settings) ? 1 : 0;
}

/**
 * Upgraded shops may still retain seller-owned phone-risk intelligence in the
 * historical JSON Setting because no migration to PhoneReputation rows has been
 * shipped. Non-empty or malformed retained data fails closed; only an absent,
 * blank, null, empty-array or empty-object value is considered empty.
 */
async function countLegacyPhoneReputation(client: DbClient): Promise<number> {
  const row = await client.setting.findUnique({
    where: { key: LEGACY_PHONE_REPUTATION_KEY },
    select: { value: true },
  });
  const raw = row?.value.trim() ?? "";
  if (!raw) return 0;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length > 0 ? 1 : 0;
    if (parsed && typeof parsed === "object") {
      return Object.keys(parsed as Record<string, unknown>).length > 0 ? 1 : 0;
    }
    return parsed ? 1 : 0;
  } catch {
    // Retained seller data must not be ignored merely because its legacy blob
    // cannot be decoded. Block seeding and leave recovery to an explicit path.
    return 1;
  }
}

/**
 * Standalone extraction metrics are seller analytics and make a shop non-empty.
 * A generated non-demo metric whose `messageId` points at a demo message is part
 * of the removable demo graph, so it must not block the cleanup that deletes it.
 */
async function countIndependentExtractionMetrics(
  client: DbClient,
): Promise<number> {
  const [outsideIdCount, demoMessageDerivedCount] = await Promise.all([
    client.extractionMetric.count({ where: { id: outsideDemo } }),
    client.extractionMetric.count({
      where: {
        id: outsideDemo,
        messageId: demoIdentity,
      },
    }),
  ]);
  return Math.max(0, outsideIdCount - demoMessageDerivedCount);
}

/**
 * Count seller-owned state that must never be mixed with the evaluation dataset.
 *
 * Auth/session rows, security audit entries, reference-only WilayaRiskProfile
 * rows and harmless preference Settings belong to the installed shell rather
 * than an active shop's sample business records. Business entities, sequence
 * counters, independent extraction analytics, credentials, integrations,
 * storefronts, automations, reusable messaging, current/legacy phone-risk data
 * and effectful report Settings are included even when the visible catalog is
 * otherwise empty.
 */
async function countNonDemoSellerState(client: DbClient): Promise<number> {
  const counts = await Promise.all([
    client.category.count({ where: { id: outsideDemo } }),
    client.product.count({ where: { id: outsideDemo } }),
    client.productVariant.count({ where: { id: outsideDemo } }),
    client.customer.count({ where: { id: outsideDemo } }),
    client.order.count({ where: { id: outsideDemo } }),
    client.delivery.count({ where: { id: outsideDemo } }),
    client.return.count({ where: { id: outsideDemo } }),
    client.refund.count({ where: { id: outsideDemo } }),
    client.conversation.count({ where: { id: outsideDemo } }),
    client.message.count({ where: { id: outsideDemo } }),
    client.expense.count({ where: { id: outsideDemo } }),
    client.storefrontConfig.count({ where: { id: outsideDemo } }),
    client.automation.count({ where: { id: outsideDemo } }),
    client.cannedResponse.count({ where: { id: outsideDemo } }),
    client.whatsAppTemplate.count({ where: { id: outsideDemo } }),
    client.integration.count({ where: { id: outsideDemo } }),
    client.secret.count({ where: { id: outsideDemo } }),
    client.aiChatSession.count({ where: { id: outsideDemo } }),
    countIndependentExtractionMetrics(client),
    client.counter.count(),
    // The demo does not create PhoneReputation records. Every row here is
    // independently owned seller risk intelligence and makes the shop non-empty.
    client.phoneReputation.count(),
    countLegacyPhoneReputation(client),
    countEffectfulSettings(client),
  ]);
  return counts.reduce((total, count) => total + count, 0);
}

/**
 * Remove records created through normal application flows but derived from demo
 * entities. These rows may have generated non-demo IDs, so prefix-only cleanup
 * is insufficient.
 */
async function clearDemoDerivedRecords(client: DbClient): Promise<void> {
  await client.extractionMetric.deleteMany({
    where: {
      OR: [{ id: demoIdentity }, { messageId: demoIdentity }],
    },
  });
  await client.auditLog.deleteMany({
    where: {
      OR: [{ id: demoIdentity }, { entityId: demoIdentity }],
    },
  });
  await client.automationLog.deleteMany({
    where: {
      OR: [{ id: demoIdentity }, { automationId: demoIdentity }],
    },
  });
  await client.aiChatMessage.deleteMany({
    where: {
      OR: [{ id: demoIdentity }, { sessionId: demoIdentity }],
    },
  });
  await client.returnNote.deleteMany({
    where: {
      OR: [{ id: demoIdentity }, { returnId: demoIdentity }],
    },
  });
  await client.refund.deleteMany({
    where: {
      OR: [
        { id: demoIdentity },
        { orderId: demoIdentity },
        { returnId: demoIdentity },
      ],
    },
  });
  await client.return.deleteMany({
    where: {
      OR: [{ id: demoIdentity }, { orderId: demoIdentity }],
    },
  });
  await client.delivery.deleteMany({
    where: {
      OR: [{ id: demoIdentity }, { orderId: demoIdentity }],
    },
  });
  await client.orderChange.deleteMany({
    where: {
      OR: [{ id: demoIdentity }, { orderId: demoIdentity }],
    },
  });
  await client.orderItem.deleteMany({
    where: {
      OR: [{ id: demoIdentity }, { orderId: demoIdentity }],
    },
  });
}

async function safeStatus(client: DbClient): Promise<AlgerianDemoStatus> {
  const [status, nonDemoState] = await Promise.all([
    getAlgerianDemoStatus(client),
    countNonDemoSellerState(client),
  ]);

  return {
    ...status,
    canSeed: !status.loaded && nonDemoState === 0,
    // An interrupted demo footprint is recoverable and must not masquerade as
    // seller data. Only independently owned non-demo state blocks loading.
    hasBusinessData: status.loaded || nonDemoState > 0,
  };
}

export async function getAlgerianDemoWorkspaceStatus(
  client: DbClient = db,
): Promise<AlgerianDemoStatus> {
  return safeStatus(client);
}

/**
 * Atomically recover any interrupted demo footprint and create the complete
 * deterministic workspace. The shared policy lock serializes this operation
 * with report-setting writes and report sends; the database transaction gives
 * rollback if any seed/finalizer write fails.
 */
export async function loadAlgerianDemoWorkspace(
  client: DbClient = db,
): Promise<AlgerianDemoStatus> {
  return withDemoPolicyLock(() =>
    client.$transaction(async (transaction) => {
      const tx = transaction as unknown as DbClient;
      const status = await safeStatus(tx);
      if (status.loaded) return status;

      if ((await countNonDemoSellerState(tx)) > 0) {
        throw new SahelFlowError(
          "Sample data can only be loaded into a shop with no seller-owned business records, sequence/analytics state, current or legacy phone-risk data, storefronts, automations, integrations, reusable messaging configuration or effectful daily-report settings.",
          "DEMO_SHOP_NOT_EMPTY",
          409,
        );
      }

      // Recover a marker-less partial footprint from a previously interrupted
      // version before starting the atomic seed.
      await clearDemoDerivedRecords(tx);
      await clearAlgerianDemoData(tx);
      await seedAlgerianDemoData(tx);
      await finalizeAlgerianDemoStory(tx);
      return safeStatus(tx);
    }, TRANSACTION_OPTIONS),
  );
}

/**
 * Remove the complete demo graph atomically. Any independently owned seller
 * state blocks cleanup, including a non-demo storefront that references demo
 * products. The same policy lock prevents concurrent report configuration/send.
 */
export async function removeAlgerianDemoWorkspace(
  client: DbClient = db,
): Promise<AlgerianDemoStatus> {
  return withDemoPolicyLock(() =>
    client.$transaction(async (transaction) => {
      const tx = transaction as unknown as DbClient;
      if ((await countNonDemoSellerState(tx)) > 0) {
        throw new SahelFlowError(
          "Demo removal is blocked because independently owned seller records, sequence/analytics state, current or legacy phone-risk data, configuration or effectful daily-report settings now exist. Export or move that work before removing the sample workspace.",
          "DEMO_REMOVAL_REAL_DATA_PRESENT",
          409,
        );
      }

      await clearDemoDerivedRecords(tx);
      await clearAlgerianDemoData(tx);
      return safeStatus(tx);
    }, TRANSACTION_OPTIONS),
  );
}
