import "server-only";

import {
  queueWhatsAppVideo as queueWhatsAppVideoDurably,
  type QueueWhatsAppVideoInput,
} from "./durable-send";
import { withWhatsAppMediaLifecycleLease } from "./media-lifecycle-authority";
import { whatsAppMediaRoot } from "./media-object-store";

type QueueWhatsAppVideoContext = Parameters<
  typeof queueWhatsAppVideoDurably
>[0];

/**
 * Production authority for outbound video validation, encrypted staging and
 * canonical durable commit. Provider dispatch remains outside this exact shop
 * lifecycle lease and is owned by the ordinary durable outbox worker.
 */
export async function queueWhatsAppVideo(
  context: QueueWhatsAppVideoContext,
  input: QueueWhatsAppVideoInput,
): ReturnType<typeof queueWhatsAppVideoDurably> {
  return withWhatsAppMediaLifecycleLease(
    whatsAppMediaRoot(context),
    () => queueWhatsAppVideoDurably(context, input),
  );
}
