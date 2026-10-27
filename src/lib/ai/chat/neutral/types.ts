/**
 * Provider-neutral chat shapes. The Groq (OpenAI-compatible) path and a
 * stored Gemini-shaped chat both convert to and from these; nothing here
 * decides what a tool may do (execution authority stays in agent.ts).
 */

export interface NeutralToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /**
   * Set when the provider's raw arguments were not a JSON object. The turn loop
   * answers the model with an error result instead of running the tool.
   */
  argsError?: string;
  /** Gemini 2.5/3 thinking models need this echoed back; other providers ignore it. */
  thoughtSignature?: string;
}

export type NeutralMessage =
  | { role: "system"; text: string }
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: NeutralToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; result: unknown };

export interface NeutralParameters {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
}

export interface NeutralTool {
  name: string;
  description: string;
  /** JSON schema restricted to what OpenAI-compatible providers accept. */
  parameters: NeutralParameters;
}

/** Only what the provider reported; absent fields stay absent (never estimated). */
export interface NeutralUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export type NeutralFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "other";

export interface NeutralResponse {
  text: string;
  toolCalls: NeutralToolCall[];
  usage?: NeutralUsage;
  finishReason: NeutralFinishReason;
}
