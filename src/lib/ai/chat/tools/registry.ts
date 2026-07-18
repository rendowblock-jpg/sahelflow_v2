/**
 * AI chat tool framework — the agent can call tools to interact with the app.
 *
 * Tools are registered in the registry. The agent loop (in agent.ts):
 *   1. Sends the conversation + tool definitions to Gemini
 *   2. If Gemini returns a function call, executes the tool + feeds the result back
 *   3. Repeats until Gemini returns a text response (or max iterations)
 *
 * Each tool declares: name, description, parameters (JSON schema), and an
 * async execute function that returns a JSON-serializable result.
 */

import type { z } from "zod";
import type { ShopContext } from "@/lib/shops/context";

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON schema for the parameters (Gemini's functionDeclarations format). */
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  /**
   * W2-3: If true, the agent loop returns a pending_confirmation event
   * instead of executing the tool immediately — the user must send an
   * explicit confirmation message ("oui", "yes", "نعم", "ok", etc.) in
   * their CURRENT message for the tool to execute. This is a structural
   * defense against prompt-injection: a malicious WhatsApp message
   * cannot bypass the gate by impersonating the system prompt.
   */
  requiresConfirmation?: boolean;
}

export interface ToolContext {
  // Prisma client (the extended, PII-encryption-aware client)
  // Using `unknown` here to avoid a circular import with db.ts
  db: unknown;
  shop: ShopContext;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ChatTool {
  definition: ToolDefinition;
  execute: (params: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

// ── Tool registry ───────────────────────────────────────────────────────────

const registry = new Map<string, ChatTool>();

export function registerTool(tool: ChatTool): void {
  registry.set(tool.definition.name, tool);
}

export function getTool(name: string): ChatTool | undefined {
  return registry.get(name);
}

export function listTools(): ChatTool[] {
  return Array.from(registry.values());
}

/** Get all tool definitions (for sending to Gemini). */
export function getAllToolDefinitions(): ToolDefinition[] {
  return listTools().map((t) => t.definition);
}

// Zod schema helper for tools (type-safe parameter validation)
export type ToolParams<T extends z.ZodType> = z.infer<T>;
