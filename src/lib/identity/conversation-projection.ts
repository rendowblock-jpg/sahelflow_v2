import "server-only";

import { trustedActionAllowed } from "./authorization";
import {
  resolvePhase2Permissions,
  type Phase2Action,
} from "./permissions";
import type { TrustedActorContext } from "./trusted-actor";

type ConversationContactFields = Readonly<{
  contactName: string | null;
  contactPhone: string | null;
  sourceId?: string | null;
  /** Storage-only protected composer state; projected only by the draft API. */
  draftBody?: string | null;
  /** Storage-only composer ordering state; projected only by the draft API. */
  draftRevision?: number;
}>;

type ProjectedConversationContactFields = Omit<
  ConversationContactFields,
  "draftBody" | "draftRevision"
>;

export type ConversationFieldAccess = Readonly<{
  contact: boolean;
}>;

export function projectTrustedActorActions(
  actorContext: TrustedActorContext,
): readonly Phase2Action[] {
  if (actorContext.actor.kind !== "person") return [];
  return actorContext.actor.permissions ??
    resolvePhase2Permissions(actorContext.actor.role, null);
}

/**
 * Project contact identity at the server boundary. Conversation/message access
 * never implies access to customer phone, display name, or provider JID.
 */
export function projectConversationForTrustedActor<
  T extends ConversationContactFields,
>(
  conversation: T,
  actorContext: TrustedActorContext,
): Omit<
  T,
  "contactName" | "contactPhone" | "sourceId" | "draftBody" | "draftRevision"
> &
  ProjectedConversationContactFields &
  Readonly<{ fieldAccess: ConversationFieldAccess }> {
  const contact = trustedActionAllowed(
    actorContext,
    "customers.contact.read",
    { shopId: actorContext.shop.shopId },
  );
  const {
    contactName,
    contactPhone,
    sourceId,
    draftBody: _draftBody,
    draftRevision: _draftRevision,
    ...rest
  } = conversation;
  return {
    ...rest,
    contactName: contact ? contactName : null,
    contactPhone: contact ? contactPhone : null,
    ...(sourceId !== undefined
      ? { sourceId: contact ? sourceId : null }
      : {}),
    fieldAccess: { contact },
  };
}
