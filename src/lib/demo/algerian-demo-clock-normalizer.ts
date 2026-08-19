import "server-only";

import type { DbClient } from "@/lib/db";

const DEMO_PREFIX = "demo-";
const DEMO_CREATED_AT_KEY = "demo_seed_created_at";

function shiftDate(value: Date | null, deltaMs: number): Date | null {
  return value ? new Date(value.getTime() + deltaMs) : null;
}

/**
 * Shift the recent v1 seed onto the same calendar-day authority used by the
 * annual demo layer.
 *
 * The historical seed predates the rolling-year clock and intentionally builds
 * deterministic day/hour offsets from the machine's current calendar day. The
 * annual workspace cannot leave those rows attached to wall-clock time when
 * SF_DEMO_REFERENCE_NOW freezes evidence, otherwise the recent 48 orders become
 * future records relative to the frozen year. We therefore shift every explicit
 * recent business timestamp by the calendar-day delta before annual history is
 * added. Relative order/message/delivery timing is preserved exactly, and the
 * marker is rebound to the reference clock.
 *
 * This runs only after a fresh base seed and before any `demo-*-year-*` records
 * exist, inside the demo lifecycle transaction/policy lock.
 */
export async function normalizeAlgerianDemoRecentClock(
  client: DbClient,
  reference: Date,
): Promise<void> {
  const marker = await client.setting.findUnique({
    where: { key: DEMO_CREATED_AT_KEY },
    select: { value: true },
  });
  const seedAnchor = marker?.value ? new Date(marker.value) : new Date();
  if (Number.isNaN(seedAnchor.getTime())) {
    throw new Error("Demo seed marker contains an invalid timestamp");
  }

  const seedDay = new Date(seedAnchor);
  seedDay.setHours(0, 0, 0, 0);
  const referenceDay = new Date(reference);
  referenceDay.setHours(0, 0, 0, 0);
  const deltaMs = referenceDay.getTime() - seedDay.getTime();

  if (deltaMs !== 0) {
    const customers = await client.customer.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, createdAt: true, blacklistedAt: true },
    });
    for (const row of customers) {
      await client.customer.update({
        where: { id: row.id },
        data: {
          createdAt: shiftDate(row.createdAt, deltaMs)!,
          blacklistedAt: shiftDate(row.blacklistedAt, deltaMs),
        },
      });
    }

    const orders = await client.order.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: {
        id: true,
        createdAt: true,
        confirmedAt: true,
        packedAt: true,
        shippedAt: true,
        deliveredAt: true,
        codCollectedAt: true,
        codRemittedAt: true,
      },
    });
    for (const row of orders) {
      await client.order.update({
        where: { id: row.id },
        data: {
          createdAt: shiftDate(row.createdAt, deltaMs)!,
          confirmedAt: shiftDate(row.confirmedAt, deltaMs),
          packedAt: shiftDate(row.packedAt, deltaMs),
          shippedAt: shiftDate(row.shippedAt, deltaMs),
          deliveredAt: shiftDate(row.deliveredAt, deltaMs),
          codCollectedAt: shiftDate(row.codCollectedAt, deltaMs),
          codRemittedAt: shiftDate(row.codRemittedAt, deltaMs),
        },
      });
    }

    const changes = await client.orderChange.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, createdAt: true, confirmedAt: true },
    });
    for (const row of changes) {
      await client.orderChange.update({
        where: { id: row.id },
        data: {
          createdAt: shiftDate(row.createdAt, deltaMs)!,
          confirmedAt: shiftDate(row.confirmedAt, deltaMs),
        },
      });
    }

    const deliveries = await client.delivery.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, createdAt: true, estimatedDelivery: true },
    });
    for (const row of deliveries) {
      await client.delivery.update({
        where: { id: row.id },
        data: {
          createdAt: shiftDate(row.createdAt, deltaMs)!,
          estimatedDelivery: shiftDate(row.estimatedDelivery, deltaMs),
        },
      });
    }

    const returns = await client.return.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, createdAt: true },
    });
    for (const row of returns) {
      await client.return.update({
        where: { id: row.id },
        data: { createdAt: shiftDate(row.createdAt, deltaMs)! },
      });
    }

    const returnNotes = await client.returnNote.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, createdAt: true },
    });
    for (const row of returnNotes) {
      await client.returnNote.update({
        where: { id: row.id },
        data: { createdAt: shiftDate(row.createdAt, deltaMs)! },
      });
    }

    const refunds = await client.refund.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, createdAt: true, processedAt: true },
    });
    for (const row of refunds) {
      await client.refund.update({
        where: { id: row.id },
        data: {
          createdAt: shiftDate(row.createdAt, deltaMs)!,
          processedAt: shiftDate(row.processedAt, deltaMs),
        },
      });
    }

    const expenses = await client.expense.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, date: true, createdAt: true },
    });
    for (const row of expenses) {
      await client.expense.update({
        where: { id: row.id },
        data: {
          date: shiftDate(row.date, deltaMs)!,
          createdAt: shiftDate(row.createdAt, deltaMs)!,
        },
      });
    }

    const conversations = await client.conversation.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: {
        id: true,
        createdAt: true,
        lastMessageAt: true,
        waitingSince: true,
        firstReplyAt: true,
        snoozedUntil: true,
      },
    });
    for (const row of conversations) {
      await client.conversation.update({
        where: { id: row.id },
        data: {
          createdAt: shiftDate(row.createdAt, deltaMs)!,
          lastMessageAt: shiftDate(row.lastMessageAt, deltaMs),
          waitingSince: shiftDate(row.waitingSince, deltaMs),
          firstReplyAt: shiftDate(row.firstReplyAt, deltaMs),
          snoozedUntil: shiftDate(row.snoozedUntil, deltaMs),
        },
      });
    }

    const messages = await client.message.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, timestamp: true, createdAt: true },
    });
    for (const row of messages) {
      await client.message.update({
        where: { id: row.id },
        data: {
          timestamp: shiftDate(row.timestamp, deltaMs)!,
          createdAt: shiftDate(row.createdAt, deltaMs)!,
        },
      });
    }

    const extractionMetrics = await client.extractionMetric.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, createdAt: true },
    });
    for (const row of extractionMetrics) {
      await client.extractionMetric.update({
        where: { id: row.id },
        data: { createdAt: shiftDate(row.createdAt, deltaMs)! },
      });
    }

    const automations = await client.automation.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, lastRunAt: true },
    });
    for (const row of automations) {
      await client.automation.update({
        where: { id: row.id },
        data: { lastRunAt: shiftDate(row.lastRunAt, deltaMs) },
      });
    }

    const automationLogs = await client.automationLog.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, createdAt: true },
    });
    for (const row of automationLogs) {
      await client.automationLog.update({
        where: { id: row.id },
        data: { createdAt: shiftDate(row.createdAt, deltaMs)! },
      });
    }

    const aiSessions = await client.aiChatSession.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, createdAt: true },
    });
    for (const row of aiSessions) {
      await client.aiChatSession.update({
        where: { id: row.id },
        data: { createdAt: shiftDate(row.createdAt, deltaMs)! },
      });
    }

    const aiMessages = await client.aiChatMessage.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, createdAt: true },
    });
    for (const row of aiMessages) {
      await client.aiChatMessage.update({
        where: { id: row.id },
        data: { createdAt: shiftDate(row.createdAt, deltaMs)! },
      });
    }

    const auditRows = await client.auditLog.findMany({
      where: { id: { startsWith: DEMO_PREFIX } },
      select: { id: true, createdAt: true },
    });
    for (const row of auditRows) {
      await client.auditLog.update({
        where: { id: row.id },
        data: { createdAt: shiftDate(row.createdAt, deltaMs)! },
      });
    }
  }

  await client.setting.update({
    where: { key: DEMO_CREATED_AT_KEY },
    data: { value: reference.toISOString() },
  });
}
