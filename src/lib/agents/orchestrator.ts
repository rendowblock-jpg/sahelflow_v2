/**
 * Agent orchestrator — SahelFlow's MCP-native agent loop.
 *
 * Replaces the legacy Gemini chat loop with a clean tool-first architecture:
 * 1. User message → LLM with tool declarations from the scope-filtered registry
 * 2. LLM emits function calls → executed through the MCP tool layer
 * 3. Tool results (including proposals) → fed back to LLM
 * 4. LLM produces final text → streamed to the UI
 *
 * The LLM is a *reasoning engine* over MCP tools — it doesn't own business
 * logic. All mutations ride the proposal gate. All reads go through
 * scope-gated tools with declared output schemas.
 */

import {
  requestGemini,
  type GeminiModel,
} from "@/lib/ai/gemini/provider";
import { serializeToolResultForRemoteModel } from "@/lib/ai/redact";
import { logger } from "@/lib/logger";

import { executeMcpTool, getVisibleTools } from "../mcp/registry";
import type { McpToolContext, McpToolResult } from "../mcp/types";

// ─── Types ───────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 8;

export interface AgentToolCall {
  name: string;
  args: Record<string, unknown>;
  result: McpToolResult;
  durationMs: number;
}

export interface AgentTurnSignal {
  model: GeminiModel;
  promptTokens?: number;
  candidateTokens?: number;
  totalTokens?: number;
}

export interface AgentProposalHandle {
  proposalId: string;
  proposalDigest: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface AgentResult {
  response: string;
  toolCalls: AgentToolCall[];
  proposal?: AgentProposalHandle;
  turnSignal?: AgentTurnSignal;
  error?: string;
}

export type AgentStreamEvent =
  | { type: "tool_call_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_call_end"; name: string; result: McpToolResult; durationMs: number }
  | { type: "text_delta"; text: string }
  | { type: "proposal"; proposal: AgentProposalHandle }
  | { type: "turn_signal"; signal: AgentTurnSignal }
  | { type: "done"; result: AgentResult }
  | { type: "error"; error: string; code?: string };

// ─── LLM function-call types ─────────────────────────────────────────────────

interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiResponsePart {
  text?: string;
  functionCall?: GeminiFunctionCall;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiResponsePart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: GeminiUsageMetadata;
  error?: { code?: number; message?: string; status?: string };
}

// ─── System prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(locale: "en" | "fr" | "ar", ctx: McpToolContext): string {
  const now = new Date().toISOString().split("T")[0];
  const localeInstruction =
    locale === "ar"
      ? "Respond in Arabic (العربية). Use RTL-appropriate formatting."
      : locale === "fr"
        ? "Respond in French (Français)."
        : "Respond in English.";

  return `You are SahelFlow's business operations assistant for an Algerian cash-on-delivery (COD) seller.

## Role
You help the seller manage their business: orders, customers, products, delivery, analytics, and WhatsApp conversations. You have access to tools that read and (with human approval) modify business data.

## Current context
- Date: ${now}
- Shop: ${ctx.shop.shopName || ctx.shop.shopId}
- Role: ${ctx.actor.role}

## Rules
1. ${localeInstruction}
2. Use tools to answer questions about business data. Never fabricate numbers.
3. For mutations (creating orders, updating stock, etc.), the tool returns a PROPOSAL — tell the user what will change and ask them to approve in the approval panel.
4. Be concise and actionable. Use tables for comparisons.
5. Money is in DZD (Algerian Dinars). Always specify the currency.
6. If a tool returns an error, explain what went wrong and suggest a fix.
7. For multi-step tasks, plan first, then execute tools in order.
8. Never expose internal IDs unless the user asks for them.`;
}

// ─── Tool declaration builder (for Gemini function calling) ──────────────────

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

function buildToolDeclarations(ctx: McpToolContext): GeminiFunctionDeclaration[] {
  const visibility = getVisibleTools(ctx.actor.permissions);
  return visibility.visibleTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as Record<string, unknown>,
  }));
}

// ─── Message history management ──────────────────────────────────────────────

interface AgentMessage {
  role: "user" | "model";
  parts: Array<{ text?: string; functionCall?: GeminiFunctionCall }>;
}

interface AgentToolResultPart {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}

type AgentContentPart =
  | { text: string }
  | { functionCall: GeminiFunctionCall }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface AgentContent {
  role: "user" | "model" | "tool";
  parts: AgentContentPart[];
}

// ─── Core orchestrator ───────────────────────────────────────────────────────

/**
 * Run one agent turn: user message → tool loop → final response.
 *
 * Yields stream events for real-time UI updates. The loop runs at most
 * `MAX_ITERATIONS` tool-call rounds before forcing a text response.
 */
export async function* runAgentTurn(
  userMessage: string,
  history: AgentContent[],
  ctx: McpToolContext,
  model: GeminiModel = "gemini-2.0-flash",
  locale: "en" | "fr" | "ar" = "en",
): AsyncGenerator<AgentStreamEvent> {
  const toolCalls: AgentToolCall[] = [];
  let proposal: AgentProposalHandle | undefined;
  let finalResponse = "";

  // Build message history
  const contents: AgentContent[] = [
    ...history,
    { role: "user", parts: [{ text: userMessage }] },
  ];

  // Get tool declarations (scope-filtered)
  const declarations = buildToolDeclarations(ctx);
  const systemPrompt = buildSystemPrompt(locale, ctx);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Call LLM
    let response: GeminiResponse;
    try {
      response = await requestGemini({
        model,
        systemInstruction: systemPrompt,
        contents: contents.map((c) => ({
          role: c.role === "tool" ? "user" : c.role,
          parts: c.parts.map((p) => {
            if ("text" in p) return { text: p.text };
            if ("functionCall" in p) return { functionCall: p.functionCall };
            return { functionResponse: p.functionResponse };
          }),
        })),
        tools: declarations.length > 0 ? [{ functionDeclarations: declarations }] : undefined,
      });
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Provider error",
        code: "AI_PROVIDER_UNAVAILABLE",
      };
      return;
    }

    // Emit turn signal from provider usage metadata
    if (response.usageMetadata) {
      yield {
        type: "turn_signal",
        signal: {
          model,
          ...(response.usageMetadata.promptTokenCount != null
            ? { promptTokens: response.usageMetadata.promptTokenCount }
            : {}),
          ...(response.usageMetadata.candidatesTokenCount != null
            ? { candidateTokens: response.usageMetadata.candidatesTokenCount }
            : {}),
          ...(response.usageMetadata.totalTokenCount != null
            ? { totalTokens: response.usageMetadata.totalTokenCount }
            : {}),
        },
      };
    }

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    // Process parts: text accumulates, function calls execute
    const modelParts: AgentContentPart[] = [];
    const functionCalls: GeminiFunctionCall[] = [];

    for (const part of parts) {
      if (part.text) {
        finalResponse += part.text;
        modelParts.push({ text: part.text });
        yield { type: "text_delta", text: part.text };
      }
      if (part.functionCall) {
        functionCalls.push(part.functionCall);
        modelParts.push({ functionCall: part.functionCall });
      }
    }

    // No function calls → we're done
    if (functionCalls.length === 0) {
      contents.push({ role: "model", parts: modelParts });
      break;
    }

    // Store model turn with function calls
    contents.push({ role: "model", parts: modelParts });

    // Execute each function call through the MCP layer
    const toolResultParts: AgentContentPart[] = [];

    for (const fc of functionCalls) {
      yield { type: "tool_call_start", name: fc.name, args: fc.args };

      const startTime = Date.now();
      const result = await executeMcpTool(fc.name, fc.args, ctx);
      const durationMs = Date.now() - startTime;

      toolCalls.push({ name: fc.name, args: fc.args, result, durationMs });

      yield { type: "tool_call_end", name: fc.name, result, durationMs };

      // Check if this is a proposal
      if (result.structuredContent?.pending_action_proposal === true) {
        proposal = {
          proposalId: String(result.structuredContent.proposalId ?? ""),
          proposalDigest: String(result.structuredContent.proposalDigest ?? ""),
          tool: fc.name,
          args: fc.args,
        };
        yield { type: "proposal", proposal };
      }

      // Serialize result for the LLM (privacy-narrowed)
      const serialized = serializeToolResultForRemoteModel(result.structuredContent ?? result.text);
      toolResultParts.push({
        functionResponse: {
          name: fc.name,
          response: typeof serialized === "string"
            ? { result: serialized }
            : (serialized as Record<string, unknown>),
        },
      });
    }

    // Feed tool results back
    contents.push({ role: "user", parts: toolResultParts });
  }

  // Build final result
  const result: AgentResult = {
    response: finalResponse || "I've completed the requested actions.",
    toolCalls,
    ...(proposal ? { proposal } : {}),
  };

  yield { type: "done", result };
}

// ─── Convenience: non-streaming wrapper ───────────────────────────────────────

/**
 * Run one agent turn and return the final result (non-streaming).
 * Used by API routes that don't need real-time streaming.
 */
export async function runAgentTurnSync(
  userMessage: string,
  history: AgentContent[],
  ctx: McpToolContext,
  model?: GeminiModel,
  locale?: "en" | "fr" | "ar",
): Promise<AgentResult> {
  let lastResult: AgentResult | null = null;
  let lastError: string | undefined;

  for await (const event of runAgentTurn(userMessage, history, ctx, model, locale)) {
    if (event.type === "done") lastResult = event.result;
    if (event.type === "error") lastError = event.error;
  }

  if (lastResult) return lastResult;
  return { response: "", toolCalls: [], error: lastError ?? "No response generated" };
}
