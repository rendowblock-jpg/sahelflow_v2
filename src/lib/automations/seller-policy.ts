import "server-only";

import { SahelFlowError } from "@/types/errors";
import {
  actionAllowedForTrigger,
  getSellerTriggerSpec,
  type SellerConditionOperator,
} from "./catalog";
import type {
  AutomationMutation,
  AutomationStepDefinition,
} from "./contracts";

type CanonicalSellerWrite = AutomationMutation & {
  steps: AutomationStepDefinition[];
};

const TEMPLATE_TOKEN_PATTERN = /\{\{([A-Za-z0-9_.-]+)\}\}/g;

function policyError(message: string, code: string): never {
  throw new SahelFlowError(message, code, 400);
}

function stepTemplate(step: AutomationStepDefinition): string | null {
  switch (step.action) {
    case "send_whatsapp":
    case "send_notification":
      return step.config.messageTemplate;
    case "tag_customer":
      return step.config.noteText;
    case "update_status":
      return null;
  }
}

/**
 * Enforce the same seller-facing compatibility contract at the trusted write
 * boundary. The durable runtime intentionally remains capable of reading
 * historical definitions; new/edited definitions must not introduce an action
 * whose required payload is absent from its trigger, a condition field that the
 * selected trigger does not carry, or a template token that would render blank.
 */
export function assertSellerAutomationWritePolicy(
  definition: CanonicalSellerWrite,
): void {
  const trigger = getSellerTriggerSpec(definition.trigger);
  if (!trigger || !trigger.sellerReady) {
    policyError(
      "The selected automation trigger is not available for new seller workflows",
      "AUTOMATION_SELLER_TRIGGER_UNAVAILABLE",
    );
  }

  for (const step of definition.steps) {
    if (!actionAllowedForTrigger(definition.trigger, step.action)) {
      policyError(
        `Automation action '${step.action}' is not compatible with trigger '${definition.trigger}'`,
        "AUTOMATION_SELLER_ACTION_INCOMPATIBLE",
      );
    }

    const template = stepTemplate(step);
    if (template) {
      for (const match of template.matchAll(TEMPLATE_TOKEN_PATTERN)) {
        const token = match[1];
        if (token && !trigger.variables.includes(token)) {
          policyError(
            `Template variable '${token}' is not available on trigger '${definition.trigger}'`,
            "AUTOMATION_SELLER_TEMPLATE_VARIABLE_UNAVAILABLE",
          );
        }
      }
    }
  }

  if (!definition.conditions) return;
  const conditions =
    "all" in definition.conditions
      ? definition.conditions.all
      : definition.conditions.any;

  for (const condition of conditions) {
    const field = trigger.fields.find(
      (candidate) => candidate.value === condition.field,
    );
    if (!field) {
      policyError(
        `Condition field '${condition.field}' is not available on trigger '${definition.trigger}'`,
        "AUTOMATION_SELLER_CONDITION_FIELD_UNAVAILABLE",
      );
    }
    if (
      !field.operators.includes(
        condition.operator as SellerConditionOperator,
      )
    ) {
      policyError(
        `Condition operator '${condition.operator}' is not valid for field '${condition.field}'`,
        "AUTOMATION_SELLER_CONDITION_OPERATOR_INVALID",
      );
    }
  }
}
