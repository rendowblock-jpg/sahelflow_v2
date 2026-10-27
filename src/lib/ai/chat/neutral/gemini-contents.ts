/**
 * Conversion between neutral history and the Gemini `Content[]` shape that
 * agent.ts / session-history.ts build. Conversion only: nothing here sends a
 * request or touches the Gemini path; it proves a stored chat can be replayed
 * to another provider.
 */
import type { NeutralMessage, NeutralToolCall } from "./types";

export interface GeminiContentLike {
  role: string;
  parts: Array<Record<string, unknown>>;
}

/** The persisted/in-memory history item agent.ts accepts (structural copy of AgentMessage). */
export interface StoredAgentMessage {
  role: "user" | "assistant";
  content: string;
  imageCount?: number;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result: unknown;
    thoughtSignature?: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function visibleText(parts: Array<Record<string, unknown>>): string {
  return parts
    .filter((part) => typeof part.text === "string" && part.thought !== true)
    .map((part) => part.text as string)
    .join("\n");
}

export function geminiContentsToNeutral(contents: GeminiContentLike[]): NeutralMessage[] {
  const out: NeutralMessage[] = [];
  let counter = 0;
  // Calls of the latest model turn that still wait for their response.
  let pending: NeutralToolCall[] = [];

  for (const content of contents) {
    const parts = Array.isArray(content.parts) ? content.parts : [];
    if (content.role === "model") {
      const toolCalls: NeutralToolCall[] = [];
      for (const part of parts) {
        const call = part.functionCall;
        if (!isRecord(call) || typeof call.name !== "string") continue;
        const signature =
          typeof part.thoughtSignature === "string"
            ? part.thoughtSignature
            : typeof call.thoughtSignature === "string"
              ? call.thoughtSignature
              : undefined;
        toolCalls.push({
          id: `gemini_call_${counter++}`,
          name: call.name,
          args: isRecord(call.args) ? call.args : {},
          ...(signature ? { thoughtSignature: signature } : {}),
        });
      }
      pending = [...toolCalls]; // a copy: matching a response must not shrink the message
      out.push({ role: "assistant", text: visibleText(parts), toolCalls });
      continue;
    }

    const responses = parts.filter((part) => isRecord(part.functionResponse));
    if (responses.length > 0) {
      for (const part of responses) {
        const response = part.functionResponse as Record<string, unknown>;
        const name = typeof response.name === "string" ? response.name : "unknown";
        const index = pending.findIndex((call) => call.name === name);
        const matched = index >= 0 ? pending.splice(index, 1)[0]! : undefined;
        const body = response.response;
        out.push({
          role: "tool",
          toolCallId: matched?.id ?? `gemini_call_${counter++}`,
          name,
          result: isRecord(body) && "result" in body ? body.result : body,
        });
      }
      continue;
    }
    out.push({ role: "user", text: visibleText(parts) });
  }
  return out;
}

export function neutralToGeminiContents(messages: NeutralMessage[]): GeminiContentLike[] {
  const out: GeminiContentLike[] = [];
  for (const message of messages) {
    if (message.role === "system") continue; // Gemini carries the system text separately.
    if (message.role === "user") {
      out.push({ role: "user", parts: [{ text: message.text }] });
    } else if (message.role === "assistant") {
      const parts: Array<Record<string, unknown>> = message.text ? [{ text: message.text }] : [];
      for (const call of message.toolCalls) {
        parts.push({
          functionCall: { name: call.name, args: call.args },
          ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
        });
      }
      if (parts.length > 0) out.push({ role: "model", parts });
    } else {
      const part = {
        functionResponse: { name: message.name, response: { result: message.result } },
      };
      const last = out[out.length - 1];
      // Consecutive tool results share ONE user turn, as the live loop sends them.
      if (last && last.role === "user" && last.parts.every((p) => "functionResponse" in p)) {
        last.parts.push(part);
      } else {
        out.push({ role: "user", parts: [part] });
      }
    }
  }
  return out;
}

/**
 * Stored chat (agent.ts `AgentMessage[]`) -> neutral. `toolResult` is the
 * caller's filter for past results (agent.ts uses `historySafeToolResult`), so
 * what was withheld from Gemini stays withheld from any other provider.
 */
export function agentHistoryToNeutral(
  history: StoredAgentMessage[],
  options: { toolResult?: (name: string, result: unknown) => unknown } = {},
): NeutralMessage[] {
  const out: NeutralMessage[] = [];
  history.forEach((message, index) => {
    if (message.role === "assistant" && message.toolCalls?.length) {
      const calls = message.toolCalls.map((call, i) => ({
        id: `history_${index}_${i}`,
        name: call.name,
        args: call.args,
        ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
      }));
      out.push({ role: "assistant", text: message.content, toolCalls: calls });
      message.toolCalls.forEach((call, i) => {
        out.push({
          role: "tool",
          toolCallId: calls[i]!.id,
          name: call.name,
          result: options.toolResult ? options.toolResult(call.name, call.result) : call.result,
        });
      });
      return;
    }
    const imageNote =
      message.role === "user" && message.imageCount
        ? `[The seller attached ${message.imageCount} image(s) to this message.]`
        : "";
    const text = [message.content, imageNote].filter(Boolean).join("\n") || imageNote;
    out.push(
      message.role === "assistant"
        ? { role: "assistant", text, toolCalls: [] }
        : { role: "user", text },
    );
  });
  return out;
}
