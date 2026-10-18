/**
 * Agent loop limits (audit AIX-07 / S06a-09 and S06a-08).
 *
 * - Loop exhaustion used to end the stream without any terminal event: the
 *   seller saw a half-finished turn and no reason. It now ends with a coded,
 *   constant, model-independent error event in the seller's language.
 * - A stalled provider stream (bytes stop arriving) or a turn that outlives
 *   its overall deadline now ends with a clear error event instead of hanging
 *   behind the route's heartbeat.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/secrets", () => ({
  getSecret: vi
    .fn<(_context: unknown, key: string) => Promise<string | null>>()
    .mockResolvedValue("test-key"),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: {
    shopId: "test",
    registryRevision: 1,
    databaseFileId: "test.db",
    migrationSetSha256: "0".repeat(64),
  },
}));

vi.mock("@/lib/ai/gemini/runtime-preferences", () => ({
  loadGeminiRuntimePreferences: vi.fn(async () => ({
    model: "gemini-3.5-flash",
    thinkingLevel: "MINIMAL",
  })),
}));

vi.mock("../tools/registry", () => ({
  getAllToolDefinitions: vi.fn<() => unknown[]>().mockReturnValue([]),
  getTool: vi.fn<(name: string) => unknown>().mockReturnValue(undefined),
  registerTool: vi.fn(),
  listTools: vi.fn().mockReturnValue([]),
}));

vi.mock("../tools/core-tools", () => ({}));
vi.mock("../tools/extended-tools", () => ({}));
vi.mock("../tools/advanced-tools", () => ({}));

import {
  AGENT_STREAM_IDLE_MS,
  AGENT_TURN_DEADLINE_MS,
  runAgent,
  runAgentStream,
  type AgentStreamEvent,
} from "../agent";
import { getTool } from "../tools/registry";

const fetchSpy = vi.fn();

const ITERATION_LIMIT_MESSAGES = {
  ar: "تم بلوغ الحد الأقصى من خطوات الوكيل. بسّط طلبك ثم أعد المحاولة.",
  en: "The agent reached its iteration limit. Simplify the request and try again.",
  fr: "La limite d'itérations a été atteinte. Simplifiez la demande puis réessayez.",
} as const;

function sseCall(): Response {
  const encoder = new TextEncoder();
  const chunk = {
    candidates: [
      { content: { parts: [{ functionCall: { name: "echo_tool", args: {} } }] } },
    ],
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(chunk)}\r\n\r\n`),
      );
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function jsonCall(): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ functionCall: { name: "echo_tool", args: {} } }] } },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function stalledStream(): Response {
  return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function collect(
  locale: "ar" | "fr" | "en" | undefined,
): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const event of runAgentStream(
    [],
    "hello",
    undefined,
    undefined,
    locale,
  )) {
    events.push(event);
  }
  return events;
}

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  vi.mocked(getTool).mockReturnValue({
    definition: {
      name: "echo_tool",
      description: "test tool",
      parameters: { type: "object", properties: {} },
    },
    execute: vi.fn(async () => ({ success: true, data: { ok: true } })),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("loop exhaustion", () => {
  it.each(["ar", "en", "fr"] as const)(
    "ends the stream with a coded, constant error event (%s)",
    async (locale) => {
      fetchSpy.mockImplementation(async () => sseCall());

      const events = await collect(locale);

      const last = events[events.length - 1]!;
      expect(last).toEqual({
        type: "error",
        message: ITERATION_LIMIT_MESSAGES[locale],
        code: "AI_ITERATION_LIMIT",
      });
      expect(fetchSpy).toHaveBeenCalledTimes(5);
      expect(events.some((event) => event.type === "done")).toBe(false);
    },
  );

  it("uses the same constant text for the non-streaming agent in every locale", async () => {
    fetchSpy.mockImplementation(async () => jsonCall());

    for (const locale of ["ar", "en", "fr"] as const) {
      const result = await runAgent([], "hello", undefined, locale);
      expect(result.response).toBe(ITERATION_LIMIT_MESSAGES[locale]);
    }
  });
});

describe("stalled and over-long turns", () => {
  it("ends with a clear error event when the provider stream goes idle", async () => {
    vi.useFakeTimers();
    fetchSpy.mockImplementation(async () => stalledStream());

    const pending = collect("en");
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(AGENT_STREAM_IDLE_MS + 1_000);
    const events = await pending;

    const last = events[events.length - 1]!;
    expect(last.type).toBe("error");
    expect(last).toMatchObject({ code: "AI_STREAM_STALLED" });
    expect((last as { message: string }).message.length).toBeGreaterThan(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  }, 10_000);

  it("stops starting new provider calls once the turn deadline has passed", async () => {
    vi.useFakeTimers();
    fetchSpy.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + AGENT_TURN_DEADLINE_MS / 2 + 1);
      return sseCall();
    });

    const events = await collect("en");

    const last = events[events.length - 1]!;
    expect(last).toMatchObject({ type: "error", code: "AI_STREAM_STALLED" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  }, 10_000);
});
