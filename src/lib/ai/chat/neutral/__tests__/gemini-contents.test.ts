/** Neutral history <-> the Gemini Content[] shape agent.ts builds (conversion only; nothing is sent). */
import { describe, expect, it } from "vitest";

import { agentHistoryToNeutral, geminiContentsToNeutral, neutralToGeminiContents } from "../gemini-contents";
import { neutralToOpenAiMessages } from "../openai-compat";

const MODEL_CALLS = {
  role: "model",
  parts: [
    { text: "Checking" },
    { functionCall: { name: "search_orders", args: { status: "pending" } }, thoughtSignature: "sig-1" },
    { functionCall: { name: "get_stats", args: {} } },
  ],
};
const USER_RESPONSES = {
  role: "user",
  parts: [
    { functionResponse: { name: "search_orders", response: { result: { count: 2 } } } },
    { functionResponse: { name: "get_stats", response: { result: { revenue: 10 } } } },
  ],
};

describe("geminiContentsToNeutral / neutralToGeminiContents", () => {
  it("round-trips plain text turns", () => {
    const contents = [{ role: "user", parts: [{ text: "hello" }] }, { role: "model", parts: [{ text: "hi" }] }];
    const neutral = geminiContentsToNeutral(contents);
    expect(neutral).toEqual([{ role: "user", text: "hello" }, { role: "assistant", text: "hi", toolCalls: [] }]);
    expect(neutralToGeminiContents(neutral)).toEqual(contents);
  });
  it("pairs a model turn with 2 function calls with the following function responses and keeps thoughtSignature", () => {
    const neutral = geminiContentsToNeutral([{ role: "user", parts: [{ text: "q" }] }, MODEL_CALLS, USER_RESPONSES]);
    expect(neutral[1]).toMatchObject({ role: "assistant", text: "Checking" });
    const calls = (neutral[1] as { toolCalls: Array<{ id: string; name: string; thoughtSignature?: string }> }).toolCalls;
    expect(calls.map((c) => c.name)).toEqual(["search_orders", "get_stats"]);
    expect(calls[0]!.thoughtSignature).toBe("sig-1");
    expect(neutral[2]).toEqual({ role: "tool", toolCallId: calls[0]!.id, name: "search_orders", result: { count: 2 } });
    expect(neutral[3]).toEqual({ role: "tool", toolCallId: calls[1]!.id, name: "get_stats", result: { revenue: 10 } });
    expect(neutralToGeminiContents(neutral)).toEqual([{ role: "user", parts: [{ text: "q" }] }, MODEL_CALLS, USER_RESPONSES]);
  });
  it("omits the text part when the assistant text is empty and drops system messages and thought parts", () => {
    const out = neutralToGeminiContents([
      { role: "system", text: "sys" },
      { role: "assistant", text: "", toolCalls: [{ id: "a", name: "get_stats", args: {} }] },
      { role: "tool", toolCallId: "a", name: "get_stats", result: { ok: true } },
    ]);
    expect(out).toEqual([
      { role: "model", parts: [{ functionCall: { name: "get_stats", args: {} } }] },
      { role: "user", parts: [{ functionResponse: { name: "get_stats", response: { result: { ok: true } } } }] },
    ]);
    const neutral = geminiContentsToNeutral([{ role: "model", parts: [{ text: "secret thinking", thought: true }, { text: "answer" }] }]);
    expect(neutral).toEqual([{ role: "assistant", text: "answer", toolCalls: [] }]);
  });
});

describe("agentHistoryToNeutral: a stored Gemini-shaped chat replays to Groq", () => {
  const history = [
    { role: "user" as const, content: "commandes en attente ?" },
    { role: "assistant" as const, content: "", toolCalls: [
      { name: "search_orders", args: { status: "pending" }, result: { count: 2 }, thoughtSignature: "s" },
      { name: "get_stats", args: {}, result: { revenue: 10 } },
    ] },
    { role: "assistant" as const, content: "2 commandes en attente." },
    { role: "user" as const, content: "", imageCount: 2 },
  ];
  it("makes assistant + one tool message per call, with unique ids, and the caller's result filter", () => {
    const neutral = agentHistoryToNeutral(history, { toolResult: (name, value) => ({ safe: name, value }) });
    expect(neutral.map((m) => m.role)).toEqual(["user", "assistant", "tool", "tool", "assistant", "user"]);
    const ids = neutral.filter((m) => m.role === "tool").map((m) => (m as { toolCallId: string }).toolCallId);
    expect(new Set(ids).size).toBe(2);
    expect(neutral[2]).toMatchObject({ result: { safe: "search_orders", value: { count: 2 } } });
    expect(neutral[5]).toEqual({ role: "user", text: "[The seller attached 2 image(s) to this message.]" });
  });
  it("produces an OpenAI-compatible message list where every tool_call_id has its tool message", () => {
    const out = neutralToOpenAiMessages(agentHistoryToNeutral(history));
    const asked = out.flatMap((m) => ("tool_calls" in m && m.tool_calls ? m.tool_calls.map((c) => c.id) : []));
    const answered = out.filter((m) => m.role === "tool").map((m) => ("tool_call_id" in m ? m.tool_call_id : ""));
    expect(asked.length).toBe(2);
    expect(answered).toEqual(asked);
  });
});
