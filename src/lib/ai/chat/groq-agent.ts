import "server-only";

import type { AiActionProposalToolResult } from "@/lib/ai/actions/proposal-runtime";
import {
  GroqProviderError,
  groqErrorMessage,
  requestGroq,
  scrubGroqSecrets,
} from "@/lib/ai/providers/groq/provider";
import { quotaLedger, type QuotaLedger } from "@/lib/ai/providers/quota-ledger";
import {
  execute,
  historySafeToolResult,
  proposalResponse,
  type AgentMessage,
  type AgentResult,
} from "./agent";
import { aiUnknownToolMessage, type AiChatLocale } from "./locale-context";
import { estimateTokens } from "./neutral/budget";
import { buildChatCompletionsBody, parseChatCompletion } from "./neutral/openai-compat";
import { aiChatSystemPromptSlim } from "./neutral/slim-prompt";
import { selectToolsForQuestion } from "./neutral/tool-router";
import type { NeutralMessage, NeutralUsage } from "./neutral/types";
import { getAllToolDefinitions, type ToolContext, type ToolDefinition } from "./tools/registry";

/**
 * The Groq turn loop (phase A: a whole answer, no streaming, wired to nothing).
 *
 * It only builds a SMALL request (slim prompt + routed tools) and talks the
 * OpenAI-compatible wire format. Every tool call it accepts is run by the same
 * `execute` the Gemini loop uses, so permissions, read access, proposal
 * creation and the model-facing redaction are decided in exactly one place.
 */

/** Model requests per turn. */
export const GROQ_MAX_STEPS = 4;
/** Estimated tokens one turn may spend across all its requests (free tier: about 8k a minute). */
export const GROQ_TURN_TOKEN_BUDGET = 12_000;
const MAX_OUTPUT_TOKENS = 1024;
// Low on purpose: tool arguments should follow the question, not vary.
const TEMPERATURE = 0.2;

export type GroqAgentStopReason = "answered" | "proposal" | "step_cap" | "token_budget" | "empty" | "error";

export interface GroqAgentError {
  code: string;
  /** Fixed copy in the seller's language: never the provider's own text. */
  message: string;
  retryAfterSeconds: number | null;
  /** True when Groq was not called at all because the ledger says it is out of quota. */
  paused: boolean;
}

export interface GroqRejectedCall {
  name: string;
  reason: "not_offered" | "unknown_tool" | "bad_arguments";
}

export interface GroqAgentResult {
  text: string;
  /** Tool calls that were EXECUTED (refused ones are in `rejectedCalls`). */
  toolCalls: AgentResult["toolCalls"];
  rejectedCalls: GroqRejectedCall[];
  actionProposals: AiActionProposalToolResult[];
  actionProposal?: AiActionProposalToolResult;
  /** Summed from what Groq reported; a field Groq never sent stays absent. */
  usage: NeutralUsage;
  /** Our own estimate of the tokens this turn spent (the guard's number). */
  estimatedTokens: number;
  /** Model requests that completed. */
  steps: number;
  stopReason: GroqAgentStopReason;
  error?: GroqAgentError;
}

export interface GroqAgentDeps {
  /** The HTTP seam; tests pass a fake, production uses requestGroq. */
  request?: typeof requestGroq;
  ledger?: QuotaLedger;
  now?: () => Date;
  model?: string;
  retryDelayMs?: number;
  definitions?: () => ToolDefinition[];
}

export interface GroqAgentInput {
  apiKey: string;
  history: AgentMessage[];
  userMessage: string;
  locale?: AiChatLocale;
  context: ToolContext;
  shopContextNote?: string;
  deps?: GroqAgentDeps;
}

const NOTICE: Record<"step_cap" | "token_budget" | "empty", Record<AiChatLocale, string>> = {
  step_cap: {
    fr: "Je m'arrête après plusieurs recherches sans réponse complète. Précisez votre question et je continue.",
    en: "I stopped after several lookups without a complete answer. Narrow your question and I will continue.",
    ar: "توقفت بعد عدة عمليات بحث دون إجابة كاملة. وضّح سؤالك وسأتابع.",
  },
  token_budget: {
    fr: "La question demande trop de données pour la limite du plan gratuit de Groq, je m'arrête ici. Précisez votre question pour aller plus loin.",
    en: "This question needs more data than the free Groq limit allows, so I stop here. Narrow your question to go further.",
    ar: "السؤال يحتاج بيانات أكثر مما تسمح به حدود خطة Groq المجانية، لذلك أتوقف هنا. وضّح سؤالك للمتابعة.",
  },
  empty: {
    fr: "Le modèle n'a donné aucune réponse. Reformulez votre question.",
    en: "The model gave no answer. Rephrase your question.",
    ar: "لم يُقدّم النموذج أي إجابة. أعد صياغة سؤالك.",
  },
};

function joinText(buffered: string, text: string): string {
  return buffered ? `${buffered}\n${text}`.trim() : text;
}

export async function runGroqAgent(input: GroqAgentInput): Promise<GroqAgentResult> {
  const { apiKey, history, userMessage, context, shopContextNote } = input;
  const locale: AiChatLocale = input.locale ?? "fr";
  const deps = input.deps ?? {};
  const request = deps.request ?? requestGroq;
  const ledger = deps.ledger ?? quotaLedger;
  const now = deps.now ?? (() => new Date());

  const executed: AgentResult["toolCalls"] = [];
  const rejectedCalls: GroqRejectedCall[] = [];
  const proposals: AiActionProposalToolResult[] = [];
  const usage: NeutralUsage = {};
  let spent = 0;
  let steps = 0;
  let buffered = "";

  const finish = (stopReason: GroqAgentStopReason, text: string, error?: GroqAgentError): GroqAgentResult => ({
    text,
    toolCalls: executed,
    rejectedCalls,
    actionProposals: proposals,
    ...(proposals[0] ? { actionProposal: proposals[0] } : {}),
    usage,
    estimatedTokens: spent,
    steps,
    stopReason,
    ...(error ? { error } : {}),
  });

  const pause = ledger.isPaused("groq", now());
  if (pause.paused) {
    // Known to be out of quota: no call. Same ledger the extraction router reads.
    const left = pause.until ? Math.max(1, Math.ceil((pause.until.getTime() - now().getTime()) / 1000)) : null;
    const known = pause.retryAtKnown !== false ? left : null;
    return finish("error", "", {
      code: "GROQ_QUOTA_EXHAUSTED",
      message: groqErrorMessage(new GroqProviderError("GROQ_QUOTA_EXHAUSTED", "paused", 429, known), locale),
      retryAfterSeconds: known,
      paused: true,
    });
  }

  // The router chooses what is OFFERED; the loop below refuses anything else.
  const definitions = (deps.definitions ?? getAllToolDefinitions)();
  const route = selectToolsForQuestion({ question: userMessage, locale, history }, definitions);
  const offered = new Set(route.tools.map((tool) => tool.name));
  // Names the registry offers to the assistant at all (the router offers a subset). This loop never resolves a
  // tool from the registry itself: the proposal-bound source contract allows only the central agent and the MCP
  // surface to do that, and execution here always goes through agent.ts `execute`.
  const registered = new Set(definitions.map((definition) => definition.name));

  const slim = aiChatSystemPromptSlim(locale);
  const messages: NeutralMessage[] = [
    { role: "system", text: shopContextNote ? `${slim}\n\n${shopContextNote}` : slim },
    // Earlier tool results are not re-sent: the free plan cannot afford them.
    ...history
      .filter((entry) => entry.content.trim() !== "")
      .map((entry): NeutralMessage =>
        entry.role === "user"
          ? { role: "user", text: entry.content }
          : { role: "assistant", text: entry.content, toolCalls: [] },
      ),
    { role: "user", text: userMessage },
  ];

  for (let step = 1; step <= GROQ_MAX_STEPS; step += 1) {
    const body = buildChatCompletionsBody({
      messages,
      tools: route.tools,
      maxTokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
    });
    const requestTokens = estimateTokens(JSON.stringify(body));
    // The first request is always sent (the seller asked something); later ones
    // carry the tool results, so stop before paying for one that cannot fit.
    if (step > 1 && spent + requestTokens > GROQ_TURN_TOKEN_BUDGET) {
      return finish("token_budget", joinText(buffered, NOTICE.token_budget[locale]));
    }

    ledger.recordRequest("groq", now());
    let completion: Awaited<ReturnType<typeof requestGroq>>;
    try {
      completion = await request(apiKey, {
        body: body as unknown as Record<string, unknown>,
        ...(deps.model ? { model: deps.model } : {}),
        ...(deps.retryDelayMs !== undefined ? { retryDelayMs: deps.retryDelayMs } : {}),
      });
    } catch (error) {
      if (!(error instanceof GroqProviderError)) throw error;
      // Not retried here (requestGroq never retries a 429). A quota answer pauses Groq in the shared ledger.
      if (error.code === "GROQ_QUOTA_EXHAUSTED") {
        ledger.recordQuotaHit("groq", error.retryAfterSeconds ?? null, now());
      }
      return finish("error", buffered, {
        code: error.code,
        message: groqErrorMessage(error, locale),
        retryAfterSeconds: error.retryAfterSeconds ?? null,
        paused: false,
      });
    }

    steps = step;
    const reply = parseChatCompletion(completion.data);
    if (reply.usage?.promptTokens !== undefined) usage.promptTokens = (usage.promptTokens ?? 0) + reply.usage.promptTokens;
    if (reply.usage?.completionTokens !== undefined) usage.completionTokens = (usage.completionTokens ?? 0) + reply.usage.completionTokens;
    if (reply.usage?.totalTokens !== undefined) usage.totalTokens = (usage.totalTokens ?? 0) + reply.usage.totalTokens;
    const outputTokens = estimateTokens(reply.text + JSON.stringify(reply.toolCalls.map((c) => c.args)));
    spent += reply.usage?.totalTokens ?? requestTokens + outputTokens;
    // The model's own words are untrusted output: never let a key shape through.
    const text = scrubGroqSecrets(reply.text, apiKey);

    if (reply.toolCalls.length === 0) {
      const final = joinText(buffered, text);
      return final ? finish("answered", final) : finish("empty", NOTICE.empty[locale]);
    }

    if (text) buffered += text;
    messages.push({ role: "assistant", text, toolCalls: reply.toolCalls });

    for (const call of reply.toolCalls) {
      let result: unknown;
      if (!offered.has(call.name)) {
        // Not in THIS request's tool list: it never reaches `execute`, even when the registry knows the name.
        const known = registered.has(call.name);
        rejectedCalls.push({ name: call.name, reason: known ? "not_offered" : "unknown_tool" });
        result = known
          ? { error: `Tool '${call.name}' is not available in this request. Use only the tools provided.` }
          : { error: aiUnknownToolMessage(locale, call.name) };
      } else if (call.argsError) {
        rejectedCalls.push({ name: call.name, reason: "bad_arguments" });
        result = { error: call.argsError };
      } else {
        const outcome = await execute({ name: call.name, args: call.args }, context, locale);
        executed.push({ name: call.name, args: call.args, result: outcome.result });
        if (outcome.actionProposal) proposals.push(outcome.actionProposal);
        result = historySafeToolResult(call.name, outcome.result);
      }
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, result });
    }

    if (proposals[0]) {
      // A recorded proposal ends the turn, as in agent.ts: the seller approves it in the interface.
      return finish("proposal", proposalResponse(buffered, proposals[0], locale));
    }
  }

  return finish("step_cap", joinText(buffered, NOTICE.step_cap[locale]));
}
