import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

export const AUTOMATION_TRIGGER_EFFECT_TYPE = "automation.trigger.v1";

export const AUTOMATION_TRIGGERS = [
  "order.created",
  "order.confirmed",
  "order.shipped",
  "order.delivered",
  "order.returned",
  "order.refused",
  "order.cancelled",
  "customer.blacklisted",
  "message.received",
  "stock.low",
] as const;
export const automationTriggerSchema = z.enum(AUTOMATION_TRIGGERS);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

export const AUTOMATION_ACTIONS = [
  "send_whatsapp",
  "send_notification",
  "tag_customer",
  "update_status",
] as const;
export const automationActionSchema = z.enum(AUTOMATION_ACTIONS);
export type AutomationAction = z.infer<typeof automationActionSchema>;

export const automationFailurePolicySchema = z.enum(["stop", "continue"]);
export type AutomationFailurePolicy = z.infer<
  typeof automationFailurePolicySchema
>;

const conditionOperatorSchema = z.enum([
  "equal",
  "not_equal",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "less_than",
  "greater_than_or_equal",
  "less_than_or_equal",
  "in",
  "not_in",
  "is_empty",
  "is_not_empty",
]);

const conditionValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.array(z.union([z.string().max(200), z.number().finite(), z.boolean()])).max(50),
  z.null(),
]);

export const automationConditionSchema = z
  .object({
    field: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
    operator: conditionOperatorSchema,
    value: conditionValueSchema.optional().default(null),
  })
  .strict();

export const automationConditionGroupSchema = z
  .union([
    z.object({ all: z.array(automationConditionSchema).min(1).max(20) }).strict(),
    z.object({ any: z.array(automationConditionSchema).min(1).max(20) }).strict(),
  ])
  .nullable();

const sendWhatsAppConfigSchema = z
  .object({ messageTemplate: z.string().trim().min(1).max(4000) })
  .strict();
const sendNotificationConfigSchema = z
  .object({ messageTemplate: z.string().trim().min(1).max(1000) })
  .strict();
const tagCustomerConfigSchema = z
  .object({ noteText: z.string().trim().min(1).max(500) })
  .strict();
const updateStatusConfigSchema = z
  .object({
    targetStatus: z.enum([
      "shipped",
      "delivered",
      "returned",
      "refused",
      "cancelled",
    ]),
  })
  .strict();

export const automationStepSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("send_whatsapp"),
      onFailure: automationFailurePolicySchema,
      config: sendWhatsAppConfigSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("send_notification"),
      onFailure: automationFailurePolicySchema,
      config: sendNotificationConfigSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("tag_customer"),
      onFailure: automationFailurePolicySchema,
      config: tagCustomerConfigSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update_status"),
      onFailure: automationFailurePolicySchema,
      config: updateStatusConfigSchema,
    })
    .strict(),
]);
export type AutomationStepDefinition = z.infer<typeof automationStepSchema>;

export const automationStepsSchema = z
  .array(automationStepSchema)
  .min(1)
  .max(20);

export const automationMutationSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    trigger: automationTriggerSchema,
    action: automationActionSchema,
    isActive: z.boolean().default(true),
    dryRun: z.boolean().default(false),
    conditions: automationConditionGroupSchema.optional().default(null),
    steps: automationStepsSchema.optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    maxRetries: z.number().int().min(0).max(8).default(2),
    retryDelayMs: z.number().int().min(100).max(300_000).default(500),
  })
  .strict();
export type AutomationMutation = z.infer<typeof automationMutationSchema>;

export interface StoredAutomationDefinitionRow {
  id: string;
  name: string;
  trigger: string;
  action: string;
  config: string | null;
  conditions?: string | null;
  steps?: string | null;
  isActive: boolean;
  dryRun?: boolean | null;
  maxRetries?: number | null;
  retryDelayMs?: number | null;
  updatedAt?: Date | null;
}

export interface CanonicalAutomationDefinition {
  automationId: string;
  name: string;
  trigger: AutomationTrigger;
  isActive: boolean;
  dryRun: boolean;
  maxRetries: number;
  retryDelayMs: number;
  conditions: z.infer<typeof automationConditionGroupSchema>;
  steps: AutomationStepDefinition[];
  updatedAt: string | null;
}

function parseJson(value: string | null | undefined): unknown {
  if (!value) return undefined;
  return JSON.parse(value) as unknown;
}

function singleStep(
  action: AutomationAction,
  rawConfig: unknown,
): AutomationStepDefinition {
  return automationStepSchema.parse({
    action,
    onFailure: "stop",
    config: rawConfig ?? {},
  });
}

function firstStep(steps: AutomationStepDefinition[]): AutomationStepDefinition {
  const first = steps[0];
  if (!first) throw new Error("Automation definition requires at least one step");
  return first;
}

export function canonicalizeAutomationMutation(
  rawInput: unknown,
): AutomationMutation & { steps: AutomationStepDefinition[] } {
  const input = automationMutationSchema.parse(rawInput);
  const steps = input.steps ?? [singleStep(input.action, input.config)];
  const first = firstStep(steps);
  return {
    ...input,
    action: first.action,
    config: first.config,
    steps,
  };
}

export function parseStoredAutomationDefinition(
  row: StoredAutomationDefinitionRow,
): CanonicalAutomationDefinition {
  const trigger = automationTriggerSchema.parse(row.trigger);
  const action = automationActionSchema.parse(row.action);
  const rawSteps = parseJson(row.steps);
  const steps = rawSteps === undefined
    ? [singleStep(action, parseJson(row.config))]
    : automationStepsSchema.parse(rawSteps);
  const conditions = automationConditionGroupSchema.parse(
    parseJson(row.conditions) ?? null,
  );
  return {
    automationId: row.id,
    name: z.string().trim().min(1).max(120).parse(row.name),
    trigger,
    isActive: row.isActive,
    dryRun: row.dryRun === true,
    maxRetries: z.number().int().min(0).max(8).parse(row.maxRetries ?? 2),
    retryDelayMs: z
      .number()
      .int()
      .min(100)
      .max(300_000)
      .parse(row.retryDelayMs ?? 500),
    conditions,
    steps,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

const orderPayloadSchema = z
  .object({
    orderId: z.string().min(1).max(200),
    orderNumber: z.string().min(1).max(200),
    customerId: z.string().min(1).max(200),
    customerName: z.string().max(500).optional(),
    customerPhone: z.string().max(100).optional(),
    totalPrice: z.number().int().optional(),
    wilaya: z.string().max(200).optional(),
  })
  .passthrough();
const customerPayloadSchema = z
  .object({
    customerId: z.string().min(1).max(200),
    customerName: z.string().max(500).optional(),
    customerPhone: z.string().max(100).optional(),
  })
  .passthrough();
const messagePayloadSchema = z
  .object({
    messageId: z.string().min(1).max(200),
    conversationId: z.string().min(1).max(200),
    customerName: z.string().max(500).optional(),
    customerPhone: z.string().max(100).nullable().optional(),
    messageText: z.string().max(10_000).optional(),
  })
  .passthrough();
const stockPayloadSchema = z
  .object({
    productId: z.string().min(1).max(200),
    productName: z.string().min(1).max(500),
    stockLevel: z.number().int(),
  })
  .passthrough();

export type AutomationTriggerPayload = Record<string, unknown>;

export function parseAutomationTriggerPayload(
  trigger: AutomationTrigger,
  payload: unknown,
): AutomationTriggerPayload {
  const parsed = trigger.startsWith("order.")
    ? orderPayloadSchema.parse(payload)
    : trigger === "customer.blacklisted"
      ? customerPayloadSchema.parse(payload)
      : trigger === "message.received"
        ? messagePayloadSchema.parse(payload)
        : stockPayloadSchema.parse(payload);
  const encoded = JSON.stringify(parsed);
  if (encoded.length > 64_000) {
    throw new Error("Automation trigger payload exceeds the bounded size limit");
  }
  return parsed;
}

export const automationTriggerEnvelopeSchema = z
  .object({
    trigger: automationTriggerSchema,
    triggerKey: z.string().trim().min(1).max(500),
    occurredAt: z.string().datetime({ offset: true }),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export type AutomationTriggerEnvelope = z.infer<
  typeof automationTriggerEnvelopeSchema
>;

export function canonicalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite canonical number");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  throw new Error(`Unsupported canonical value: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function automationHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function definitionHash(
  definition: CanonicalAutomationDefinition,
): string {
  return automationHash(definition);
}

export function normalizeStoredTriggerPayload(
  effectKey: string,
  raw: unknown,
): AutomationTriggerEnvelope {
  const object = z.record(z.string(), z.unknown()).parse(raw);
  const trigger = automationTriggerSchema.parse(object.trigger);
  if (
    object.payload &&
    typeof object.payload === "object" &&
    !Array.isArray(object.payload)
  ) {
    return automationTriggerEnvelopeSchema.parse({
      trigger,
      triggerKey:
        typeof object.triggerKey === "string" ? object.triggerKey : effectKey,
      occurredAt:
        typeof object.occurredAt === "string"
          ? object.occurredAt
          : new Date().toISOString(),
      payload: parseAutomationTriggerPayload(trigger, object.payload),
    });
  }
  const { trigger: _trigger, triggerKey, occurredAt, ...legacyPayload } = object;
  return automationTriggerEnvelopeSchema.parse({
    trigger,
    triggerKey: typeof triggerKey === "string" ? triggerKey : effectKey,
    occurredAt:
      typeof occurredAt === "string" ? occurredAt : new Date().toISOString(),
    payload: parseAutomationTriggerPayload(trigger, legacyPayload),
  });
}

export function renderAutomationTemplate(
  template: string,
  payload: AutomationTriggerPayload,
): string {
  return template.replace(
    /\{\{([A-Za-z0-9_.-]+)\}\}/g,
    (_match, path: string) => {
      let current: unknown = payload;
      for (const part of path.split(".")) {
        if (!current || typeof current !== "object") return "";
        current = (current as Record<string, unknown>)[part];
      }
      return current === null || current === undefined ? "" : String(current);
    },
  );
}
