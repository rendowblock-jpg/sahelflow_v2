import type { Prisma } from "@prisma/client";

import {
  trustedActionAllowed,
  type AuthorizationResource,
} from "@/lib/identity/authorization";
import type { Phase2Action } from "@/lib/identity/permissions";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import {
  KIND_SPECS,
  NOTIFICATION_KINDS,
  kindOfEventType,
  type NotificationAction,
} from "./event-kinds";

/** The permissions an alert kind may be stored under. */
export const CENTRE_ACTIONS: readonly NotificationAction[] = [
  "conversations.read",
  "orders.read",
  "settings.read",
];

/** Event types of the kinds whose second permission this actor does not hold. */
export function eventTypesBlockedFor(
  context: TrustedActorContext,
  resource: AuthorizationResource,
): string[] {
  const blocked: string[] = [];
  for (const kind of NOTIFICATION_KINDS) {
    const spec = KIND_SPECS[kind];
    if (spec.alsoRequires && !trustedActionAllowed(context, spec.alsoRequires, resource)) {
      blocked.push(spec.eventType);
    }
  }
  return blocked;
}

/** True when the actor holds every permission this stored event needs, now. */
export function eventAllowedFor(
  context: TrustedActorContext,
  event: { requiredAction: string; eventType: string },
  resource: AuthorizationResource,
): boolean {
  if (!CENTRE_ACTIONS.includes(event.requiredAction as NotificationAction)) return false;
  if (!trustedActionAllowed(context, event.requiredAction as Phase2Action, resource)) return false;
  const kind = kindOfEventType(event.eventType);
  const extra = kind ? KIND_SPECS[kind].alsoRequires : undefined;
  return !extra || trustedActionAllowed(context, extra, resource);
}

/**
 * Filter for the events this actor may see right now. Rows were checked when
 * they were copied to the member; checking again when they are read means a
 * permission taken away later also hides what was already copied.
 */
export function visibleEventFilter(
  context: TrustedActorContext,
  resource: AuthorizationResource,
): Prisma.NotificationEventWhereInput {
  const actions = CENTRE_ACTIONS.filter((action) =>
    trustedActionAllowed(context, action, resource),
  );
  const blocked = eventTypesBlockedFor(context, resource);
  return {
    requiredAction: { in: [...actions] },
    ...(blocked.length > 0 ? { eventType: { notIn: blocked } } : {}),
  };
}
