/**
 * SahelFlow AI Model Executor
 * Orchestrates model execution with:
 * - Health-aware routing (circuit breaker integration)
 * - Retry logic with exponential backoff
 * - Automatic fallback chains
 * - Latency tracking
 * - Darija-first routing for Algerian messages
 */

import type { ChatMessage, GroqOptions } from "@/lib/agents/groq";
import { callLLM, callLLMWithTools } from "@/lib/agents/groq";
import { getGroqApiKeyForModel } from "@/lib/env";
import type { IntentAnalysis } from "./classifier";
import { classifyIntent, isFlashWorthy, isGreeting } from "./classifier";
import {
  isModelHealthy,
  recordSuccess,
  recordFailure,
  recordRateLimited,
  recordTimeout,
} from "./health";
import type { ModelProfile } from "./registry";
import type { RouteDecision } from "./router";
import { routeIntent } from "./router";

// ===== EXECUTION RESULT =====

export interface ModelExecutionResult {
  success: boolean;
  content: string;
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  modelUsed: string;
  modelDisplayName: string;
  latencyMs: number;
  tokensUsed?: number;
  errors?: string[];
  usedFallback: boolean;
}

// ===== INTERNAL EXECUTION =====

async function executeSingleModel(
  model: ModelProfile,
  messages: ChatMessage[],
  options?: Omit<GroqOptions, "model"> & {
    useTools?: boolean;
    tools?: GroqOptions["tools"];
  },
): Promise<ModelExecutionResult> {
  const start = Date.now();

  // Check health before executing
  if (!isModelHealthy(model.id)) {
    return {
      success: false,
      content: "",
      modelUsed: model.id,
      modelDisplayName: model.displayName,
      latencyMs: 0,
      errors: [
        `Model ${model.displayName} is currently unavailable (circuit breaker)`,
      ],
      usedFallback: false,
    };
  }

  try {
    const groqOpts: GroqOptions = {
      model: model.groqModel,
      maxTokens: options?.maxTokens ?? model.maxTokens,
      temperature: options?.temperature ?? model.defaultTemp,
      apiKey: getGroqApiKeyForModel(model.id),
    };
    if (options?.jsonMode) groqOpts.jsonMode = options.jsonMode;
    if (options?.tool_choice) groqOpts.tool_choice = options.tool_choice;

    let content: string;
    let toolCalls: ModelExecutionResult["toolCalls"];

    if (options?.useTools && options.tools) {
      const result = await callLLMWithTools(messages, {
        ...groqOpts,
        tools: options.tools,
      });
      content = result.content ?? "";
      toolCalls = result.tool_calls;
    } else {
      content = await callLLM(messages, groqOpts);
    }

    const latency = Date.now() - start;
    recordSuccess(model.id, latency);

    return {
      success: true,
      content,
      toolCalls,
      modelUsed: model.id,
      modelDisplayName: model.displayName,
      latencyMs: latency,
      usedFallback: false,
    };
  } catch (err) {
    const latency = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes("429") || msg.includes("Rate limit")) {
      recordRateLimited(model.id);
    } else if (msg.includes("timeout") || msg.includes("AbortError")) {
      recordTimeout(model.id);
    } else {
      recordFailure(model.id, "5xx");
    }

    return {
      success: false,
      content: "",
      modelUsed: model.id,
      modelDisplayName: model.displayName,
      latencyMs: latency,
      errors: [msg],
      usedFallback: false,
    };
  }
}

/**
 * Execute with primary model, then fallback if needed.
 */
export async function executeWithFallback(
  decision: RouteDecision,
  messages: ChatMessage[],
  options?: Omit<GroqOptions, "model"> & {
    useTools?: boolean;
    tools?: GroqOptions["tools"];
  },
): Promise<ModelExecutionResult> {
  // Try primary
  const primary = await executeSingleModel(decision.primary, messages, options);

  if (primary.success) {
    return primary;
  }

  // Primary failed — try fallback
  console.warn(
    `[ModelRouter] ${decision.primary.displayName} failed: ${primary.errors?.[0]}. Falling back to ${decision.fallback.displayName}`,
  );

  const fallback = await executeSingleModel(decision.fallback, messages, {
    ...options,
    maxTokens: Math.min(
      options?.maxTokens ?? decision.fallback.maxTokens,
      2048,
    ),
  });

  if (fallback.success) {
    return {
      ...fallback,
      usedFallback: true,
      errors: [...(primary.errors ?? []), ...(fallback.errors ?? [])],
    };
  }

  // Both failed
  return {
    ...fallback,
    errors: [
      ...(primary.errors ?? []),
      ...(fallback.errors ?? []),
      "All models exhausted. Please try again in a moment.",
    ],
  };
}

// ===== PUBLIC API =====

/**
 * Re-export key functions for convenience.
 */
export { classifyIntent, isFlashWorthy, isGreeting, routeIntent };
export type { IntentAnalysis, RouteDecision };
