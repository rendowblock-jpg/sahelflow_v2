import "server-only";

import { SahelFlowError } from "@/types/errors";
import {
  actionAllowedForTrigger,
  getSellerStatusTargets,
  getSellerTriggerSpec,
  unsupportedTemplateVariablesForTrigger,
  type SellerConditionOperator,
  type SellerOrderStatusTarget,
} from "./catalog";
import type {
  AutomationMutation,
  AutomationStepDefinition,
} from "./contracts";

type CanonicalSellerWrite = AutomationMutation & {
  steps: AutomationStepDefinition[];
};

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
 * whose required payload is absent from its trigger, an unreachable governed
 * order transition, a condition field that the selected trigger does not carry,
 * or a template token that would render blank.
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

    if (step.action === "update_status") {
      const target = step.config.targetStatus as SellerOrderStatusTarget;
      const allowedTargets = getSellerStatusTargets(definition.trigger);
      if (!allowedTargets.includes(target)) {
        policyError(
          `Order status '${target}' is not reachable from trigger '${definition.trigger}'`,
          "AUTOMATION_SELLER_STATUS_TARGET_UNREACHABLE",
        );
      }
    }

    const template = stepTemplate(step);
    if (template) {
      const unsupported = unsupportedTemplateVariablesForTrigger(
        definition.trigger,
        template,
      );
      if (unsupported.length > 0) {
        policyError(
          `Template variable '${unsupported[0]}' is not available on trigger '${definition.trigger}'`,
          "AUTOMATION_SELLER_TEMPLATE_VARIABLE_UNAVAILABLE",
        );
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
