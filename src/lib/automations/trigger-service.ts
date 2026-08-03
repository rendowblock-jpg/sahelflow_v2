import "server-only";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import { systemBusinessPrincipal } from "@/lib/business-truth/principal";
import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError } from "@/types/errors";
import {
  AUTOMATION_TRIGGER_EFFECT_TYPE,
  automationHash,
  automationTriggerSchema,
  canonicalJson,
  parseAutomationTriggerPayload,
  type AutomationTrigger,
  type AutomationTriggerEnvelope,
  type AutomationTriggerPayload,
} from "./contracts";

export interface AutomationTriggerOptions {
  triggerKey?: string;
  occurredAt?: Date;
}

export interface QueuedAutomationTrigger {
  effectKey: string;
  triggerKey: string;
  replayed: boolean;
}

function normalizeTriggerKey(
  trigger: AutomationTrigger,
  payload: AutomationTriggerPayload,
  requested?: string,
): string {
  const value = requested?.trim();
  if (value) {
    if (value.length > 500) {
      throw new SahelFlowError(
        "Automation trigger key exceeds the bounded length",
        "AUTOMATION_TRIGGER_KEY_INVALID",
        400,
      );
    }
    return value;
  }
  return `${trigger}:${automationHash(payload)}`;
}

function triggerScope(context: ServiceContext): readonly string[] {
  if (context.shop) {
    return [
      context.shop.workspaceId,
      context.shop.installationId,
      context.shop.shopId,
      context.shop.shopIncarnationId,
    ];
  }
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return ["test", process.env.DATABASE_URL ?? "disposable-test-database"];
  }
  throw new SahelFlowError(
    "Automation triggers require an exact trusted ShopContext",
    "AUTOMATION_SHOP_AUTHORITY_REQUIRED",
    500,
  );
}

export async function enqueueAutomationTrigger(
  context: ServiceContext,
  rawTrigger: AutomationTrigger,
  rawPayload: unknown,
  options: AutomationTriggerOptions = {},
): Promise<QueuedAutomationTrigger> {
  const trigger = automationTriggerSchema.parse(rawTrigger);
  const payload = parseAutomationTriggerPayload(trigger, rawPayload);
  const payloadHash = automationHash(payload);
  const triggerKey = normalizeTriggerKey(trigger, payload, options.triggerKey);
  const effectKey = `automation-trigger:${automationHash([
    trigger,
    triggerKey,
    ...triggerScope(context),
  ])}`;
  const envelope: AutomationTriggerEnvelope = {
    trigger,
    triggerKey,
    occurredAt: (options.occurredAt ?? new Date()).toISOString(),
    payload,
  };
  const commandContext = {
    ...context,
    businessPrincipal: systemBusinessPrincipal("automation-worker"),
  };
  const execution = await executeBusinessCommand(
    commandContext,
    {
      idempotencyKey: effectKey,
      commandType: "automation_trigger.queue.v1",
      aggregate: {
        type: "automation-trigger",
        id: automationHash([trigger, triggerKey]),
        expectedVersion: 0,
      },
      actor: commandContext.businessPrincipal.auditActor,
      correlationId: triggerKey,
      // Event time is first-write metadata. The idempotency request binds the
      // stable event identity and content hash so exact retry cannot conflict
      // merely because the local clock advanced before the response replay.
      payload: { trigger, triggerKey, payloadHash },
    },
    async () => ({
      result: { effectKey, triggerKey },
      audit: {
        action: "automation.trigger.queued",
        entity: "automation-trigger",
        entityId: effectKey,
        after: { trigger },
        metadata: { triggerKey, payloadHash },
      },
      events: [
        {
          key: `${effectKey}:queued`,
          type: "automation.trigger.queued.v1",
          payload: {
            effectKey,
            trigger,
            triggerKey,
            occurredAt: envelope.occurredAt,
          },
        },
      ],
      outbox: [
        {
          effectKey,
          effectType: AUTOMATION_TRIGGER_EFFECT_TYPE,
          payload: envelope,
        },
      ],
    }),
  );
  canonicalJson(envelope);
  return {
    effectKey: execution.result.effectKey,
    triggerKey: execution.result.triggerKey,
    replayed: execution.replayed,
  };
}
