// Shapes the phone and the store must obey. Zod, no other dependency.
import { z } from "zod";

import { PUSH_KINDS } from "./payload";
import { MAX_ENDPOINT_LENGTH, isAllowedPushEndpoint } from "./ssrf";
import { base64urlDecode } from "./util";

const endpoint = z
  .string()
  .max(MAX_ENDPOINT_LENGTH)
  .refine(isAllowedPushEndpoint, "endpoint is not an allowed push service address");

const p256dh = z.string().refine((value) => {
  const bytes = base64urlDecode(value);
  return bytes !== null && bytes.length === 65 && bytes[0] === 4;
}, "p256dh must be a 65-byte uncompressed P-256 point in base64url");

const auth = z
  .string()
  .refine((value) => base64urlDecode(value)?.length === 16, "auth must be 16 bytes in base64url");

const locale = z
  .string()
  .min(2)
  .max(35)
  .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/);

/** command.push.subscribe, sent by a paired phone. */
export const subscribeCommandSchema = z.strictObject({
  v: z.literal(1),
  endpoint,
  p256dh,
  auth,
  locale,
  deviceLabel: z.string().min(1).max(80).optional(),
});

/** command.push.unsubscribe. */
export const unsubscribeCommandSchema = z.strictObject({
  v: z.literal(1),
  endpointHash: z.string().regex(/^[0-9a-f]{12}$/),
});

/** What the store accepts to write. */
export const subscriptionRecordSchema = z.strictObject({
  deviceId: z.string().min(1).max(200),
  endpoint,
  p256dh,
  auth,
  createdAt: z.number().int().nonnegative(),
  lastOkAt: z.number().int().nonnegative().nullable(),
  failCount: z.number().int().nonnegative(),
  kinds: z
    .array(z.enum(PUSH_KINDS))
    .refine((kinds) => new Set(kinds).size === kinds.length, "kinds must be unique"),
});

export type SubscribeCommand = z.infer<typeof subscribeCommandSchema>;
export type UnsubscribeCommand = z.infer<typeof unsubscribeCommandSchema>;
