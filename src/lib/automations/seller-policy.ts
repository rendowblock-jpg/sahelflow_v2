import "server-only";

import { SahelFlowError } from "@/types/errors";
import {
  actionAllowedForTrigger,
  getSellerStatusTargets,
  getSellerTriggerSpec,
  unsupportedTemplateVariablesForTrigger,
  type SellerConditionField,
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

function conditionValueIsValid(
  field: SellerConditionField,
  operator: SellerConditionOperator,
  value: unknown,
): boolean {
  if (operator === "is_empty" || operator === "is_not_empty") {
    return value === null;
  }

  if (operator === "in" || operator === "not_in") {
    if (!Array.isArray(value) || value.length === 0) return false;
    if (field.type === "number") {
      return value.every(
        (entry) => typeof entry === "number" && Number.isFinite(entry),
      );
    }
    return value.every(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    );
  }

  if (field.type === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }

  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Enforce the same seller-facing compatibility contract at the trusted write
 * boundary. The durable runtime intentionally remains capable of reading
 * historical definitions; new/edited definitions must not introduce an action
 * whose required payload is absent from its trigger, an unreachable governed
 * order transition, a condition whose field/operator/value shape cannot be
 * evaluated truthfully, or a template token that would render blank/literally.
 *
 * Until a workflow owns a durable wait/re-check primitive, seller definitions
 * may contain at most one status mutation. Allowing multiple immediate status
 * writes would make their validity depend on prior steps and can drive an order
 * through several lifecycle states in one worker tick.
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

  const statusMutationCount = definition.steps.filter(
    (step) => step.action === "update_status",
  ).length;
  if (statusMutationCount > 1) {
    policyError(
      "Seller automations may contain only one order status mutation",
      "AUTOMATION_SELLER_MULTIPLE_STATUS_MUTATIONS",
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
          unsupported[0] === "…"
            ? "Automation template contains malformed placeholder syntax"
            : `Template variable '${unsupported[0]}' is not available on trigger '${definition.trigger}'`,
          unsupported[0] === "…"
            ? "AUTOMATION_SELLER_TEMPLATE_SYNTAX_INVALID"
            : "AUTOMATION_SELLER_TEMPLATE_VARIABLE_UNAVAILABLE",
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
    if (
      !conditionValueIsValid(
        field,
        condition.operator as SellerConditionOperator,
        condition.value,
      )
    ) {
      policyError(
        `Condition value for '${condition.field}' does not match the selected operator and field type`,
        "AUTOMATION_SELLER_CONDITION_VALUE_INVALID",
      );
    }
  }
}
