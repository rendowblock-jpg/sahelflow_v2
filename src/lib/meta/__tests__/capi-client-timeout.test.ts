/**
 * The Meta CAPI send must give up on a request that never answers, so the
 * single-flight outbox worker cannot be held for ever by one hung connection.
 * Fake timers only: nothing here waits in real time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendCapiEvent, type CapiEventPayload } from "@/lib/meta/capi-client";

const PAYLOAD: CapiEventPayload = {
  eventName: "Purchase",
  eventId: "order-1",
  eventTime: 1_700_000_000,
  userData: { phone: "0550123456" },
  value: 4200,
};

// Far beyond any sane per-request limit; the exact limit is not under test.
const LONG_WAIT_MS = 10 * 60 * 1000;

type Settled = { state: "pending" } | { state: "rejected"; message: string } | { state: "resolved" };

function track(promise: Promise<unknown>): { current: Settled } {
  const box: { current: Settled } = { current: { state: "pending" } };
  promise.then(
    () => {
      box.current = { state: "resolved" };
    },
    (error: unknown) => {
      box.current = {
        state: "rejected",
        message: error instanceof Error ? error.message : String(error),
      };
    },
  );
  return box;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sendCapiEvent timeout", () => {
  it("rejects with a timeout when fetch honours the abort signal", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const settled = track(sendCapiEvent("1234567890", "token", PAYLOAD));
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(settled.current).toMatchObject({ state: "rejected" });
    expect((settled.current as { message: string }).message).toMatch(/timed out/i);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("still rejects when fetch ignores the signal and never answers", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    const settled = track(sendCapiEvent("1234567890", "token", PAYLOAD));
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(settled.current).toMatchObject({ state: "rejected" });
    expect((settled.current as { message: string }).message).toMatch(/timed out/i);
  });

  it("rejects when the headers arrive but the body never finishes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: () => new Promise(() => {}),
      }) as unknown as Response),
    );

    const settled = track(sendCapiEvent("1234567890", "token", PAYLOAD));
    await vi.advanceTimersByTimeAsync(LONG_WAIT_MS);

    expect(settled.current).toMatchObject({ state: "rejected" });
    expect((settled.current as { message: string }).message).toMatch(/timed out/i);
  });

  it("returns a normal answer and leaves no timer behind", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ events_received: 1, fbtrace_id: "trace-1" }),
      }) as unknown as Response),
    );

    const result = await sendCapiEvent("1234567890", "token", PAYLOAD);

    expect(result).toEqual({ success: true, fbtraceId: "trace-1", httpStatus: 200 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
