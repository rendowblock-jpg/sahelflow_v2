import { z } from "zod";

export const WHATSAPP_MEDIA_FETCH_EFFECT_TYPE = "whatsapp.media.fetch.v1";

export const whatsAppMediaFetchPayloadSchema = z.object({
  messageId: z.string().uuid(),
  ingressEventId: z.string().uuid(),
});

export type WhatsAppMediaFetchPayload = z.infer<
  typeof whatsAppMediaFetchPayloadSchema
>;
