/** extractWithOpenAiPlan: same ExtractionResult contract as the Groq/Gemini readers; fetch is mocked. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { extractWithOpenAiPlan } from "../openai-extractor";
import { geminiModelVersion } from "../model-version";
import { extractionMethodLabelKey } from "@/components/inbox/extraction-ai-line";
import type { ExtractionInput } from "../types";

const INPUT: ExtractionInput = { body: "بغيت نشرى iPhone 14 ب 85000 دج، التوصيل ل Alger، رقمي 0661234567" };
const fetchSpy = vi.fn();
const stream = (text: string) => new Response(
  `event: response.completed\ndata: ${JSON.stringify({ response: { id: "r1", model: "m1", usage: { input_tokens: 9 }, output: [{ type: "message", content: [{ type: "output_text", text }] }] } })}\n\n`,
  { status: 200, headers: { "Content-Type": "text/event-stream" } });
beforeEach(() => { fetchSpy.mockReset(); vi.stubGlobal("fetch", fetchSpy); });
afterEach(() => vi.unstubAllGlobals());

describe("extractWithOpenAiPlan", () => {
  it("returns an openai-method order, canonicalised like the other readers", async () => {
    fetchSpy.mockResolvedValue(stream("```json\n" + JSON.stringify({ customerName: "Ahmed", phone: "+213 661 23 45 67", wilaya: "alger", items: [{ productName: "iPhone 14", quantity: "2" }] }) + "\n```"));
    const result = await extractWithOpenAiPlan(INPUT, { accessToken: "AT-1", model: "m1" });
    expect(result.method).toBe("openai");
    expect(result.order?.phone).toBe("0661234567");
    expect(result.order?.items).toEqual([{ productName: "iPhone 14", quantity: 2 }]);
    expect(result.raw).toMatchObject({ model: "m1" });
    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    expect(body).toMatchObject({ store: false, stream: true, model: "m1" });
    expect(typeof body.instructions).toBe("string");
    expect(body.input[0]).toMatchObject({ role: "user" });
  });
  it("failures return no order and the code in missingFields[0]", async () => {
    expect((await extractWithOpenAiPlan(INPUT, { accessToken: "", model: "m1" })).missingFields).toEqual(["OPENAI_TOKEN_EXPIRED"]);
    fetchSpy.mockResolvedValue(stream("not json"));
    expect((await extractWithOpenAiPlan(INPUT, { accessToken: "AT", model: "m1" })).missingFields).toEqual(["OPENAI_INVALID_EXTRACTION"]);
    fetchSpy.mockResolvedValue(stream(""));
    expect((await extractWithOpenAiPlan(INPUT, { accessToken: "AT", model: "m1" })).missingFields).toEqual(["OPENAI_EMPTY_RESPONSE"]);
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: { message: "slow down" } }), { status: 429, headers: { "retry-after": "90" } }));
    const quota = await extractWithOpenAiPlan(INPUT, { accessToken: "AT", model: "m1" });
    expect(quota).toMatchObject({ order: null, method: "none", missingFields: ["OPENAI_QUOTA_EXHAUSTED"], raw: { retryAfterSeconds: 90 } });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
  it("a plan that cannot be used and the plan usage limit give their own codes, once, and no invented delay", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: { code: "subscription_sharing_user_not_eligible" } }), { status: 403 }));
    const notEligible = await extractWithOpenAiPlan(INPUT, { accessToken: "AT", model: "m1" });
    expect(notEligible).toMatchObject({ order: null, method: "none", missingFields: ["OPENAI_PLAN_NOT_ELIGIBLE"] });
    expect(notEligible.raw).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: { code: "subscription_sharing_usage_limit_exceeded" } }), { status: 429, headers: { "retry-after": "90" } }));
    const limit = await extractWithOpenAiPlan(INPUT, { accessToken: "AT", model: "m1" });
    expect(limit.missingFields).toEqual(["OPENAI_QUOTA_EXHAUSTED"]);
    expect(limit.raw).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
  it("the shared consumers know the openai method", () => {
    expect(geminiModelVersion({ method: "openai", raw: { model: "m1" } }, "fallback")).toBe("m1");
    expect(extractionMethodLabelKey("openai")).toBe("methodOpenai");
  });
});
