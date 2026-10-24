/**
 * Test-only access to the mutating AI tool bodies.
 *
 * The production registry holds no body for a sensitive or blocked tool (it
 * can only create a proposal or refuse). Suites that still exercise a body
 * directly get it from here, from a map of their own. Production code must
 * never import this file (`actions/__tests__/test-mode-gate.test.ts` checks).
 */

import { legacyMutatingTools as advancedTools } from "../../advanced-tools-legacy";
import { legacyMutatingTools as coreTools } from "../../core-tools";
import { legacyMutatingTools as extendedTools } from "../../extended-tools";
import type { ChatTool } from "../../registry";

const bodies = new Map<string, ChatTool>();
for (const tool of [...coreTools, ...extendedTools, ...advancedTools]) {
  bodies.set(tool.definition.name, tool);
}

export function getLegacyTool(name: string): ChatTool {
  const tool = bodies.get(name);
  if (!tool) throw new Error(`No legacy tool body named '${name}'`);
  return tool;
}

export function listLegacyTools(): ChatTool[] {
  return [...bodies.values()];
}
