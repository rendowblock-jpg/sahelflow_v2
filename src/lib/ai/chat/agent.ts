import "server-only";

import {
  isAiActionProposalToolResult,
  type AiActionProposalToolResult,
} from "@/lib/ai/actions/proposal-runtime";
import {
  geminiErrorMessage,
  geminiProviderErrorFromStream,
  type GeminiModel,
  type GeminiProviderError,
  requestGemini,
} from "@/lib/ai/gemini/provider";
import { serializeToolResultForRemoteModel } from "@/lib/ai/redact";
import { db, shopContext } from "@/lib/db";
import { getSecret } from "@/lib/secrets";
import {
  aiChatSystemPrompt,
  aiProposalRecordedMessage,
  aiUnknownToolMessage,
  type AiChatLocale,
} from "./locale-context";
import {
  getAllToolDefinitions,
  getTool,
  type ToolContext,
} from "./tools/registry";
import "./tools/core-tools";
import "./tools/extended-tools";
import "./tools/advanced-tools";

const MAX_ITERATIONS = 5;

interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}
interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: GeminiFunctionCall;
      }>;
    };
    // F-05: terminal-shape truth for empty-visible-text turns.
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: GeminiUsageMetadata;
  error?: { code?: number; message?: string; status?: string };
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result: unknown;
  }>;
}
export interface AgentResult {
  response: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result: unknown;
  }>;
  error?: string;
  actionProposal?: AiActionProposalToolResult;
}

/**
 * Ledger AI-26 — truthful turn signal. Built ONLY from the provider's own
 * usageMetadata (absent fields stay absent) and the model id that actually
 * served the request; `undefined` means the provider reported nothing and
 * the UI shows no signal at all. Never estimated, never fabricated.
 */
export interface AgentTurnSignal {
  model: GeminiModel;
  promptTokens?: number;
  candidateTokens?: number;
  totalTokens?: number;
}

function turnSignal(
  model: GeminiModel | null,
  usage: GeminiUsageMetadata | null,
): AgentTurnSignal | undefined {
  if (!model || !usage) return undefined;
  return {
    model,
    ...(usage.promptTokenCount != null
      ? { promptTokens: usage.promptTokenCount }
      : {}),
    ...(usage.candidatesTokenCount != null
      ? { candidateTokens: usage.candidatesTokenCount }
      : {}),
    ...(usage.totalTokenCount != null
      ? { totalTokens: usage.totalTokenCount }
      : {}),
  };
}
export type AgentStreamEvent =
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "text_delta"; text: string }
  | { type: "action_proposal"; proposal: AiActionProposalToolResult }
  | {
      type: "done";
      response: string;
      toolCalls: AgentResult["toolCalls"];
      actionProposal?: AiActionProposalToolResult;
      signal?: AgentTurnSignal;
    }
  | { type: "error"; message: string };

type ToolExecutionResult = {
  result: unknown;
  actionProposal?: AiActionProposalToolResult;
};
type Content = { role: string; parts: Array<Record<string, unknown>> };

function historySafeToolResult(toolName: string, value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    (value as Record<string, unknown>).pending_action_proposal === true
  ) {
    const safe = { ...(value as Record<string, unknown>) };
    delete safe.proposalDigest;
    return serializeToolResultForRemoteModel(toolName, safe);
  }
  return serializeToolResultForRemoteModel(toolName, value);
}

function renderHistory(history: AgentMessage[]): Content[] {
  return history.map((message) => {
    if (message.role === "assistant" && message.toolCalls?.length) {
      const parts: Array<Record<string, unknown>> = message.content
        ? [{ text: message.content }]
        : [];
      for (const call of message.toolCalls) {
        parts.push({ functionCall: { name: call.name, args: call.args } });
        parts.push({
          functionResponse: {
            name: call.name,
            response: { result: historySafeToolResult(call.name, call.result) },
          },
        });
      }
      return { role: "model", parts };
    }
    return {
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    };
  });
}

async function execute(
  call: GeminiFunctionCall,
  context: ToolContext,
  locale: AiChatLocale | undefined,
): Promise<ToolExecutionResult> {
  const tool = getTool(call.name);
  if (!tool) {
    return {
      result: { error: aiUnknownToolMessage(locale ?? "fr", call.name) },
    };
  }
  const toolResult = await tool.execute(call.args, context);
  const result = toolResult.success
    ? toolResult.data
    : { error: toolResult.error };
  if (isAiActionProposalToolResult(result)) {
    return {
      result: historySafeToolResult(call.name, result),
      actionProposal: result,
    };
  }
  return { result };
}

function proposalResponse(
  text: string,
  proposal: AiActionProposalToolResult,
  locale: AiChatLocale | undefined,
): string {
  const message = aiProposalRecordedMessage(locale ?? "fr", proposal.tool);
  return text ? `${text}\n${message}`.trim() : message;
}

function requestBody(
  contents: Content[],
  locale: AiChatLocale | undefined,
  tools: ReturnType<typeof getAllToolDefinitions>,
) {
  return {
    systemInstruction: {
      parts: [{ text: aiChatSystemPrompt(locale ?? "fr") }],
    },
    contents,
    tools: [{ functionDeclarations: tools }],
    // F-05 (Internal.33 installed campaign): the served flash models are
    // thinking-enabled — they spend generation output on internal thought
    // BEFORE any visible text. The 2048 budget starved visible answers into
    // empty candidates (finishReason MAX_TOKENS) and the UI showed the
    // dead-end "rephrase" copy even though the key had authenticated and the
    // model had answered — the identical failure the D1 round-3 verify probe
    // fixed at 8 tokens. 8192 gives thought + answer headroom within the
    // documented output window.
    generationConfig: { maxOutputTokens: 8192 },
  };
}

function missingKey(locale: AiChatLocale = "fr"): string {
  if (locale === "ar") return "لا يوجد مفتاح Gemini مهيأ. أضف المفتاح من الإعدادات ← الذكاء الاصطناعي.";
  if (locale === "en") return "No Gemini key is configured. Add one in Settings → Artificial intelligence.";
  return "Aucune clé Gemini n'est configurée. Ajoutez-la dans Paramètres → Intelligence artificielle.";
}

/**
 * PII-free shape of a 200/stream response that carried no visible text —
 * the truthful verdict surface for founder finding F-05 (the previous copy
 * told the operator to "rephrase", which was both false and a dead end).
 */
type EmptyResponseShape = {
  finishReason: string | null;
  blockReason: string | null;
};

function emptyResponseMessage(
  locale: AiChatLocale | undefined,
  shape: EmptyResponseShape,
): string {
  if (shape.blockReason) {
    if (locale === "ar")
      return `رفض النموذج الطلب وفق سياسات المحتوى (${shape.blockReason}). لم تُرسل أي بيانات — أعد المحاولة بطلب مختلف.`;
    if (locale === "en")
      return `The model refused this request under its content policy (${shape.blockReason}). Nothing was sent — try a different request.`;
    return `Le modèle a refusé cette demande selon sa politique de contenu (${shape.blockReason}). Rien n'a été envoyé — essayez une autre demande.`;
  }
  if (shape.finishReason === "MAX_TOKENS") {
    if (locale === "ar")
      return "استهلك النموذج ميزانية التوليد في التفكير الداخلي قبل أي نص مرئي. أعد إرسال طلبك — إذا تكرر ذلك فالنموذج مشبع حاليًا.";
    if (locale === "en")
      return "The model spent its generation budget on internal reasoning before any visible text. Send the request again — if it repeats, the model is currently saturated.";
    return "Le modèle a dépensé son budget de génération en raisonnement interne avant tout texte visible. Renvoyez la demande — si cela se répète, le modèle est actuellement saturé.";
  }
  if (locale === "ar")
    return "لم يُعِد النموذج محتوى مرئيًا. أعد إرسال طلبك.";
  if (locale === "en")
    return "The model returned no visible content. Send the request again.";
  return "Le modèle n'a renvoyé aucun contenu visible. Renvoyez la demande.";
}

export async function runAgent(
  conversationHistory: AgentMessage[],
  userMessage: string,
  toolContext: ToolContext = { db, shop: shopContext },
  locale?: AiChatLocale,
): Promise<AgentResult> {
  const apiKey = await getSecret(
    { prisma: db, shop: shopContext },
    "gemini_api_key",
  );
  if (!apiKey) return { response: missingKey(locale), toolCalls: [] };

  const tools = getAllToolDefinitions();
  const allToolCalls: AgentResult["toolCalls"] = [];
  let buffered = "";
  const contents: Content[] = [
    ...renderHistory(conversationHistory),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    let response: GeminiResponse;
    try {
      const result = await requestGemini(apiKey, {
        body: requestBody(contents, locale, tools),
      });
      response = (await result.response.json()) as GeminiResponse;
    } catch (error) {
      return {
        response: "",
        toolCalls: allToolCalls,
        error: geminiErrorMessage(error, locale ?? "fr"),
      };
    }

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((part) => part.text ?? "").join("");
    // Ledger AI-16: one model turn may carry several parallel function calls.
    // `parts.find` silently dropped every call after the first — collect ALL
    // of them, execute each, and return every result to the model.
    const functionCalls = parts.flatMap((part) =>
      part.functionCall ? [part.functionCall] : [],
    );
    if (functionCalls.length > 0) {
      const executed: Array<{ call: GeminiFunctionCall; outcome: ToolExecutionResult }> = [];
      for (const call of functionCalls) {
        const outcome = await execute(call, toolContext, locale);
        executed.push({ call, outcome });
        allToolCalls.push({
          name: call.name,
          args: call.args,
          result: outcome.result,
        });
      }
      const proposalOutcome = executed.find(
        (entry) => entry.outcome.actionProposal,
      );
      if (proposalOutcome?.outcome.actionProposal) {
        return {
          response: proposalResponse(
            `${buffered}${text}`,
            proposalOutcome.outcome.actionProposal,
            locale,
          ),
          toolCalls: allToolCalls,
          actionProposal: proposalOutcome.outcome.actionProposal,
        };
      }
      if (text) buffered += text;
      contents.push({
        role: "model",
        parts: [
          ...(text ? [{ text }] : []),
          ...functionCalls.map((call) => ({ functionCall: call })),
        ],
      });
      contents.push({
        role: "user",
        parts: executed.map(({ call, outcome }) => ({
          functionResponse: {
            name: call.name,
            response: {
              result: historySafeToolResult(call.name, outcome.result),
            },
          },
        })),
      });
      continue;
    }

    if (text || buffered) {
      return {
        response: buffered ? `${buffered}\n${text}`.trim() : text,
        toolCalls: allToolCalls,
      };
    }
    // F-05: truthful empty-shape verdict instead of the false "rephrase"
    // dead end. The shape is PII-free and names what the provider actually
    // returned (thought-budget exhaustion / policy refusal / empty).
    return {
      response: emptyResponseMessage(locale, {
        finishReason:
          response.candidates?.[0]?.finishReason ?? null,
        blockReason: response.promptFeedback?.blockReason ?? null,
      }),
      toolCalls: allToolCalls,
    };
  }

  return {
    response:
      locale === "ar"
        ? "تم بلوغ الحد الأقصى من خطوات الوكيل. بسّط طلبك ثم أعد المحاولة."
        : locale === "en"
          ? "The agent reached its iteration limit. Simplify the request and try again."
          : "La limite d'itérations a été atteinte. Simplifiez la demande puis réessayez.",
    toolCalls: allToolCalls,
  };
}

interface ParsedStream {
  fullText: string;
  functionCalls: GeminiFunctionCall[];
  cancelled: boolean;
  providerError: GeminiProviderError | null;
  usage: GeminiUsageMetadata | null;
  // F-05: PII-free terminal shape of the last stream chunk, so an
  // empty-visible-text turn yields its truthful cause instead of the
  // old "rephrase your question" dead end.
  finishReason: string | null;
  blockReason: string | null;
}

async function* parseStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<AgentStreamEvent, ParsedStream> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let usage: GeminiUsageMetadata | null = null;
  // F-05: PII-free terminal shape of the turn (last chunk wins — the final
  // SSE chunk carries the finishReason/promptFeedback verdict).
  let finishReason: string | null = null;
  let blockReason: string | null = null;
  // Ledger AI-16: collect every parallel function call in the turn instead of
  // overwriting (last-wins) — the model may request several at once.
  const functionCalls: GeminiFunctionCall[] = [];
  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        return {
          fullText,
          functionCalls: [],
          cancelled: true,
          providerError: null,
          usage,
          finishReason,
          blockReason,
        };
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator: number;
      while ((separator = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const encoded = line.slice(5).trim();
          if (!encoded || encoded === "[DONE]") continue;
          let chunk: GeminiResponse;
          try {
            chunk = JSON.parse(encoded) as GeminiResponse;
          } catch {
            continue;
          }
          if (chunk.error) {
            return {
              fullText,
              functionCalls: [],
              cancelled: false,
              providerError: geminiProviderErrorFromStream(chunk.error),
              usage,
              finishReason,
              blockReason,
            };
          }
          const parts = chunk.candidates?.[0]?.content?.parts ?? [];
          // Ledger AI-26: keep the provider's own usage report when it sends
          // one (stream chunks typically carry it on the final chunk).
          if (chunk.usageMetadata) usage = chunk.usageMetadata;
          // F-05: keep the terminal-shape verdict when the provider sends one.
          const chunkFinishReason = chunk.candidates?.[0]?.finishReason;
          if (chunkFinishReason) finishReason = chunkFinishReason;
          const chunkBlockReason = chunk.promptFeedback?.blockReason;
          if (chunkBlockReason) blockReason = chunkBlockReason;
          for (const part of parts) {
            if (part.text) {
              fullText += part.text;
              yield { type: "text_delta", text: part.text };
            }
            if (part.functionCall) functionCalls.push(part.functionCall);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return {
    fullText,
    functionCalls,
    cancelled: false,
    providerError: null,
    usage,
    finishReason,
    blockReason,
  };
}

export async function* runAgentStream(
  conversationHistory: AgentMessage[],
  userMessage: string,
  externalSignal?: AbortSignal,
  toolContext: ToolContext = { db, shop: shopContext },
  locale?: AiChatLocale,
): AsyncGenerator<AgentStreamEvent> {
  const apiKey = await getSecret(
    { prisma: db, shop: shopContext },
    "gemini_api_key",
  );
  if (!apiKey) {
    yield { type: "done", response: missingKey(locale), toolCalls: [] };
    return;
  }

  const tools = getAllToolDefinitions();
  const allToolCalls: AgentResult["toolCalls"] = [];
  const contents: Content[] = [
    ...renderHistory(conversationHistory),
    { role: "user", parts: [{ text: userMessage }] },
  ];
  // Ledger AI-26: the model id that actually served the turn — requestGemini
  // resolves fallbacks internally, so the reported model is request truth.
  let servedModel: GeminiModel | null = null;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    if (externalSignal?.aborted) return;
    let stream: ReadableStream<Uint8Array> | null;
    try {
      const result = await requestGemini(apiKey, {
        stream: true,
        body: requestBody(contents, locale, tools),
      });
      stream = result.response.body;
      servedModel = result.model;
    } catch (error) {
      if (externalSignal?.aborted) return;
      yield { type: "error", message: geminiErrorMessage(error, locale ?? "fr") };
      return;
    }
    if (!stream) {
      yield { type: "error", message: geminiErrorMessage(null, locale ?? "fr") };
      return;
    }

    const parser = parseStream(stream, externalSignal);
    let parsed: IteratorResult<AgentStreamEvent, ParsedStream>;
    while (true) {
      parsed = await parser.next();
      if (parsed.done) break;
      yield parsed.value;
    }
    const { fullText, functionCalls, cancelled, providerError, usage } =
      parsed.value;
    if (cancelled) return;
    if (providerError) {
      yield {
        type: "error",
        message: geminiErrorMessage(providerError, locale ?? "fr"),
      };
      return;
    }

    if (functionCalls.length > 0) {
      // Ledger AI-16: render/execute every parallel call of the turn — one
      // tool_call + tool_result event pair per call, each with its own result.
      const executed: Array<{ call: GeminiFunctionCall; outcome: ToolExecutionResult }> = [];
      for (const call of functionCalls) {
        yield { type: "tool_call", name: call.name, args: call.args };
        const outcome = await execute(call, toolContext, locale);
        allToolCalls.push({
          name: call.name,
          args: call.args,
          result: outcome.result,
        });
        yield { type: "tool_result", name: call.name, result: outcome.result };
        executed.push({ call, outcome });
        if (outcome.actionProposal) {
          yield { type: "action_proposal", proposal: outcome.actionProposal };
          yield {
            type: "done",
            response: proposalResponse(fullText, outcome.actionProposal, locale),
            toolCalls: allToolCalls,
            actionProposal: outcome.actionProposal,
            signal: turnSignal(servedModel, usage),
          };
          return;
        }
      }
      contents.push({
        role: "model",
        parts: [
          ...(fullText ? [{ text: fullText }] : []),
          ...functionCalls.map((call) => ({ functionCall: call })),
        ],
      });
      contents.push({
        role: "user",
        parts: executed.map(({ call, outcome }) => ({
          functionResponse: {
            name: call.name,
            response: {
              result: historySafeToolResult(call.name, outcome.result),
            },
          },
        })),
      });
      continue;
    }

    if (fullText) {
      yield {
        type: "done",
        response: fullText,
        toolCalls: allToolCalls,
        signal: turnSignal(servedModel, usage),
      };
      return;
    }
    yield {
      type: "error",
      // F-05: an authenticated 200/stream with no visible text is a
      // provider-truth failure, not a user-phrasing problem. The coded error
      // surface marks the turn interrupted and names the PII-free shape
      // (thought-budget exhaustion / policy refusal / empty) instead of the
      // old "rephrase your question" done event.
      message: emptyResponseMessage(locale, {
        finishReason: parsed.value.finishReason,
        blockReason: parsed.value.blockReason,
      }),
    };
    return;
  }
}
