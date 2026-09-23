/**
 * MCP module barrel — SahelFlow agent surface.
 *
 * Architecture follows the CodFlow MCP study (EX-5 §7):
 * registration-time scope hiding, two-layer validation, declared output
 * schemas, derived annotations, and proposal-bound destructive doctrine.
 */

export { handleMcpRequest, handleMcpBatch } from "./server";
export {
  registerMcpTool,
  executeMcpTool,
  getVisibleTools,
  getVisibleTool,
  getAllRegisteredToolNames,
  clearMcpRegistry,
  zodToJsonSchema,
} from "./registry";
export {
  toolOutput,
  toolOutputFromShape,
  safeParseToolResult,
  errorToolResult,
  successToolResult,
} from "./tool-output";
export { deriveAnnotations, assertAnnotationConsistency } from "./annotations";
export { TOOL_TITLES } from "./tool-titles";
export {
  checkRateLimit,
  readClientMeta,
  redactForAudit,
  logToolCall,
  getAuditLog,
  type ClientMeta,
  type RateLimitResult,
  type McpAuditEntry,
} from "./request-context";
export type {
  McpToolDefinition,
  McpToolContext,
  McpToolResult,
  McpToolVisibility,
  McpToolRegistration,
  McpCapabilityGroup,
  McpProposalRuntime,
  ToolAnnotations,
  ToolExecutionClass,
  ToolOutputSchema,
} from "./types";

// Auto-register all tools on import
import "./tools";
