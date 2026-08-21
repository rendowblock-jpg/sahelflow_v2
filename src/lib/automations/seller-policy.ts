import "server-only";

import { SahelFlowError } from "@/types/errors";
import {
  actionAllowedForTrigger,
  getSellerRecheckStatuses,
  getSellerStatusTargets,
  getSellerStatusTargetsFromStatus,
  getSellerTriggerSpec,
  unsupportedTemplateVariablesForTrigger,
  type SellerConditionField,
  type SellerConditionOperator,
  type SellerOrderCheckStatus,
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
    case "wait":
    case "recheck_order_status":
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
 * boundary. Historical definitions remain readable, while new/edited workflows
 * may only use actions whose required payload exists on the selected trigger.
 * Durable waits are bounded by the contract; live order re-checks are limited
 * to canonical order events and statuses and stop downstream work neutrally
 * when the committed status no longer matches.
 *
 * A wait makes the original status-event authority stale for any later business
 * status mutation. A later live re-check restores that authority for the exact
 * checked status, and the target is then validated against the canonical state
 * machine from that live status rather than from the old trigger event.
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

  let statusAuthorityStale = false;
  let liveCheckedStatus: SellerOrderCheckStatus | null = null;

  for (const step of definition.steps) {
    if (!actionAllowedForTrigger(definition.trigger, step.action)) {
      policyError(
        `Automation action '${step.action}' is not compatible with trigger '${definition.trigger}'`,
        "AUTOMATION_SELLER_ACTION_INCOMPATIBLE",
      );
    }

    if (step.action === "wait") {
      statusAuthorityStale = true;
      liveCheckedStatus = null;
    }

    if (step.action === "recheck_order_status") {
      const expected = step.config.expectedStatus as SellerOrderCheckStatus;
      if (!getSellerRecheckStatuses(definition.trigger).includes(expected)) {
        policyError(
          `Order status '${expected}' cannot be re-checked from trigger '${definition.trigger}'`,
          "AUTOMATION_SELLER_RECHECK_STATUS_UNAVAILABLE",
        );
      }
      liveCheckedStatus = expected;
      statusAuthorityStale = false;
    }

    if (step.action === "update_status") {
      if (statusAuthorityStale) {
        policyError(
          "A delayed order status change requires a live order-status check after the last wait",
          "AUTOMATION_SELLER_STATUS_RECHECK_REQUIRED_AFTER_WAIT",
        );
      }
      const target = step.config.targetStatus as SellerOrderStatusTarget;
      const allowedTargets = liveCheckedStatus
        ? getSellerStatusTargetsFromStatus(liveCheckedStatus)
        : getSellerStatusTargets(definition.trigger);
      if (!allowedTargets.includes(target)) {
        policyError(
          liveCheckedStatus
            ? `Order status '${target}' is not reachable from live checked status '${liveCheckedStatus}'`
            : `Order status '${target}' is not reachable from trigger '${definition.trigger}'`,
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
