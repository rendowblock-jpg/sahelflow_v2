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
import { MODELS } from "./registry";
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

export interface OrchestratorResult {
  success: boolean;
  answer: string;
  actionCards?: Array<{
    type: string;
    title: string;
    description?: string;
  }>;
  modelChain: string[];
  totalLatencyMs: number;
  errors: string[];
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
 * Build a RouteDecision that forces a specific model by ID.
 * Falls back to MODELS.brain if the ID is not found.
 */
function forceRoute(modelId: string): RouteDecision {
  const model =
    Object.values(MODELS).find((m) => m.id === modelId) || MODELS.brain;
  return {
    primary: model,
    fallback: MODELS.deep,
    strategy: "single",
    reasoning: "forced",
    latencyEstimate: "normal",
    darijaOptimized: false,
  };
}

/**
 * Execute a single-turn request through the model router.
 * This is the main entry point for the AI engine.
 */
export async function executeRoutedRequest(
  input: string,
  options?: {
    conversationHistory?: ChatMessage[];
    systemPrompt?: string;
    useTools?: boolean;
    tools?: GroqOptions["tools"];
    forcedModel?: string;
  },
): Promise<ModelExecutionResult> {
  // Quick path: greetings don't need any model
  if (isGreeting(input)) {
    return {
      success: true,
      content:
        "Hello! I'm SahelFlow AI. How can I help you today? مرحبا! كيفاش نقدر نعاونك؟",
      modelUsed: "none",
      modelDisplayName: "Greeting Handler",
      latencyMs: 0,
      usedFallback: false,
    };
  }

  // Classify intent
  const intent = classifyIntent(input);

  // Route to model(s)
  const decision = options?.forcedModel
    ? forceRoute(options.forcedModel)
    : routeIntent(intent);

  // Build messages
  const messages: ChatMessage[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  if (options?.conversationHistory) {
    messages.push(...options.conversationHistory.slice(-6));
  }
  messages.push({ role: "user", content: input });

  // Execute
  return executeWithFallback(decision, messages, {
    useTools: options?.useTools,
    tools: options?.tools,
  });
}

/**
 * Execute a model chain for complex multi-step tasks.
 * Example: Extract → Analyze → Generate response
 */
export async function executeModelChain(
  chain: ModelProfile[],
  initialMessages: ChatMessage[],
  stepTransformers?: Array<
    (result: ModelExecutionResult, stepIndex: number) => ChatMessage[]
  >,
): Promise<OrchestratorResult> {
  const modelChain: string[] = [];
  const errors: string[] = [];
  let totalLatency = 0;
  let currentMessages = [...initialMessages];
  let finalContent = "";

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const transformer = stepTransformers?.[i];

    const result = await executeSingleModel(model, currentMessages);
    modelChain.push(model.id);
    totalLatency += result.latencyMs;

    if (!result.success) {
      errors.push(
        `Step ${i + 1} (${model.displayName}): ${result.errors?.[0]}`,
      );
      return {
        success: false,
        answer: `Failed at step ${i + 1}: ${result.errors?.[0]}`,
        modelChain,
        totalLatencyMs: totalLatency,
        errors,
      };
    }

    finalContent = result.content;

    if (transformer && i < chain.length - 1) {
      currentMessages = transformer(result, i);
    } else if (i < chain.length - 1) {
      currentMessages = [
        ...currentMessages,
        { role: "assistant", content: result.content },
        {
          role: "user",
          content: "Continue with the next step.",
        },
      ];
    }
  }

  return {
    success: true,
    answer: finalContent,
    modelChain,
    totalLatencyMs: totalLatency,
    errors,
  };
}

/**
 * Smart extraction helper — routes through Flash for simple data,
 * Brain for complex Darija, Struct for clean JSON.
 */
export async function extractWithSmartRouting(
  text: string,
  options?: {
    systemPrompt?: string;
    jsonSchema?: string;
    requireStructured?: boolean;
  },
): Promise<ModelExecutionResult> {
  // Try Flash first for speed
  if (isFlashWorthy(text) && !options?.requireStructured) {
    const flashResult = await executeSingleModel(MODELS.flash, [
      ...(options?.systemPrompt
        ? [{ role: "system" as const, content: options.systemPrompt }]
        : []),
      { role: "user", content: text },
    ]);
    if (flashResult.success) return flashResult;
  }

  // Otherwise route normally based on intent classification
  const intent = classifyIntent(text);
  const decision = routeIntent(intent);

  return executeWithFallback(decision, [
    ...(options?.systemPrompt
      ? [{ role: "system" as const, content: options.systemPrompt }]
      : []),
    { role: "user", content: text },
  ]);
}

/**
 * Re-export key functions for convenience.
 */
export { classifyIntent, isFlashWorthy, isGreeting, routeIntent };
export type { IntentAnalysis, RouteDecision };
