import "server-only";

import { quotaLedger, type AiProviderId, type QuotaLedger } from "@/lib/ai/providers/quota-ledger";
import {
  runAgent,
  runAgentStream,
  type AgentMessage,
  type AgentResult,
  type AgentStreamEvent,
  type AgentUserImage,
} from "./agent";
import { runGroqAgent, type GroqAgentResult } from "./groq-agent";
import type { AiChatLocale } from "./locale-context";
import type { ToolContext } from "./tools/registry";

/**
 * Which AI answers a chat turn. Pure logic: the route reads the keys and the
 * seller's order and passes them in, so nothing here reads a secret, a
 * setting or the network.
 */

/** The providers chat can use today (chat on a ChatGPT plan is not built). */
export type ChatProviderId = Extract<AiProviderId, "gemini" | "groq">;
export type ChatNone = "no_key" | "images_need_gemini";

export interface ChooseChatProvidersInput {
  /** The seller's order, already parsed. Repeats and unknown names are tolerated. */
  order: readonly string[];
  geminiConfigured: boolean;
  groqApiKey?: string | null | undefined;
  hasImages: boolean;
  ledger?: Pick<QuotaLedger, "isPaused"> | undefined;
  now?: Date | undefined;
}

export interface ChatProviderChoice {
  chain: ChatProviderId[];
  none?: ChatNone;
}

export function chooseChatProviders(input: ChooseChatProvidersInput): ChatProviderChoice {
  const hasGroqKey = typeof input.groqApiKey === "string" && input.groqApiKey.trim() !== "";
  const ledger = input.ledger ?? quotaLedger;

  const candidates: ChatProviderId[] = [];
  for (const name of input.order) {
    if (candidates.includes(name as ChatProviderId)) continue;
    if (name === "gemini" && input.geminiConfigured) candidates.push("gemini");
    // Groq's text model cannot read images; "openai" and unknown names fall through.
    else if (name === "groq" && hasGroqKey && !input.hasImages) candidates.push("groq");
  }

  if (candidates.length === 0) {
    const none: ChatNone = hasGroqKey && input.hasImages && !input.geminiConfigured ? "images_need_gemini" : "no_key";
    return { chain: [], none };
  }

  const available = candidates.filter((id) => !ledger.isPaused(id, input.now).paused);
  // All paused: try them in order anyway; the first attempt gives the plain "limit reached" error.
  return { chain: available.length > 0 ? available : candidates };
}

/**
 * A Groq turn in the shape `runAgent` returns. The loop already scrubs keys
 * from its text and its error, so nothing is added or copied beyond these
 * four fields (no usage, no retry delay, no rejected calls).
 */
export function groqToAgentResult(result: GroqAgentResult): AgentResult {
  return {
    response: result.text,
    toolCalls: result.toolCalls,
    ...(result.actionProposal ? { actionProposal: result.actionProposal } : {}),
    ...(result.error ? { error: result.error.message } : {}),
  };
}

/**
 * A Groq turn as the events the stream route sends. Phase A of the Groq loop
 * has no token streaming: the whole answer arrives at once, so it becomes ONE
 * text_delta. `done` has no `signal` (Gemini-specific; absent means the UI
 * shows none). An error ends the turn INSTEAD of done.
 */
export function groqToStreamEvents(result: GroqAgentResult): AgentStreamEvent[] {
  const events: AgentStreamEvent[] = [];
  for (const call of result.toolCalls) {
    events.push({ type: "tool_call", name: call.name, args: call.args });
    events.push({ type: "tool_result", name: call.name, result: call.result });
  }
  if (result.actionProposal) events.push({ type: "action_proposal", proposal: result.actionProposal });
  if (result.text !== "") events.push({ type: "text_delta", text: result.text });
  if (result.error) {
    events.push({ type: "error", message: result.error.message, code: result.error.code });
  } else {
    events.push({
      type: "done",
      response: result.text,
      toolCalls: result.toolCalls,
      ...(result.actionProposal ? { actionProposal: result.actionProposal } : {}),
    });
  }
  return events;
}

// ---- running a turn ----

export interface ChatTurnInput {
  history: AgentMessage[];
  message: string;
  toolContext: ToolContext;
  locale?: AiChatLocale | undefined;
  shopContextNote?: string | undefined;
  /** The seller's order, already parsed (parseProviderOrder). */
  order: readonly string[];
  geminiConfigured: boolean;
  groqApiKey?: string | null | undefined;
  /** Images attached to this turn; may be empty. Only Gemini reads them. */
  images: AgentUserImage[];
  /** Stream only. */
  signal?: AbortSignal | undefined;
}

/** Every provider call is injectable, so tests never reach a network. */
export interface ChatTurnDeps {
  runGemini?: typeof runAgent;
  streamGemini?: typeof runAgentStream;
  runGroq?: typeof runGroqAgent;
  ledger?: Pick<QuotaLedger, "isPaused">;
  now?: () => Date;
}

/**
 * `provider` is the AI that produced this result, also when it is an error
 * (the last one tried); null when none could be tried. `errorCode` is set for
 * the "no AI" cases and for a Groq error (Gemini's error has no code here).
 */
export type ChatTurnResult = AgentResult & { provider: ChatProviderId | null; errorCode?: string };

/** What the stream generator RETURNS (read it with a manual `next()` loop, or `yield*`). */
export interface ChatTurnStreamEnd {
  provider: ChatProviderId | null;
}

const NONE_COPY: Record<ChatNone, { code: string; text: Record<AiChatLocale, string> }> = {
  no_key: {
    code: "AI_KEY_MISSING",
    text: {
      fr: "Aucune IA n'est configurée. Ajoutez une clé dans Paramètres → Intelligence artificielle.",
      en: "No AI is set up. Add a key in Settings → Artificial intelligence.",
      ar: "لم يتم إعداد أي ذكاء اصطناعي. أضف مفتاحًا من الإعدادات ← الذكاء الاصطناعي.",
    },
  },
  images_need_gemini: {
    code: "AI_IMAGES_NEED_GEMINI",
    text: {
      fr: "Seul Gemini lit les images. Ajoutez une clé Gemini ou envoyez le message sans image.",
      en: "Only Gemini reads images. Add a Gemini key or send the message without an image.",
      ar: "الصور يقرؤها Gemini فقط. أضف مفتاح Gemini أو أرسل الرسالة بدون صورة.",
    },
  },
};

function noneError(none: ChatNone, locale: AiChatLocale | undefined): { message: string; code: string } {
  const copy = NONE_COPY[none];
  return { message: copy.text[locale ?? "fr"] ?? copy.text.fr, code: copy.code };
}

function choose(input: ChatTurnInput, deps: ChatTurnDeps): ChatProviderChoice {
  return chooseChatProviders({
    order: input.order,
    geminiConfigured: input.geminiConfigured,
    groqApiKey: input.groqApiKey,
    hasImages: input.images.length > 0,
    ledger: deps.ledger,
    now: deps.now?.(),
  });
}

// A failed provider may be replaced by the next one only when nothing has
// happened yet: a tool already ran or a proposal was recorded means a second
// provider could repeat a write.
function failedCleanly(result: { toolCalls: unknown[]; actionProposal?: unknown }): boolean {
  return result.toolCalls.length === 0 && !result.actionProposal;
}

// `signal` is passed by the stream form only: it is the seller's Stop.
function groqInput(input: ChatTurnInput, signal?: AbortSignal) {
  return {
    ...(signal ? { signal } : {}),
    apiKey: input.groqApiKey ?? "",
    history: input.history,
    userMessage: input.message,
    context: input.toolContext,
    ...(input.locale ? { locale: input.locale } : {}),
    ...(input.shopContextNote !== undefined ? { shopContextNote: input.shopContextNote } : {}),
  };
}

/**
 * One chat turn. Providers are tried in the chosen order, none twice; the next
 * one is tried only after a failure with nothing done yet. The non-stream
 * Gemini call takes no images (runAgent has no image input): with images the
 * chain is Gemini only, exactly as the route calls it today.
 */
export async function runChatTurn(input: ChatTurnInput, deps: ChatTurnDeps = {}): Promise<ChatTurnResult> {
  const { chain, none } = choose(input, deps);
  if (none) {
    const { message, code } = noneError(none, input.locale);
    return { response: "", toolCalls: [], error: message, errorCode: code, provider: null };
  }
  const runGemini = deps.runGemini ?? runAgent;
  const runGroq = deps.runGroq ?? runGroqAgent;
  let last: ChatTurnResult = { response: "", toolCalls: [], provider: null };
  for (const [index, id] of chain.entries()) {
    const hasNext = index < chain.length - 1;
    if (id === "gemini") {
      const result = await runGemini(input.history, input.message, input.toolContext, input.locale, input.shopContextNote);
      last = { ...result, provider: "gemini" };
      if (!result.error || !hasNext || !failedCleanly(result)) return last;
    } else {
      const result = await runGroq(groqInput(input));
      last = { ...groqToAgentResult(result), ...(result.error ? { errorCode: result.error.code } : {}), provider: "groq" };
      if (result.stopReason !== "error" || !hasNext || !failedCleanly(result)) return last;
    }
  }
  return last;
}

/**
 * The streaming form. It yields plain AgentStreamEvent and RETURNS
 * `{ provider }` (the AI that produced the last event; null when none ran).
 * A `for await` loop does not see a return value: read it with a manual
 * `next()` loop. Gemini's events pass through untouched; its error is held
 * back only when it is the very first event and another provider is next.
 */
export async function* runChatTurnStream(
  input: ChatTurnInput,
  deps: ChatTurnDeps = {},
): AsyncGenerator<AgentStreamEvent, ChatTurnStreamEnd, undefined> {
  const { chain, none } = choose(input, deps);
  if (none) {
    const { message, code } = noneError(none, input.locale);
    yield { type: "error", message, code };
    return { provider: null };
  }
  const streamGemini = deps.streamGemini ?? runAgentStream;
  const runGroq = deps.runGroq ?? runGroqAgent;
  let held: AgentStreamEvent | null = null;
  let tried: ChatProviderId | null = null;
  for (const [index, id] of chain.entries()) {
    const hasNext = index < chain.length - 1;
    if (input.signal?.aborted) {
      // The seller stopped the turn: start nothing new, but do not end silently after a failure.
      if (held) yield held;
      return { provider: tried };
    }
    tried = id;
    held = null;
    if (id === "gemini") {
      let yielded = false;
      let dropped = false;
      for await (const event of streamGemini(
        input.history,
        input.message,
        input.signal,
        input.toolContext,
        input.locale,
        input.shopContextNote,
        input.images,
      )) {
        if (event.type === "error" && !yielded && hasNext) {
          held = event;
          dropped = true;
          break;
        }
        yielded = true;
        yield event;
      }
      if (!dropped) return { provider: "gemini" };
    } else {
      const result = await runGroq(groqInput(input, input.signal));
      const events = groqToStreamEvents(result);
      if (result.stopReason === "error" && hasNext && failedCleanly(result)) {
        held = events.at(-1) ?? null;
        continue;
      }
      for (const event of events) yield event;
      return { provider: "groq" };
    }
  }
  return { provider: tried };
}
