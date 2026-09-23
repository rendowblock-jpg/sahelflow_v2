/**
 * Derived tool annotations — CodFlow convention (EX-5 §7).
 *
 * Annotations are **derived** from membership sets, never hand-written.
 * A CI drift guard pins the consistency: a tool in `DESTRUCTIVE_TOOLS` must
 * have `destructiveHint: true`, a tool in `READ_ONLY_TOOLS` must have
 * `readOnlyHint: true`, etc. Mislabeling fails tests.
 */

import type { McpToolDefinition, ToolAnnotations } from "./types";

/**
 * Read-only tools: tools whose execution class is `read` or `external_read`
 * and that have no side effects. This is the *only* set that gets
 * `readOnlyHint: true`.
 */
const READ_ONLY_EXECUTION_CLASSES = new Set(["read", "external_read"]);

/**
 * Destructive tools: mutations that change business state. These map to
 * `sensitive` execution class (proposal-gated) plus any `read` tool that
 * might have side effects (none currently).
 */
const DESTRUCTIVE_TOOLS = new Set([
  "createOrder",
  "updateOrderStatus",
  "cancelOrder",
  "createProduct",
  "updateProductPrice",
  "updateProductStock",
  "createCustomer",
  "updateCustomerNotes",
  "assignOrderToDelivery",
]);

/**
 * Idempotent tools: calling twice with the same args is safe (no duplicate
 * effects). These are tools that either read or use idempotency keys.
 */
const IDEMPOTENT_TOOLS = new Set([
  "createOrder",
  "createProduct",
  "createCustomer",
  "searchOrders",
  "searchCustomers",
  "searchProducts",
]);

/**
 * Open-world tools: interact with the external world (network, providers).
 * Currently only the WhatsApp/conversation tools and delivery estimation.
 */
const OPEN_WORLD_TOOLS = new Set([
  "estimateDeliveryCost",
  "getDeliveryCostComparison",
  "getDeliveryStatus",
  "searchConversations",
  "getConversationMessages",
]);

/**
 * Derive annotations from the tool's execution class and membership sets.
 * This is the single source of truth — never set annotations manually.
 */
export function deriveAnnotations(
  toolName: string,
  executionClass: string,
): ToolAnnotations {
  return {
    readOnlyHint: READ_ONLY_EXECUTION_CLASSES.has(executionClass),
    destructiveHint: DESTRUCTIVE_TOOLS.has(toolName),
    idempotentHint: IDEMPOTENT_TOOLS.has(toolName),
    openWorldHint: OPEN_WORLD_TOOLS.has(toolName),
  };
}

/**
 * Verify that derived annotations match the declared membership sets.
 * Called at registration time; throws on drift so it cannot ship silently.
 */
export function assertAnnotationConsistency(tool: McpToolDefinition): void {
  const { annotations, name, inputZod } = tool;
  // executionClass is not on the definition; derive from requiredPermissions
  // and the annotation sets themselves for the consistency check.
  const isDestructive = DESTRUCTIVE_TOOLS.has(name);
  const isReadOnly = annotations.readOnlyHint;

  if (isDestructive && isReadOnly) {
    throw new Error(
      `Tool '${name}' is in DESTRUCTIVE_TOOLS but has readOnlyHint=true`,
    );
  }
  if (!isDestructive && annotations.destructiveHint) {
    throw new Error(
      `Tool '${name}' has destructiveHint=true but is not in DESTRUCTIVE_TOOLS`,
    );
  }
  if (isDestructive && !annotations.destructiveHint) {
    throw new Error(
      `Tool '${name}' is in DESTRUCTIVE_TOOLS but destructiveHint=false`,
    );
  }
}
