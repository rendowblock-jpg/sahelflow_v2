import { describe, expect, it, vi } from "vitest";

import {
  isRetryableStatus,
  postToApp,
  STATUS_CALLBACK_POLICY,
  type CallbackPolicy,
} from "./app-callback";

const POLICY: CallbackPolicy = { timeoutMs: 50, retryDelaysMs: [1, 2] };

function reply(status: number): Response {
  return new Response("{}", { status });
}

function run(fetchImpl: typeof fetch, policy: CallbackPolicy = POLICY) {
  const sleeps: number[] = [];
  const outcome = postToApp({
    url: "http://127.0.0.1:1/api/whatsapp/message-status",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    policy,
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { outcome, sleeps };
}

describe("sidecar callbacks into the app", () => {
  it("waits long enough for a cold first request, then retries", () => {
    expect(STATUS_CALLBACK_POLICY.timeoutMs).toBeGreaterThanOrEqual(20_000);
    expect(STATUS_CALLBACK_POLICY.retryDelaysMs.length).toBeGreaterThanOrEqual(2);
  });

  it("retries what is transient and stops on a final answer", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableStatus(status), String(status)).toBe(true);
    }
    for (const status of [200, 201, 400, 401, 403, 404, 409, 422]) {
      expect(isRetryableStatus(status), String(status)).toBe(false);
    }
  });

  it("returns at once on success", async () => {
    const fetchImpl = vi.fn(async () => reply(200)) as unknown as typeof fetch;
    const { outcome, sleeps } = run(fetchImpl);
    await expect(outcome).resolves.toEqual({ ok: true, attempts: 1, status: 200 });
    expect(sleeps).toEqual([]);
  });

  it("recovers when the first cold call fails and a later one succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      if (calls === 2) return reply(503);
      return reply(200);
    }) as unknown as typeof fetch;
    const { outcome, sleeps } = run(fetchImpl);
    await expect(outcome).resolves.toMatchObject({ ok: true, attempts: 3 });
    expect(sleeps).toEqual([1, 2]);
  });

  it("does not retry a final 4xx answer", async () => {
    const fetchImpl = vi.fn(async () => reply(401)) as unknown as typeof fetch;
    const { outcome, sleeps } = run(fetchImpl);
    await expect(outcome).resolves.toEqual({ ok: false, attempts: 1, status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("gives up after the last retry and reports why", async () => {
    const failure = new Error("connection refused");
    const fetchImpl = vi.fn(async () => {
      throw failure;
    }) as unknown as typeof fetch;
    const { outcome } = run(fetchImpl);
    await expect(outcome).resolves.toMatchObject({ ok: false, attempts: 3, error: failure });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("abandons a hung attempt at the deadline instead of waiting forever", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    ) as unknown as typeof fetch;
    const { outcome } = run(fetchImpl, { timeoutMs: 20, retryDelaysMs: [1] });
    await expect(outcome).resolves.toMatchObject({ ok: false, attempts: 2 });
  });
});
