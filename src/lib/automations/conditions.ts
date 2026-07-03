/**
 * Conditions engine (Phase 6 — Chatwoot ConditionsFilterService pattern).
 *
 * Evaluates a conditions object against a trigger payload. Supports:
 *   - "all": array of conditions (AND)
 *   - "any": array of conditions (OR)
 *   - Single condition: { field, operator, value }
 *
 * Operators:
 *   equal, not_equal, contains, not_contains, starts_with, ends_with,
 *   greater_than, less_than, greater_than_or_equal, less_than_or_equal,
 *   in, not_in, is_empty, is_not_empty
 *
 * Example conditions:
 *   { "all": [
 *     { "field": "wilaya", "operator": "equal", "value": "Alger" },
 *     { "field": "totalPrice", "operator": "greater_than", "value": 5000 }
 *   ]}
 *   → matches orders to Alger wilaya with total > 5000 DZD
 *
 *   { "any": [
 *     { "field": "status", "operator": "equal", "value": "returned" },
 *     { "field": "status", "operator": "equal", "value": "refused" }
 *   ]}
 *   → matches orders that are returned OR refused
 */

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface ConditionGroup {
  all?: Condition[];
  any?: Condition[];
}

type ConditionOperator =
  | "equal" | "not_equal"
  | "contains" | "not_contains"
  | "starts_with" | "ends_with"
  | "greater_than" | "less_than"
  | "greater_than_or_equal" | "less_than_or_equal"
  | "in" | "not_in"
  | "is_empty" | "is_not_empty";

/** Evaluate a condition group against a payload. Returns true if conditions match. */
export function evaluateConditions(
  conditions: ConditionGroup | Condition | null | undefined,
  payload: Record<string, unknown>,
): boolean {
  if (!conditions) return true; // no conditions = always match

  // Single condition (has field + operator)
  if ("field" in conditions && "operator" in conditions) {
    return evaluateCondition(conditions as Condition, payload);
  }

  // Condition group
  const group = conditions as ConditionGroup;

  if (group.all) {
    return group.all.every((c) => evaluateCondition(c, payload));
  }

  if (group.any) {
    return group.any.some((c) => evaluateCondition(c, payload));
  }

  return true; // empty group = always match
}

function evaluateCondition(condition: Condition, payload: Record<string, unknown>): boolean {
  const fieldValue = getField(condition.field, payload);
  const op = condition.operator;
  const val = condition.value;

  switch (op) {
    case "equal":
      return String(fieldValue) === String(val);
    case "not_equal":
      return String(fieldValue) !== String(val);
    case "contains":
      return fieldValue != null && String(fieldValue).toLowerCase().includes(String(val).toLowerCase());
    case "not_contains":
      return fieldValue == null || !String(fieldValue).toLowerCase().includes(String(val).toLowerCase());
    case "starts_with":
      return fieldValue != null && String(fieldValue).toLowerCase().startsWith(String(val).toLowerCase());
    case "ends_with":
      return fieldValue != null && String(fieldValue).toLowerCase().endsWith(String(val).toLowerCase());
    case "greater_than":
      return Number(fieldValue) > Number(val);
    case "less_than":
      return Number(fieldValue) < Number(val);
    case "greater_than_or_equal":
      return Number(fieldValue) >= Number(val);
    case "less_than_or_equal":
      return Number(fieldValue) <= Number(val);
    case "in":
      return Array.isArray(val) && val.some((v) => String(fieldValue) === String(v));
    case "not_in":
      return !Array.isArray(val) || !val.some((v) => String(fieldValue) === String(v));
    case "is_empty":
      return fieldValue == null || fieldValue === "" || (Array.isArray(fieldValue) && fieldValue.length === 0);
    case "is_not_empty":
      return fieldValue != null && fieldValue !== "" && !(Array.isArray(fieldValue) && fieldValue.length === 0);
    default:
      return false;
  }
}

/** Get a field value from the payload, supporting dot notation (e.g. "customer.name"). */
function getField(path: string, payload: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let current: unknown = payload;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
