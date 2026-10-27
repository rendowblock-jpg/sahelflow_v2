/** Neutral <-> OpenAI-compatible chat-completions converters (pure; no network). */
import { describe, expect, it } from "vitest";

import {
  buildChatCompletionsBody,
  neutralToOpenAiMessages,
  parseChatCompletion,
  toolsToOpenAi,
} from "../openai-compat";
import type { NeutralMessage, NeutralTool } from "../types";

const TOOL: NeutralTool = {
  name: "search_orders",
  description: "Search orders",
  parameters: { type: "object", properties: { status: { type: "string", description: "status" } }, required: ["status"] },
};

describe("buildChatCompletionsBody", () => {
  it("wraps tools as functions, sets tool_choice auto and max_tokens", () => {
    const body = buildChatCompletionsBody({
      messages: [{ role: "system", text: "sys" }, { role: "user", text: "hi" }],
      tools: [TOOL],
      maxTokens: 700,
    });
    expect(body.messages).toEqual([{ role: "system", content: "sys" }, { role: "user", content: "hi" }]);
    expect(body.tools).toEqual([{ type: "function", function: { name: "search_orders", description: "Search orders", parameters: TOOL.parameters } }]);
    expect(body.tool_choice).toBe("auto");
    expect(body.max_tokens).toBe(700);
  });
  it("omits tools and tool_choice when there are no tools", () => {
    const body = buildChatCompletionsBody({ messages: [{ role: "user", text: "hi" }], tools: [], maxTokens: 100 });
    expect("tools" in body).toBe(false);
    expect("tool_choice" in body).toBe(false);
  });
  it("toolsToOpenAi keeps one entry per tool in order", () => {
    expect(toolsToOpenAi([TOOL, { ...TOOL, name: "b" }]).map((t) => t.function.name)).toEqual(["search_orders", "b"]);
  });
});

describe("neutralToOpenAiMessages", () => {
  it("maps an assistant message with 2 tool calls and the matching tool results", () => {
    const messages: NeutralMessage[] = [
      { role: "user", text: "pending orders and stock?" },
      { role: "assistant", text: "", toolCalls: [
        { id: "c1", name: "search_orders", args: { status: "pending" } },
        { id: "c2", name: "get_low_stock_products", args: {} },
      ] },
      { role: "tool", toolCallId: "c1", name: "search_orders", result: { count: 2 } },
      { role: "tool", toolCallId: "c2", name: "get_low_stock_products", result: "none" },
    ];
    const out = neutralToOpenAiMessages(messages);
    expect(out[1]).toEqual({
      role: "assistant",
      content: null, // empty text with tool calls -> null content, as the API expects
      tool_calls: [
        { id: "c1", type: "function", function: { name: "search_orders", arguments: '{"status":"pending"}' } },
        { id: "c2", type: "function", function: { name: "get_low_stock_products", arguments: "{}" } },
      ],
    });
    expect(out[2]).toEqual({ role: "tool", tool_call_id: "c1", content: '{"count":2}' });
    expect(out[3]).toEqual({ role: "tool", tool_call_id: "c2", content: "none" });
  });
  it("keeps text next to tool calls and never emits tool_calls: [] for a plain assistant message", () => {
    const out = neutralToOpenAiMessages([
      { role: "assistant", text: "Let me look", toolCalls: [{ id: "c1", name: "a", args: {} }] },
      { role: "assistant", text: "done", toolCalls: [] },
    ]);
    expect(out[0]).toMatchObject({ content: "Let me look" });
    expect(out[1]).toEqual({ role: "assistant", content: "done" });
  });
  it("serializes an undefined tool result as null text, never undefined", () => {
    const out = neutralToOpenAiMessages([{ role: "tool", toolCallId: "c", name: "a", result: undefined }]);
    expect(out[0]).toEqual({ role: "tool", tool_call_id: "c", content: "null" });
  });
});

describe("parseChatCompletion", () => {
  const completion = (message: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    choices: [{ message, finish_reason: "stop" }],
    ...extra,
  });
  it("reads text, usage and finish reason", () => {
    const r = parseChatCompletion({
      choices: [{ message: { content: "Bonjour" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 },
    });
    expect(r).toEqual({ text: "Bonjour", toolCalls: [], usage: { promptTokens: 120, completionTokens: 8, totalTokens: 128 }, finishReason: "stop" });
  });
  it("parses 2 tool calls with JSON arguments and keeps null content as empty text", () => {
    const r = parseChatCompletion({
      choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [
        { id: "x1", type: "function", function: { name: "search_orders", arguments: '{"status":"pending"}' } },
        { id: "x2", type: "function", function: { name: "get_stats", arguments: "" } },
      ] } }],
    });
    expect(r.text).toBe("");
    expect(r.finishReason).toBe("tool_calls");
    expect(r.toolCalls).toEqual([
      { id: "x1", name: "search_orders", args: { status: "pending" } },
      { id: "x2", name: "get_stats", args: {} },
    ]);
  });
  it("turns malformed arguments into an argsError on the call, never a throw", () => {
    const r = parseChatCompletion(completion({ content: "", tool_calls: [
      { id: "m1", type: "function", function: { name: "search_orders", arguments: '{"status": "pend' } },
      { id: "m2", type: "function", function: { name: "search_orders", arguments: "[1,2]" } },
      { id: "m3", type: "function", function: { name: "search_orders", arguments: "5" } },
    ] }));
    expect(r.toolCalls).toHaveLength(3);
    for (const call of r.toolCalls) {
      expect(call.args).toEqual({});
      expect(call.argsError).toMatch(/JSON object/i);
    }
  });
  it("gives a call without an id a stable generated id, and skips entries without a name", () => {
    const r = parseChatCompletion(completion({ tool_calls: [
      { type: "function", function: { name: "a", arguments: "{}" } },
      { type: "function", function: { arguments: "{}" } },
      { type: "function", function: { name: "b", arguments: "{}" } },
    ] }));
    expect(r.toolCalls.map((c) => [c.id, c.name])).toEqual([["call_0", "a"], ["call_2", "b"]]);
  });
  it("survives an empty or odd body and maps unknown finish reasons to other", () => {
    expect(parseChatCompletion({})).toEqual({ text: "", toolCalls: [], finishReason: "other" });
    expect(parseChatCompletion({ choices: [{ message: { content: "x" }, finish_reason: "weird" }] }).finishReason).toBe("other");
    expect(parseChatCompletion({ choices: [{ message: { content: "x" }, finish_reason: "length" }] }).finishReason).toBe("length");
  });
  it("round-trips: an assistant message sent out parses back to the same tool calls", () => {
    const sent = neutralToOpenAiMessages([{ role: "assistant", text: "", toolCalls: [
      { id: "r1", name: "search_orders", args: { status: "pending", limit: 5 } },
      { id: "r2", name: "get_stats", args: {} },
    ] }]);
    const back = parseChatCompletion({ choices: [{ message: sent[0] as Record<string, unknown>, finish_reason: "tool_calls" }] });
    expect(back.toolCalls).toEqual([
      { id: "r1", name: "search_orders", args: { status: "pending", limit: 5 } },
      { id: "r2", name: "get_stats", args: {} },
    ]);
  });
});
