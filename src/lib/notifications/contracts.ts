import { z } from "zod";

export const notificationStateSchema = z.enum([
  "active",
  "unread",
  "read",
  "archived",
  "all",
]);

export const notificationQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  category: z.enum(["inbox"]).optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  state: notificationStateSchema.default("active"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const notificationLifecycleSchema = z
  .object({ action: z.enum(["read", "archive", "recover"]) })
  .strict();

export const notificationPreferenceSchema = z
  .object({
    inboxEnabled: z.boolean().optional(),
    nativeEnabled: z.boolean().optional(),
    soundEnabled: z.boolean().optional(),
    previewEnabled: z.boolean().optional(),
    quietStartMinute: z.number().int().min(0).max(1439).nullable().optional(),
    quietEndMinute: z.number().int().min(0).max(1439).nullable().optional(),
    mutedUntil: z.string().datetime().nullable().optional(),
    retentionDays: z.number().int().min(30).max(365).optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.quietStartMinute === undefined &&
        value.quietEndMinute === undefined) ||
      (value.quietStartMinute === null && value.quietEndMinute === null) ||
      (typeof value.quietStartMinute === "number" &&
        typeof value.quietEndMinute === "number"),
    { message: "Quiet hours require both start and end minutes" },
  );

export const nativeDeliverySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }).strict(),
  z
    .object({
      action: z.literal("complete"),
      state: z.enum(["sent", "denied", "failed", "suppressed"]),
      reasonCode: z
        .enum([
          "permission-denied",
          "plugin-unavailable",
          "native-send-failed",
          "foreground",
          "quiet-hours",
          "muted",
          "disabled",
        ])
        .nullable()
        .default(null),
    })
    .strict(),
]);

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
export type NotificationPreferenceInput = z.infer<
  typeof notificationPreferenceSchema
>;
