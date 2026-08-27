import "server-only";

import {
  queueWhatsAppDocument as queueWhatsAppDocumentDurably,
  type QueueWhatsAppDocumentInput,
} from "./durable-send";
import { withWhatsAppMediaLifecycleLease } from "./media-lifecycle-authority";
import { whatsAppMediaRoot } from "./media-object-store";

type QueueWhatsAppDocumentContext = Parameters<
  typeof queueWhatsAppDocumentDurably
>[0];

/**
 * Production authority for outbound document validation, encrypted staging and
 * canonical durable commit. Provider dispatch remains outside this exact shop
 * lifecycle lease and is owned by the ordinary durable outbox worker.
 */
export async function queueWhatsAppDocument(
  context: QueueWhatsAppDocumentContext,
  input: QueueWhatsAppDocumentInput,
): ReturnType<typeof queueWhatsAppDocumentDurably> {
  return withWhatsAppMediaLifecycleLease(
    whatsAppMediaRoot(context),
    () => queueWhatsAppDocumentDurably(context, input),
  );
}
