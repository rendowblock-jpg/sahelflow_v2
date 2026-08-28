import "server-only";

import {
  queueWhatsAppVoice as queueWhatsAppVoiceDurably,
  type QueueWhatsAppVoiceInput,
} from "./durable-send";
import { withWhatsAppMediaLifecycleLease } from "./media-lifecycle-authority";
import { whatsAppMediaRoot } from "./media-object-store";

type QueueWhatsAppVoiceContext = Parameters<
  typeof queueWhatsAppVoiceDurably
>[0];

/**
 * Production authority for outbound voice validation, authenticated metadata,
 * encrypted staging and canonical durable commit. Provider dispatch remains
 * outside this exact shop lifecycle lease and is owned by the ordinary
 * durable outbox worker.
 */
export async function queueWhatsAppVoice(
  context: QueueWhatsAppVoiceContext,
  input: QueueWhatsAppVoiceInput,
): ReturnType<typeof queueWhatsAppVoiceDurably> {
  return withWhatsAppMediaLifecycleLease(
    whatsAppMediaRoot(context),
    () => queueWhatsAppVoiceDurably(context, input),
  );
}
