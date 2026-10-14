import { ZodError } from "zod";

/** Chat-surface twin of MCP's MCP_TOOL_ARGUMENTS_INVALID mapping. */
export const AI_TOOL_ARGUMENTS_INVALID = "AI_TOOL_ARGUMENTS_INVALID";

/**
 * Field paths and messages only, capped at five. Values are not copied out
 * of the issue separately; do not log the returned string.
 */
export function toolArgsValidationMessage(error: ZodError): string {
  const issues = error.issues
    .slice(0, 5)
    .map(
      (issue) =>
        `${issue.path.join(".") || "(arguments)"}: ${issue.message}`,
    );
  return `Invalid arguments — ${issues.join("; ")}`;
}
