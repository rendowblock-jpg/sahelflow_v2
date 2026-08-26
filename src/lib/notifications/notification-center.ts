import "server-only";

import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  trustedActionAllowed,
  type AuthorizationResource,
} from "@/lib/identity/authorization";
import type { Phase2Action } from "@/lib/identity/permissions";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import { SahelFlowError } from "@/types/errors";
import type {
  NotificationPreferenceInput,
  NotificationQuery,
} from "./contracts";
import { sanitizeNativePreview } from "./preview-safety";

const PROJECTION_BATCH = 500;
const NATIVE_LEASE_MS = 2 * 60_000;
const MAX_NATIVE_RETRIES = 3;
const ALLOWED_EVENT_ACTIONS = new Set<Phase2Action>(["conversations.read"]);

export function notificationRecipientId(context: TrustedActorContext): string {
  if (context.actor.kind !== "person") {
    throw new SahelFlowError(
      "A durable workspace member is required for notifications",
      "NOTIFICATION_MEMBER_REQUIRED",
      403,
    );
  }
  return context.actor.workspaceMemberId;
}

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\0"), "utf8").digest("hex");
}

function parseCategorySettings(raw: string): { inbox: boolean } {
  try {
    const value = JSON.parse(raw) as { inbox?: unknown };
    return { inbox: value.inbox !== false };
  } catch {
    return { inbox: true };
  }
}

export async function getNotificationPreference(
  context: TrustedActorContext,
) {
  const recipientMemberId = notificationRecipientId(context);
  const preference = await db.notificationPreference.findUnique({
    where: { recipientMemberId },
  });
  if (!preference) {
    return {
      inboxEnabled: true,
      nativeEnabled: false,
      soundEnabled: false,
      previewEnabled: false,
      quietStartMinute: null,
      quietEndMinute: null,
      mutedUntil: null,
      retentionDays: 90,
    };
  }
  return {
    inboxEnabled: parseCategorySettings(preference.categorySettings).inbox,
    nativeEnabled: preference.nativeEnabled,
    soundEnabled: preference.soundEnabled,
    previewEnabled: preference.previewEnabled,
    quietStartMinute: preference.quietStartMinute,
    quietEndMinute: preference.quietEndMinute,
    mutedUntil: preference.mutedUntil?.toISOString() ?? null,
    retentionDays: preference.retentionDays,
  };
}

export async function updateNotificationPreference(
  context: TrustedActorContext,
  input: NotificationPreferenceInput,
) {
  const recipientMemberId = notificationRecipientId(context);
  const current = await db.notificationPreference.upsert({
    where: { recipientMemberId },
    create: { recipientMemberId },
    update: {},
  });
  const currentCategories = parseCategorySettings(current.categorySettings);
  await db.notificationPreference.update({
    where: { recipientMemberId },
    data: {
      ...(input.inboxEnabled === undefined
        ? {}
        : {
            categorySettings: JSON.stringify({
              ...currentCategories,
              inbox: input.inboxEnabled,
            }),
          }),
      ...(input.nativeEnabled === undefined
        ? {}
        : { nativeEnabled: input.nativeEnabled }),
      ...(input.soundEnabled === undefined
        ? {}
        : { soundEnabled: input.soundEnabled }),
      ...(input.previewEnabled === undefined
        ? {}
        : { previewEnabled: input.previewEnabled }),
      ...(input.quietStartMinute === undefined
        ? {}
        : { quietStartMinute: input.quietStartMinute }),
      ...(input.quietEndMinute === undefined
        ? {}
        : { quietEndMinute: input.quietEndMinute }),
      ...(input.mutedUntil === undefined
        ? {}
        : {
            mutedUntil:
              input.mutedUntil === null ? null : new Date(input.mutedUntil),
          }),
      ...(input.retentionDays === undefined
        ? {}
        : { retentionDays: input.retentionDays }),
    },
  });
  return getNotificationPreference(context);
}

export async function synchronizeNotifications(
  context: TrustedActorContext,
): Promise<{ projected: number }> {
  const recipientMemberId = notificationRecipientId(context);
  const preference = await db.notificationPreference.findUnique({
    where: { recipientMemberId },
  });
  const now = new Date();
  const retentionFloor = new Date(
    now.getTime() - (preference?.retentionDays ?? 90) * 24 * 60 * 60 * 1_000,
  );

  await db.operationalNotification.deleteMany({
    where: { recipientMemberId, createdAt: { lt: retentionFloor } },
  });

  if (preference && !parseCategorySettings(preference.categorySettings).inbox) {
    return { projected: 0 };
  }
  const resource: AuthorizationResource = { shopId: context.shop.shopId };
  if (!trustedActionAllowed(context, "conversations.read", resource)) {
    return { projected: 0 };
  }
  let projected = 0;

  // A bounded anti-join makes projection recovery independent of event-table
  // size. Repeated reads converge without duplicating per-recipient rows.
  for (;;) {
    const events = await db.notificationEvent.findMany({
      where: {
        category: "inbox",
        requiredAction: "conversations.read",
        occurredAt: { gte: retentionFloor },
        expiresAt: { gt: now },
        notifications: { none: { recipientMemberId } },
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: PROJECTION_BATCH,
    });
    if (events.length === 0) break;

    const eligible = events.filter((event) => {
      if (!ALLOWED_EVENT_ACTIONS.has(event.requiredAction as Phase2Action)) {
        return false;
      }
      return trustedActionAllowed(
        context,
        event.requiredAction as Phase2Action,
        resource,
      );
    });
    if (eligible.length === 0) break;

    await db.$transaction(
      eligible.map((event) => {
        const dedupeKey = `${event.eventKey}:${recipientMemberId}`;
        return db.operationalNotification.upsert({
          where: { dedupeKey },
          create: {
            id: stableId("notification", event.id, recipientMemberId),
            dedupeKey,
            eventId: event.id,
            recipientMemberId,
            category: event.category,
            severity: event.severity,
            titleKey: "notifications.inbox.title",
            bodyKey: "notifications.inbox.body",
            link: event.link,
            createdAt: event.occurredAt,
          },
          update: {},
        });
      }),
    );
    projected += eligible.length;
    if (events.length < PROJECTION_BATCH) break;
  }
  return { projected };
}

type Cursor = { createdAt: Date; id: string };

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { createdAt?: unknown; id?: unknown };
    if (typeof decoded.createdAt !== "string" || typeof decoded.id !== "string") {
      return null;
    }
    const createdAt = new Date(decoded.createdAt);
    if (Number.isNaN(createdAt.getTime()) || decoded.id.length > 128) return null;
    return { createdAt, id: decoded.id };
  } catch {
    return null;
  }
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
    "utf8",
  ).toString("base64url");
}

export async function listNotifications(
  context: TrustedActorContext,
  query: NotificationQuery,
) {
  const recipientMemberId = notificationRecipientId(context);
  const cursor = decodeCursor(query.cursor);
  if (query.cursor && !cursor) {
    throw new SahelFlowError("Notification cursor is invalid", "INVALID_CURSOR", 400);
  }

  const stateWhere: Prisma.OperationalNotificationWhereInput =
    query.state === "archived"
      ? { archivedAt: { not: null } }
      : query.state === "all"
        ? {}
        : query.state === "read"
          ? { archivedAt: null, readAt: { not: null } }
          : query.state === "unread"
            ? { archivedAt: null, readAt: null }
            : { archivedAt: null };
  const cursorWhere: Prisma.OperationalNotificationWhereInput = cursor
    ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : {};
  const where: Prisma.OperationalNotificationWhereInput = {
    recipientMemberId,
    ...stateWhere,
    ...cursorWhere,
    ...(query.category ? { category: query.category } : {}),
    ...(query.severity ? { severity: query.severity } : {}),
  };
  const rows = await db.operationalNotification.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    include: {
      deliveries: {
        where: { channel: "native" },
        orderBy: { attemptedAt: "desc" },
        take: 1,
        select: { state: true },
      },
    },
  });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const unreadCount = await db.operationalNotification.count({
    where: { recipientMemberId, readAt: null, archivedAt: null },
  });
  const preference = await getNotificationPreference(context);

  return {
    notifications: page.map((row) => ({
      id: row.id,
      durable: true,
      type: row.category === "inbox" ? "info" : row.category,
      category: row.category,
      severity: row.severity,
      titleKey: row.titleKey,
      bodyKey: row.bodyKey,
      link: row.link,
      read: row.readAt !== null,
      archived: row.archivedAt !== null,
      createdAt: row.createdAt.toISOString(),
      nativePending:
        preference.nativeEnabled &&
        preference.inboxEnabled &&
        row.readAt === null &&
        row.archivedAt === null &&
        row.deliveries[0]?.state !== "sent" &&
        row.deliveries[0]?.state !== "denied" &&
        row.deliveries[0]?.state !== "suppressed" &&
        row.createdAt.getTime() > Date.now() - 5 * 60_000,
    })),
    unreadCount,
    nextCursor:
      rows.length > query.limit && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null,
    preference,
  };
}

async function ownedNotification(context: TrustedActorContext, id: string) {
  if (!id || id.length > 128) {
    throw new SahelFlowError("Notification not found", "NOT_FOUND", 404);
  }
  const recipientMemberId = notificationRecipientId(context);
  const notification = await db.operationalNotification.findFirst({
    where: { id, recipientMemberId },
    include: { event: true },
  });
  if (!notification) {
    throw new SahelFlowError("Notification not found", "NOT_FOUND", 404);
  }
  if (notification.event.requiredAction === "conversations.read") {
    if (!trustedActionAllowed(context, "conversations.read", { shopId: context.shop.shopId })) {
      throw new SahelFlowError("Notification not found", "NOT_FOUND", 404);
    }
  } else {
    throw new SahelFlowError("Notification authority is unavailable", "NOTIFICATION_AUTHORITY_INVALID", 503);
  }
  return notification;
}

export async function applyNotificationLifecycle(
  context: TrustedActorContext,
  id: string,
  action: "read" | "archive" | "recover",
) {
  const notification = await ownedNotification(context, id);
  const now = new Date();
  return db.operationalNotification.update({
    where: { id: notification.id },
    data:
      action === "read"
        ? { readAt: notification.readAt ?? now }
        : action === "archive"
          ? { archivedAt: notification.archivedAt ?? now, readAt: notification.readAt ?? now }
          : { archivedAt: null, lastRecoveredAt: now },
  });
}

export async function readAllNotifications(context: TrustedActorContext) {
  const recipientMemberId = notificationRecipientId(context);
  const result = await db.operationalNotification.updateMany({
    where: { recipientMemberId, archivedAt: null, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}

function quietReason(
  preference: Readonly<{
    nativeEnabled: boolean;
    mutedUntil: Date | null;
    quietStartMinute: number | null;
    quietEndMinute: number | null;
  }>,
  now: Date,
): "disabled" | "muted" | "quiet-hours" | null {
  if (!preference.nativeEnabled) return "disabled";
  if (preference.mutedUntil && preference.mutedUntil > now) return "muted";
  if (
    preference.quietStartMinute === null ||
    preference.quietEndMinute === null ||
    preference.quietStartMinute === preference.quietEndMinute
  ) {
    return null;
  }
  const minute = now.getHours() * 60 + now.getMinutes();
  const quiet =
    preference.quietStartMinute < preference.quietEndMinute
      ? minute >= preference.quietStartMinute && minute < preference.quietEndMinute
      : minute >= preference.quietStartMinute || minute < preference.quietEndMinute;
  return quiet ? "quiet-hours" : null;
}

export async function claimNativeDelivery(
  context: TrustedActorContext,
  id: string,
) {
  const notification = await ownedNotification(context, id);
  const recipientMemberId = notificationRecipientId(context);
  const preference = await db.notificationPreference.findUniqueOrThrow({
    where: { recipientMemberId },
  });
  const now = new Date();
  const suppressed = quietReason(preference, now);
  const attemptKey = `${notification.id}:native:v1`;
  const existing = await db.notificationDeliveryAttempt.findUnique({
    where: { attemptKey },
  });

  if (suppressed) {
    await db.notificationDeliveryAttempt.upsert({
      where: { attemptKey },
      create: {
        id: stableId("delivery", attemptKey),
        attemptKey,
        notificationId: notification.id,
        channel: "native",
        state: "suppressed",
        reasonCode: suppressed,
        completedAt: now,
      },
      update: { state: "suppressed", reasonCode: suppressed, completedAt: now },
    });
    return { deliver: false, reasonCode: suppressed };
  }
  if (
    existing &&
    (existing.state === "sent" ||
      existing.state === "denied" ||
      existing.state === "suppressed" ||
      existing.retryCount >= MAX_NATIVE_RETRIES ||
      (existing.state === "claimed" &&
        existing.attemptedAt.getTime() > now.getTime() - NATIVE_LEASE_MS) ||
      (existing.nextAttemptAt && existing.nextAttemptAt > now))
  ) {
    return { deliver: false, reasonCode: existing.reasonCode };
  }

  await db.notificationDeliveryAttempt.upsert({
    where: { attemptKey },
    create: {
      id: stableId("delivery", attemptKey),
      attemptKey,
      notificationId: notification.id,
      channel: "native",
      state: "claimed",
    },
    update: {
      state: "claimed",
      reasonCode: null,
      attemptedAt: now,
      completedAt: null,
      nextAttemptAt: null,
      retryCount: { increment: 1 },
    },
  });

  let preview: { contactName: string; body: string } | null = null;
  if (
    preference.previewEnabled &&
    trustedActionAllowed(context, "customers.contact.read", { shopId: context.shop.shopId })
  ) {
    const message = await db.message.findUnique({
      where: { id: notification.event.sourceRecordId },
      select: { body: true, conversation: { select: { contactName: true } } },
    });
    if (message) {
      preview = sanitizeNativePreview(
        message.conversation.contactName,
        message.body,
      );
    }
  }
  return {
    deliver: true,
    preview,
    soundEnabled: preference.soundEnabled,
    link: notification.link,
  };
}

export async function completeNativeDelivery(
  context: TrustedActorContext,
  id: string,
  state: "sent" | "denied" | "failed" | "suppressed",
  reasonCode: string | null,
) {
  const notification = await ownedNotification(context, id);
  const attemptKey = `${notification.id}:native:v1`;
  const attempt = await db.notificationDeliveryAttempt.findUnique({ where: { attemptKey } });
  if (!attempt || attempt.state !== "claimed") {
    throw new SahelFlowError("Native notification claim is unavailable", "NOTIFICATION_DELIVERY_CLAIM_REQUIRED", 409);
  }
  const nextAttemptAt =
    state === "failed" && attempt.retryCount < MAX_NATIVE_RETRIES
      ? new Date(Date.now() + Math.min(60_000 * 2 ** attempt.retryCount, 15 * 60_000))
      : null;
  await db.notificationDeliveryAttempt.update({
    where: { attemptKey },
    data: { state, reasonCode, completedAt: new Date(), nextAttemptAt },
  });
  return { state, nextAttemptAt: nextAttemptAt?.toISOString() ?? null };
}
