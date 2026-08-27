import "server-only";

import {
  queueWhatsAppImage as queueWhatsAppImageDurably,
  type QueueWhatsAppImageInput,
} from "./durable-send";
import { withWhatsAppMediaLifecycleLease } from "./media-lifecycle-authority";
import { whatsAppMediaRoot } from "./media-object-store";

type QueueWhatsAppImageContext = Parameters<
  typeof queueWhatsAppImageDurably
>[0];

/**
 * Production authority for outbound image staging + canonical durable commit.
 *
 * Hold the exact shop media lifecycle lease from before encrypted staging until
 * the Message/outbox command commits. Provider dispatch happens later, outside
 * this lease, through the ordinary durable outbox worker.
 */
export async function queueWhatsAppImage(
  context: QueueWhatsAppImageContext,
  input: QueueWhatsAppImageInput,
): ReturnType<typeof queueWhatsAppImageDurably> {
  return withWhatsAppMediaLifecycleLease(
    whatsAppMediaRoot(context),
    () => queueWhatsAppImageDurably(context, input),
  );
}
