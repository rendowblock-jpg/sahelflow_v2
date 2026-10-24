import "server-only";

import { randomUUID } from "node:crypto";

import type { AutomationMutation, AutomationStepDefinition } from "@/lib/automations/contracts";
import { isAutomationCreateKey } from "@/lib/automations/create-key";
import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import type { BusinessCommandResult } from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { ValidationError } from "@/types/errors";

export type CanonicalAutomationInput = AutomationMutation & { steps: AutomationStepDefinition[] };

export type AutomationCreateResult = Readonly<{ automationId: string }>;

/** The row written for a new definition; the keyed and the key-less create share it so they cannot drift apart. */
export function automationCreateData(input: CanonicalAutomationInput) {
  return {
    name: input.name,
    trigger: input.trigger,
    action: input.action,
    isActive: input.isActive,
    dryRun: input.dryRun,
    conditions: input.conditions ? JSON.stringify(input.conditions) : null,
    steps: JSON.stringify(input.steps),
    config: JSON.stringify(input.steps[0]!.config),
    maxRetries: input.maxRetries,
    retryDelayMs: input.retryDelayMs,
    retryCount: 0,
    lastError: null,
    nextRunAt: null,
    runCount: 0,
  };
}

/**
 * Take the optional idempotencyKey out of a create body before the strict definition schema sees it. A body without the field is
 * returned untouched, so the key-less request is judged exactly as before.
 */
export function splitAutomationCreateKey(raw: unknown): { body: unknown; idempotencyKey: string | undefined } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) || !Object.hasOwn(raw, "idempotencyKey")) {
    return { body: raw, idempotencyKey: undefined };
  }
  const { idempotencyKey, ...body } = raw as Record<string, unknown>;
  if (!isAutomationCreateKey(idempotencyKey)) {
    throw new ValidationError("idempotencyKey must be a UUID", "idempotencyKey");
  }
  return { body, idempotencyKey: idempotencyKey.toLowerCase() };
}

/**
 * automation.create.v1: create one definition and its audit entry in the kernel transaction. The same key with the same content
 * replays the first automation; the same key with other content is refused by the kernel.
 */
export async function createAutomationOnce(
  context: BusinessPrincipalContext,
  idempotencyKey: string,
  input: CanonicalAutomationInput,
): Promise<BusinessCommandResult<AutomationCreateResult>> {
  return executeBusinessCommand(
    context,
    {
      idempotencyKey,
      commandType: "automation.create.v1",
      aggregate: { type: "automation-create-intake", id: `create:${idempotencyKey}`, expectedVersion: 0 },
      actor: "authenticated-owner",
      correlationId: randomUUID(),
      payload: input,
    },
    async ({ tx }) => {
      const automation = await tx.automation.create({ data: automationCreateData(input) });
      const result: AutomationCreateResult = Object.freeze({ automationId: automation.id });
      return {
        result,
        audit: {
          action: "automation.created",
          entity: "automation",
          entityId: automation.id,
          after: {
            name: automation.name,
            trigger: automation.trigger,
            action: automation.action,
            isActive: automation.isActive,
            dryRun: automation.dryRun,
          },
        },
        events: [
          {
            key: `${automation.id}:created`,
            type: "automation.created",
            payload: { automationId: automation.id, trigger: automation.trigger, action: automation.action },
            occurredAt: automation.createdAt,
          },
        ],
      };
    },
  );
}
