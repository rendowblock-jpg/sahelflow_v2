/**
 * The live Groq golden harness: pacer, 429 stop, token budget, resume, report math, holdout rule, key hygiene.
 * No network: fetch is mocked in every test and the clock is a fake that only moves when the code sleeps.
 */
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import type { GoldenEntry } from "../golden-set";
import { type LiveRecord, orderEntries, onlyIds, parseIdsFile, readAllLines, runGroqSlice } from "../live-groq";
import { buildLiveReport, formatAggregates, formatMarkdown, writeLiveReport } from "../live-report";

const KEY = ["gsk", "_", "FakeFakeFakeFakeFakeFake1234567890"].join("");
const fetchSpy = vi.fn();
let queue: Array<() => Response> = [];
let dir = "";

const entry = (id: string, language: GoldenEntry["language"], text: string, expected: GoldenEntry["expected"]): GoldenEntry => ({
  id, language, source: expected.isOrder ? "whatsapp-order" : "not-an-order", text, expected,
});
// Odd trailing number = dev, even = holdout (split.ts).
const E1 = entry("T-AR-001", "ar", "ahmed 2 iphone 0661234567", { isOrder: true, productName: "iphone", quantity: 2, phone: "0661234567" });
const E2 = entry("T-FR-002", "fr", "Bonjour", { isOrder: false });
const E3 = entry("T-FR-003", "fr", "je veux une robe 0555123456", { isOrder: true, productName: "robe", quantity: 1, phone: "0555123456" });
const E4 = entry("T-AR-004", "ar", "salam 3 sac", { isOrder: true, productName: "sac", quantity: 3 });
const FOUR = [E1, E2, E3, E4];

const ANSWER = '{"items":[{"productName":"x","quantity":1}]}';
function reply(options: { status?: number; content?: string; prompt?: number; completion?: number; remaining?: number; reset?: number; retryAfter?: number } = {}): Response {
  const { status = 200, content = ANSWER, prompt = 3400, completion = 100, remaining, reset, retryAfter } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (remaining !== undefined) headers["x-ratelimit-remaining-tokens"] = String(remaining);
  if (reset !== undefined) headers["x-ratelimit-reset-tokens"] = `${reset}s`;
  if (retryAfter !== undefined) headers["retry-after"] = String(retryAfter);
  const body = status === 200
    ? { choices: [{ message: { content } }], usage: { prompt_tokens: prompt, completion_tokens: completion }, model: "qwen/qwen3.8-27b" }
    : { error: { message: "Rate limit reached", type: "tokens", code: "rate_limit_exceeded" } };
  return new Response(JSON.stringify(body), { status, headers });
}
const next = (...responses: Array<() => Response>) => queue.push(...responses);
const asked = () => fetchSpy.mock.calls.map((call) => String((JSON.parse(String((call[1] as { body: string }).body)) as { messages: Array<{ content: string }> }).messages[1]?.content));

function clock() {
  const c = { t: 1_800_000_000_000, slept: [] as number[], fetchedAt: [] as number[] };
  return { c, now: () => c.t, sleep: async (ms: number) => { c.slept.push(ms); c.t += ms; } };
}

beforeEach(() => {
  queue = [];
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(async () => (queue.shift() ?? (() => reply({ remaining: 6000, reset: 1 })))());
  vi.stubGlobal("fetch", fetchSpy);
  dir = mkdtempSync(join(tmpdir(), "golden-live-groq-test-"));
});
afterEach(() => vi.unstubAllGlobals());

describe("pacer", () => {
  it("waits for the reset Groq named when the minute window is low, then proceeds", async () => {
    const { c, now, sleep } = clock();
    fetchSpy.mockImplementation(async () => { c.fetchedAt.push(c.t); return (queue.shift() ?? (() => reply()))(); });
    next(() => reply({ remaining: 1000, reset: 20 }), () => reply({ remaining: 4400, reset: 50 }), () => reply({ remaining: 900, reset: 5 }));
    const summary = await runGroqSlice({ entries: [E1, E2, E3], apiKey: KEY, dir, now, sleep });
    expect(summary.calls).toBe(3);
    // After call 1 (1,000 left < 4,000): 20 s reset + 250 ms margin. After call 2 (4,400 left): no wait.
    expect(c.slept).toEqual([20_250]);
    expect(c.fetchedAt.slice(1).map((at, i) => at - (c.fetchedAt[i] ?? 0))).toEqual([20_250, 0]);
  });

  it("uses a fixed gap when Groq sent no budget header", async () => {
    const { c, now, sleep } = clock();
    next(() => reply(), () => reply());
    await runGroqSlice({ entries: [E1, E2], apiKey: KEY, dir, now, sleep, fallbackGapMs: 7_000 });
    expect(c.slept).toEqual([7_000]);
  });
});

describe("quota stop", () => {
  it("stops at the first 429 without a retry and leaves that id to be asked again", async () => {
    const { now, sleep, c } = clock();
    next(() => reply({ remaining: 6000, reset: 1 }), () => reply({ status: 429, remaining: 0, reset: 40, retryAfter: 40 }));
    const summary = await runGroqSlice({ entries: FOUR, apiKey: KEY, dir, now, sleep });
    expect(summary.stopped).toBe("quota");
    expect(fetchSpy).toHaveBeenCalledTimes(2); // call 2 answered 429, nothing was fired after it
    expect(c.slept).toEqual([]);
    const lines = readAllLines(dir);
    expect(lines.map((l) => [l.kind, l.code])).toEqual([["ok", undefined], ["infra", "GROQ_QUOTA_EXHAUSTED"]]);

    fetchSpy.mockClear();
    next(() => reply({ remaining: 6000, reset: 1 }), () => reply({ remaining: 6000, reset: 1 }), () => reply({ remaining: 6000, reset: 1 }));
    const second = await runGroqSlice({ entries: FOUR, apiKey: KEY, dir, now, sleep });
    expect(second.alreadyDone).toBe(1);
    expect(second.calls).toBe(3);
    expect(asked()[0]).toContain(E2.text); // the 429 id came first
  });
});

describe("token budget", () => {
  it("stops cleanly before a call that could pass the budget", async () => {
    const { now, sleep } = clock();
    const summary = await runGroqSlice({ entries: FOUR, apiKey: KEY, dir, now, sleep, tokenBudget: 10_000 });
    // 3,500 per call: 0+4,000 and 3,500+4,000 fit, 7,000+4,000 does not.
    expect(summary.stopped).toBe("budget");
    expect(summary.calls).toBe(2);
    expect(summary.tokensTotal).toBe(7_000);
    expect(summary.tokensTotal).toBeLessThanOrEqual(10_000);
  });

  it("counts the tokens already in the file on a re-run", async () => {
    const { now, sleep } = clock();
    await runGroqSlice({ entries: FOUR, apiKey: KEY, dir, now, sleep, tokenBudget: 10_000 });
    fetchSpy.mockClear();
    const again = await runGroqSlice({ entries: FOUR, apiKey: KEY, dir, now, sleep, tokenBudget: 10_000 });
    expect(again.stopped).toBe("budget");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("resume and slices", () => {
  it("skips ids already answered and honours the call limit", async () => {
    const { now, sleep } = clock();
    const first = await runGroqSlice({ entries: FOUR, apiKey: KEY, dir, now, sleep, limit: 2 });
    expect(first).toMatchObject({ stopped: "limit", calls: 2, alreadyDone: 0, remaining: 2 });
    fetchSpy.mockClear();
    const second = await runGroqSlice({ entries: FOUR, apiKey: KEY, dir, now, sleep });
    expect(second).toMatchObject({ stopped: "finished", calls: 2, alreadyDone: 2, remaining: 0 });
    expect(asked().map((body) => FOUR.slice(2).filter((e) => body.includes(e.text)).length)).toEqual([1, 1]);
    expect(readAllLines(dir)).toHaveLength(4);
  });

  it("puts holdout answers in their own file", async () => {
    const { now, sleep } = clock();
    await runGroqSlice({ entries: FOUR, apiKey: KEY, dir, now, sleep });
    expect(readdirSync(dir).sort()).toEqual(["answers-dev.jsonl", "answers-holdout.jsonl"]);
    const holdout = readFileSync(join(dir, "answers-holdout.jsonl"), "utf8").trim().split("\n").map((l) => (JSON.parse(l) as LiveRecord).id);
    expect(holdout).toEqual(["T-FR-002", "T-AR-004"]);
  });

  it("orders interleaved (both halves, languages spread), dev-first, and reads an ids file", () => {
    expect(orderEntries(FOUR, "interleaved").map((e) => e.id)).toEqual(["T-AR-001", "T-FR-002", "T-FR-003", "T-AR-004"]);
    expect(orderEntries(FOUR, "dev-first").map((e) => e.id)).toEqual(["T-AR-001", "T-FR-003", "T-FR-002", "T-AR-004"]);
    expect(parseIdsFile("# slice 1\nT-AR-001, T-FR-003\nT-AR-004\n")).toEqual(["T-AR-001", "T-FR-003", "T-AR-004"]);
    expect(onlyIds(FOUR, ["T-FR-003", "T-AR-001"]).map((e) => e.id)).toEqual(["T-AR-001", "T-FR-003"]);
    expect(() => onlyIds(FOUR, ["T-XX-999"])).toThrow(/not in the golden set/);
  });
});

describe("report", () => {
  const rec = (id: string, kind: LiveRecord["kind"], at: number, latencyMs: number, extra: Partial<LiveRecord> = {}): LiveRecord => ({
    id, kind, at: new Date(1_800_000_000_000 + at).toISOString(), latencyMs, ...extra,
  });
  const tokens = { promptTokens: 3400, completionTokens: 100 };
  const FIXTURE_ENTRIES = [E1, E2, E3, entry("T-AR-005", "ar", "salam 1 sac 0661111111", { isOrder: true, productName: "sac", quantity: 1, phone: "0661111111" }), entry("T-AR-006", "ar", "salam 1 sac", { isOrder: true, productName: "sac", quantity: 1 }), entry("T-FR-007", "fr", "Bonjour", { isOrder: false })];
  const lines: LiveRecord[] = [
    rec("T-AR-001", "ok", 1, 1000, { ...tokens, order: { items: [{ productName: "iphone", quantity: 3 }], phone: "0661234567" } }),
    rec("T-FR-002", "ok", 2, 5000, { ...tokens, order: { items: [] } }),
    rec("T-FR-003", "ok", 3, 2000, { ...tokens, order: { items: [{ productName: "robe", quantity: 1 }], phone: "0555123456" } }),
    rec("T-AR-005", "infra", 4, 9000, { code: "GROQ_TIMEOUT" }),
    rec("T-AR-006", "unusable", 5, 4000, { ...tokens, code: "GROQ_INVALID_EXTRACTION" }),
    rec("T-AR-005", "infra", 6, 9000, { code: "GROQ_TIMEOUT" }),
  ] as LiveRecord[];
  // T-FR-007 was never asked.

  it("computes the numbers by hand on a tiny fixture, live next to offline on the same ids", () => {
    const report = buildLiveReport(lines, FIXTURE_ENTRIES, "2026-10-25T00:00:00.000Z");
    // Dev (odd): AR-001 ok, FR-003 ok, AR-005 infra (twice, counted once), FR-007 not asked. Holdout (even): FR-002 ok, AR-006 unusable.
    expect(report.dev).toMatchObject({ entries: 4, answered: 2, infraErrors: 1, notAsked: 1, unusable: 0, orders: 2, notOrders: 0 });
    expect(report.holdout).toMatchObject({ entries: 2, answered: 1, infraErrors: 0, notAsked: 0, unusable: 1, orders: 0, notOrders: 1 });
    // Live, dev: both are orders (2/2); AR-001 quantity 3 not 2 -> product+quantity 1/2; phones 2/2; AR-001 has a critical error.
    expect(report.dev.live.fields.isOrder).toMatchObject({ correct: 2, total: 2 });
    expect(report.dev.live.fields.productAndQuantity).toMatchObject({ correct: 1, total: 2, accuracy: 0.5 });
    expect(report.dev.live.fields.phone).toMatchObject({ correct: 2, total: 2 });
    expect(report.dev.live.criticalEntries).toBe(1);
    expect(report.dev.live.fullyCorrectEntries).toBe(1);
    expect(report.dev.live.byLanguage.ar?.productAndQuantity).toMatchObject({ correct: 0, total: 1 });
    expect(report.dev.live.byLanguage.fr?.productAndQuantity).toMatchObject({ correct: 1, total: 1 });
    // Holdout: one not-an-order message, answered "no order": isOrder 1/1.
    expect(report.holdout.live.fields.isOrder).toMatchObject({ correct: 1, total: 1 });
    // The offline reader is scored on exactly the same ids: same denominators, never the infra or unasked ones.
    expect(report.dev.offline.fields.isOrder?.total).toBe(2);
    expect(report.dev.offline.fields.productAndQuantity?.total).toBe(2);
    expect(report.holdout.offline.fields.isOrder?.total).toBe(1);
    // Four calls were answered (infra excluded): 1000, 5000, 2000 and 4000 -> sorted 1000, 2000, 4000, 5000: p50 = [2], p90 = [3].
    expect(report.latencyMs).toEqual({ calls: 4, p50: 4000, p90: 5000, max: 5000 });
    // Four lines carry tokens: 4 x (3,400 + 100) = 14,000, 3,500 each.
    expect(report.tokens).toEqual({ prompt: 13_600, completion: 400, total: 14_000, perCall: 3_500 });
    expect(report.calls).toBe(6);
    expect(report.infraErrorsByCode).toEqual({ GROQ_TIMEOUT: 1 });
  });

  it("never carries a holdout id, text or answer, and prints no id at all", () => {
    const report = buildLiveReport(lines, FIXTURE_ENTRIES);
    const holdoutIds = FIXTURE_ENTRIES.filter((e) => Number(/(\d+)$/.exec(e.id)?.[1]) % 2 === 0).map((e) => e.id);
    expect(report.holdout.failureShapes).toBeUndefined();
    const everything = [JSON.stringify(report.holdout), formatAggregates(report)].join("\n");
    for (const id of holdoutIds) expect(everything).not.toContain(id);
    expect(formatAggregates(report)).not.toMatch(/T-[A-Z]+-\d+/);
    // The evidence markdown may name DEV ids (failure shapes) but still no holdout id.
    expect(formatMarkdown(report)).toContain("T-AR-001");
    for (const id of holdoutIds) expect(formatMarkdown(report)).not.toContain(id);
  });

  it("run + report print no holdout id and no message text", async () => {
    const { now, sleep } = clock();
    const printed: string[] = [];
    const sinks = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    try {
      await runGroqSlice({ entries: FOUR, apiKey: KEY, dir, now, sleep, log: (line) => printed.push(line) });
      printed.push(formatAggregates(buildLiveReport(readAllLines(dir), FOUR)));
    } finally {
      for (const sink of sinks) {
        printed.push(...sink.mock.calls.map((call) => call.join(" ")));
        sink.mockRestore();
      }
    }
    const out = printed.join("\n");
    expect(out).not.toMatch(/T-[A-Z]+-\d+/);
    for (const e of FOUR) expect(out).not.toContain(e.text);
  });
});

describe("key hygiene", () => {
  it("writes the key to no file, even when the model's own answer echoes it", async () => {
    const { now, sleep } = clock();
    next(() => reply({ content: JSON.stringify({ items: [{ productName: "x", quantity: 1 }], notes: `key ${KEY}` }), remaining: 6000, reset: 1 }));
    await runGroqSlice({ entries: [E1, E2], apiKey: KEY, dir, now, sleep });
    writeLiveReport(buildLiveReport(readAllLines(dir), FOUR), dir);
    const files = readdirSync(dir);
    expect(files).toEqual(expect.arrayContaining(["answers-dev.jsonl", "report.json", "report.md"]));
    for (const file of files) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text).not.toContain(KEY);
      expect(text).not.toMatch(/gsk_[A-Za-z0-9]{20,}/);
    }
    expect(readFileSync(join(dir, "answers-dev.jsonl"), "utf8")).toContain("[redacted]");
  });

  it("restores the global fetch after a run", async () => {
    const { now, sleep } = clock();
    await runGroqSlice({ entries: [E1], apiKey: KEY, dir, now, sleep });
    expect(globalThis.fetch).toBe(fetchSpy);
  });
});
