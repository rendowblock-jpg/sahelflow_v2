/**
 * Neutral <-> OpenAI-compatible chat-completions converters (Groq speaks this
 * wire format). Pure functions: no network, no registry state, no execution.
 */
import type { ToolDefinition } from "../tools/registry";
import type {
  NeutralFinishReason,
  NeutralMessage,
  NeutralParameters,
  NeutralResponse,
  NeutralTool,
  NeutralToolCall,
  NeutralUsage,
} from "./types";

export interface OpenAiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type OpenAiMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface OpenAiTool {
  type: "function";
  function: { name: string; description: string; parameters: NeutralParameters };
}

export interface ChatCompletionsBody {
  model?: string;
  messages: OpenAiMessage[];
  tools?: OpenAiTool[];
  tool_choice?: "auto";
  max_tokens: number;
  temperature?: number;
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A tool result as the text the model reads: never `undefined`, never a throw. */
function serializeToolResult(result: unknown): string {
  if (typeof result === "string") return result;
  if (result === undefined) return "null";
  try {
    return JSON.stringify(result) ?? "null";
  } catch {
    return JSON.stringify({ error: "Tool result could not be serialized." });
  }
}

function serializeArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args ?? {}) ?? "{}";
  } catch {
    return "{}";
  }
}

export function neutralToOpenAiMessages(messages: NeutralMessage[]): OpenAiMessage[] {
  return messages.map((message): OpenAiMessage => {
    if (message.role === "system" || message.role === "user") {
      return { role: message.role, content: message.text };
    }
    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        content: serializeToolResult(message.result),
      };
    }
    if (message.toolCalls.length === 0) {
      return { role: "assistant", content: message.text };
    }
    return {
      role: "assistant",
      // The API wants null (not "") next to tool calls when there is no text.
      content: message.text === "" ? null : message.text,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: serializeArgs(call.args) },
      })),
    };
  });
}

export function toolsToOpenAi(tools: NeutralTool[]): OpenAiTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function buildChatCompletionsBody(input: {
  messages: NeutralMessage[];
  tools: NeutralTool[];
  maxTokens: number;
  model?: string;
  temperature?: number;
}): ChatCompletionsBody {
  return {
    ...(input.model ? { model: input.model } : {}),
    messages: neutralToOpenAiMessages(input.messages),
    ...(input.tools.length > 0
      ? { tools: toolsToOpenAi(input.tools), tool_choice: "auto" as const }
      : {}),
    max_tokens: input.maxTokens,
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
  };
}

// ---- response -> neutral ---------------------------------------------------

const FINISH_REASONS: readonly NeutralFinishReason[] = [
  "stop",
  "length",
  "tool_calls",
  "content_filter",
];

function parseArguments(raw: unknown): { args: Json; error?: string } {
  if (raw === undefined || raw === null) return { args: {} };
  if (isRecord(raw)) return { args: raw };
  if (typeof raw !== "string") {
    return { args: {}, error: "Tool arguments must be a JSON object." };
  }
  if (raw.trim() === "") return { args: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      args: {},
      error: "Tool arguments must be a JSON object; the text was not valid JSON.",
    };
  }
  if (!isRecord(parsed)) {
    return {
      args: {},
      error: "Tool arguments must be a JSON object; received another JSON value.",
    };
  }
  return { args: parsed };
}

function readText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .join("");
  }
  return "";
}

function readUsage(raw: unknown): NeutralUsage | undefined {
  if (!isRecord(raw)) return undefined;
  const usage: NeutralUsage = {};
  if (typeof raw.prompt_tokens === "number") usage.promptTokens = raw.prompt_tokens;
  if (typeof raw.completion_tokens === "number") usage.completionTokens = raw.completion_tokens;
  if (typeof raw.total_tokens === "number") usage.totalTokens = raw.total_tokens;
  return Object.keys(usage).length > 0 ? usage : undefined;
}

export function parseChatCompletion(raw: unknown): NeutralResponse {
  const root = isRecord(raw) ? raw : {};
  const choice =
    Array.isArray(root.choices) && isRecord(root.choices[0]) ? root.choices[0] : {};
  const message = isRecord(choice.message) ? choice.message : {};

  const toolCalls: NeutralToolCall[] = [];
  if (Array.isArray(message.tool_calls)) {
    message.tool_calls.forEach((entry, index) => {
      if (!isRecord(entry) || !isRecord(entry.function)) return;
      const name = entry.function.name;
      if (typeof name !== "string" || name === "") return;
      const { args, error } = parseArguments(entry.function.arguments);
      toolCalls.push({
        id: typeof entry.id === "string" && entry.id !== "" ? entry.id : `call_${index}`,
        name,
        args,
        ...(error ? { argsError: error } : {}),
      });
    });
  }

  const finish = choice.finish_reason;
  const finishReason =
    FINISH_REASONS.find((reason) => reason === finish) ?? "other";
  const usage = readUsage(root.usage);
  return {
    text: readText(message.content),
    toolCalls,
    ...(usage ? { usage } : {}),
    finishReason,
  };
}

// ---- tool definitions -> OpenAI-compatible `parameters` ---------------------

/** Keywords OpenAI-compatible providers reject or ignore noisily. */
const STRIPPED_KEYWORDS = new Set(["format", "nullable", "$schema", "examples"]);
const JSON_TYPES = new Set(["string", "number", "integer", "boolean", "object", "array"]);
const COMBINATORS = ["anyOf", "oneOf", "allOf"] as const;

function resolveType(raw: unknown): string | undefined {
  const pick = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const lower = value.toLowerCase();
    return JSON_TYPES.has(lower) ? lower : undefined;
  };
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const type = pick(entry);
      if (type) return type;
    }
    return undefined;
  }
  return pick(raw);
}

function cleanNode(node: unknown): Json {
  const src = isRecord(node) ? node : {};
  const out: Json = {};
  for (const [key, value] of Object.entries(src)) {
    if (STRIPPED_KEYWORDS.has(key) || key === "type") continue;
    if (key === "properties" && isRecord(value)) {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, cleanNode(child)]),
      );
    } else if (key === "items") {
      out.items = cleanNode(Array.isArray(value) ? value[0] : value);
    } else if ((COMBINATORS as readonly string[]).includes(key) && Array.isArray(value)) {
      out[key] = value.map(cleanNode);
    } else if (key === "required") {
      if (Array.isArray(value)) out.required = value.filter((v) => typeof v === "string");
    } else {
      out[key] = value;
    }
  }

  const hasCombinator = COMBINATORS.some((key) => key in out);
  let type = resolveType(src.type);
  if (!type && !hasCombinator) {
    if (isRecord(out.properties)) type = "object";
    else if ("items" in out) type = "array";
    else if (Array.isArray(out.enum) && out.enum.length > 0 && out.enum.every((v) => typeof v === "number")) type = "number";
    else type = "string";
  }
  if (type === "array" && !isRecord(out.items)) out.items = { type: "string" };
  if (type === "object") {
    const names = isRecord(out.properties) ? Object.keys(out.properties) : [];
    if (Array.isArray(out.required)) {
      const kept = (out.required as string[]).filter((name) => names.includes(name));
      if (kept.length > 0) out.required = kept;
      else delete out.required;
    }
  } else {
    delete out.required;
  }
  return type ? { type, ...out } : out;
}

/** Copy of a definition's JSON schema that OpenAI-compatible providers accept. The input is never mutated. */
export function sanitizeParameters(parameters: unknown): NeutralParameters {
  const cleaned = cleanNode(isRecord(parameters) ? { ...parameters, type: "object" } : {});
  const properties = isRecord(cleaned.properties)
    ? (cleaned.properties as Record<string, Record<string, unknown>>)
    : {};
  const required = Array.isArray(cleaned.required) ? (cleaned.required as string[]) : undefined;
  return { type: "object", properties, ...(required ? { required } : {}) };
}

/** Problems that would make an OpenAI-compatible provider reject or misread `parameters`. Empty = valid. */
export function validateOpenAiParameters(parameters: unknown): string[] {
  const problems: string[] = [];
  const visit = (node: unknown, path: string, isRoot: boolean): void => {
    if (!isRecord(node)) {
      problems.push(`${path}: must be an object`);
      return;
    }
    for (const key of Object.keys(node)) {
      if (STRIPPED_KEYWORDS.has(key)) problems.push(`${path}: unsupported keyword '${key}'`);
    }
    const hasCombinator = COMBINATORS.some((key) => key in node);
    const type = node.type;
    if (typeof type !== "string") {
      if (!(hasCombinator && !isRoot)) {
        problems.push(`${path}: type must be a string (got ${Array.isArray(type) ? "array" : typeof type})`);
      }
    } else if (!JSON_TYPES.has(type)) {
      problems.push(`${path}: unknown type '${type}'`);
    }
    if (isRoot && type !== "object") problems.push(`${path}: root type must be 'object'`);
    if ("enum" in node && (!Array.isArray(node.enum) || node.enum.length === 0)) {
      problems.push(`${path}: enum must be a non-empty array`);
    }
    if ("properties" in node) {
      if (!isRecord(node.properties)) problems.push(`${path}: properties must be an object`);
      else {
        for (const [name, child] of Object.entries(node.properties)) {
          visit(child, `${path}.${name}`, false);
        }
      }
    } else if (isRoot) {
      problems.push(`${path}: root needs properties`);
    }
    if ("required" in node) {
      const names = isRecord(node.properties) ? Object.keys(node.properties) : [];
      if (!Array.isArray(node.required)) problems.push(`${path}: required must be an array`);
      else {
        for (const entry of node.required) {
          if (typeof entry !== "string" || !names.includes(entry)) {
            problems.push(`${path}: required '${String(entry)}' has no property`);
          }
        }
      }
    }
    if (type === "array") {
      if (!isRecord(node.items)) problems.push(`${path}: array needs items`);
      else visit(node.items, `${path}[]`, false);
    }
    for (const key of COMBINATORS) {
      const branches = node[key];
      if (Array.isArray(branches)) branches.forEach((b, i) => visit(b, `${path}.${key}[${i}]`, false));
    }
  };
  visit(parameters, "parameters", true);
  return problems;
}

export function definitionsToNeutral(definitions: ToolDefinition[]): NeutralTool[] {
  return definitions.map((definition) => ({
    name: definition.name,
    description: definition.description,
    parameters: sanitizeParameters(definition.parameters),
  }));
}
