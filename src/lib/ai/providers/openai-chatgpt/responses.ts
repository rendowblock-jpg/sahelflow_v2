/**
 * Responses API over a ChatGPT plan (preview rules: .../preview-limitations).
 * store:false, stream:true, array input, `instructions` (no system item), none
 * of the unsupported fields. Reads the SSE stream through response.completed.
 * 429, 401 and 403 are never retried; a connection failure or 502/503/504 is
 * retried once; a timeout is not.
 */
import { logger } from "@/lib/logger";
import {
  OpenAiProviderError, errorFromErrorObject, errorFromOpenAiResponse, scrubOpenAiSecrets,
} from "./errors";
import { RESOURCE } from "./oauth";

export const RESPONSES_URL = `${RESOURCE}/responses`;
export const MODELS_URL = `${RESOURCE}/models`;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRY_DELAY_MS = 600;

/** Fields the plan route rejects (preview-limitations.md). previous_response_id is also left out over HTTP. */
export const OPENAI_UNSUPPORTED_RESPONSE_FIELDS = [
  "background", "conversation", "max_output_tokens", "max_tool_calls", "metadata", "moderation", "multi_agent",
  "prompt", "prompt_cache_retention", "safety_identifier", "temperature", "top_logprobs", "top_p", "truncation", "user",
] as const;
const FORBIDDEN_FIELDS = new Set<string>([...OPENAI_UNSUPPORTED_RESPONSE_FIELDS, "previous_response_id"]);
// Hosted tools the route does not support are refused by allow-list.
const ALLOWED_TOOL_TYPES = new Set(["function", "custom", "namespace", "web_search"]);

export interface OpenAiInputItem { role?: string; type?: string; content?: unknown; [key: string]: unknown }
export interface OpenAiResponsesRequest {
  accessToken: string;
  model: string;
  instructions: string;
  input: string | OpenAiInputItem[];
  tools?: Array<{ type: string; [key: string]: unknown }>;
}
export interface OpenAiFunctionCall { callId: string; name: string; arguments: string }
export interface OpenAiResponsesResult {
  text: string;
  functionCalls: OpenAiFunctionCall[];
  usage?: Record<string, unknown>;
  model: string;
  responseId?: string;
  requestId?: string;
}
export interface OpenAiHttpDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  retryDelayMs?: number;
}

const invalid = (message: string) => new OpenAiProviderError("OPENAI_REQUEST_INVALID", message);

/** Throws if a request body carries a field or a system item this route rejects. */
export function assertResponsesBodyAllowed(body: Record<string, unknown>): void {
  for (const key of Object.keys(body)) if (FORBIDDEN_FIELDS.has(key)) throw invalid(`Field '${key}' is not supported on the ChatGPT plan route`);
  if (Array.isArray(body.input) && body.input.some((item) => (item as OpenAiInputItem)?.role === "system")) {
    throw invalid("System items are rejected; use `instructions`");
  }
}

function buildBody(request: OpenAiResponsesRequest): Record<string, unknown> {
  const input = typeof request.input === "string" ? [{ role: "user", content: request.input }] : request.input;
  for (const tool of request.tools ?? []) if (!ALLOWED_TOOL_TYPES.has(tool.type)) throw invalid(`Tool '${tool.type}' is not supported on the ChatGPT plan route`);
  // Built field by field, so nothing else can slip in.
  const body: Record<string, unknown> = {
    model: request.model, instructions: request.instructions, input, store: false, stream: true,
    ...(request.tools?.length ? { tools: request.tools } : {}),
  };
  assertResponsesBodyAllowed(body);
  return body;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(run: (attempt: number) => Promise<T>, deps: OpenAiHttpDeps, label: string, startedAt: number): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run(attempt);
    } catch (error) {
      const known = error instanceof OpenAiProviderError ? error : new OpenAiProviderError("OPENAI_PROVIDER_UNAVAILABLE", "OpenAI request failed");
      // Codes, status and ids only: never the message, the body or a token.
      logger.warn(`ai.openai.${label}_failed`, { attempt: attempt + 1, durationMs: Date.now() - startedAt, code: known.code, status: known.status, requestId: known.requestId });
      if (!(known.retryable && attempt === 0)) throw known;
      await (deps.sleep ?? defaultSleep)(deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    }
  }
}

async function fetchChecked(url: string, init: RequestInit, token: string, deps: OpenAiHttpDeps, controller: AbortController): Promise<Response> {
  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new OpenAiProviderError("OPENAI_TIMEOUT", "OpenAI did not answer in time");
    }
    throw new OpenAiProviderError("OPENAI_NETWORK_ERROR", "OpenAI could not be reached", { retryable: true });
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw errorFromOpenAiResponse(response.status, text, response.headers, [token]);
  }
  return response;
}

interface SseEvent { name: string; data: Record<string, unknown> }

async function* readEvents(response: Response): AsyncGenerator<SseEvent> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const event = parseBlock(block);
        if (event) yield event;
      }
    }
    const last = parseBlock(buffer + decoder.decode());
    if (last) yield last;
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

function parseBlock(block: string): SseEvent | null {
  let name = "";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!data.length || data.join("") === "[DONE]") return null;
  try {
    const parsed = JSON.parse(data.join("\n")) as Record<string, unknown>;
    return { name: typeof parsed.type === "string" ? parsed.type : name, data: parsed };
  } catch {
    return null;
  }
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function collect(output: unknown): { text: string; calls: OpenAiFunctionCall[] } {
  const calls: OpenAiFunctionCall[] = [];
  let text = "";
  for (const raw of Array.isArray(output) ? output : []) {
    const item = asRecord(raw);
    if (item.type === "function_call" && typeof item.name === "string") {
      calls.push({
        callId: String(item.call_id ?? item.id ?? ""), name: item.name,
        arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
      });
    } else if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        const p = asRecord(part);
        if (p.type === "output_text" && typeof p.text === "string") text += p.text;
      }
    }
  }
  return { text, calls };
}

async function readAnswer(response: Response, request: OpenAiResponsesRequest): Promise<OpenAiResponsesResult> {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  let deltas = "";
  const doneItems: unknown[] = [];
  let seen = 0;
  for await (const { name, data } of readEvents(response)) {
    seen += 1;
    if (name === "response.output_text.delta" && typeof data.delta === "string") deltas += data.delta;
    else if (name === "response.output_item.done") doneItems.push(data.item);
    else if (name === "response.failed") {
      throw errorFromErrorObject(asRecord(asRecord(data.response).error), { headers: response.headers, secrets: [request.accessToken], fallbackMessage: "The response failed" });
    } else if (name === "error") {
      throw errorFromErrorObject(asRecord(data.error ?? data), { headers: response.headers, secrets: [request.accessToken], fallbackMessage: "The stream reported an error" });
    } else if (name === "response.incomplete") {
      const reason = asRecord(asRecord(data.response).incomplete_details).reason;
      throw new OpenAiProviderError("OPENAI_PROVIDER_UNAVAILABLE", "The response was cut short", { requestId, upstreamCode: typeof reason === "string" ? reason : "incomplete" });
    } else if (name === "response.completed") {
      const done = asRecord(data.response);
      const fromOutput = collect(done.output);
      const useOutput = fromOutput.text !== "" || fromOutput.calls.length > 0;
      const fallback = collect(doneItems);
      return {
        text: useOutput ? fromOutput.text : deltas,
        functionCalls: useOutput ? fromOutput.calls : fallback.calls,
        usage: done.usage && typeof done.usage === "object" ? (done.usage as Record<string, unknown>) : undefined,
        model: typeof done.model === "string" ? done.model : request.model,
        responseId: typeof done.id === "string" ? done.id : undefined,
        requestId,
      };
    }
  }
  // Treat inference as successful only after response.completed.
  throw new OpenAiProviderError("OPENAI_NETWORK_ERROR", "The stream ended before response.completed", { requestId, retryable: seen === 0 });
}

export async function requestOpenAiResponses(request: OpenAiResponsesRequest, deps: OpenAiHttpDeps = {}): Promise<OpenAiResponsesResult> {
  const body = JSON.stringify(buildBody(request));
  const startedAt = Date.now();
  return withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetchChecked(RESPONSES_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${request.accessToken}`, "Content-Type": "application/json", Accept: "text/event-stream" },
        body,
      }, request.accessToken, deps, controller);
      try {
        return await readAnswer(response, request);
      } catch (error) {
        if (controller.signal.aborted) throw new OpenAiProviderError("OPENAI_TIMEOUT", "OpenAI did not finish in time");
        if (error instanceof OpenAiProviderError) throw error;
        throw new OpenAiProviderError("OPENAI_NETWORK_ERROR", scrubOpenAiSecrets("The stream was interrupted", request.accessToken));
      }
    } finally {
      clearTimeout(timer);
    }
  }, deps, "request", startedAt);
}

export interface OpenAiModelChoice { slug: string; displayName: string }

/** The signed-in account's own model list: visibility "list", in the server's order. */
export async function listOpenAiModels(accessToken: string, deps: OpenAiHttpDeps = {}): Promise<OpenAiModelChoice[]> {
  const startedAt = Date.now();
  return withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 15_000);
    try {
      const response = await fetchChecked(MODELS_URL, { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }, accessToken, deps, controller);
      const parsed = asRecord(await response.json().catch(() => ({})));
      const models = Array.isArray(parsed.models) ? parsed.models : [];
      return models.map(asRecord)
        .filter((m) => m.visibility === "list" && typeof m.slug === "string")
        .map((m) => ({ slug: String(m.slug), displayName: typeof m.display_name === "string" && m.display_name ? m.display_name : String(m.slug) }));
    } finally {
      clearTimeout(timer);
    }
  }, deps, "models", startedAt);
}
