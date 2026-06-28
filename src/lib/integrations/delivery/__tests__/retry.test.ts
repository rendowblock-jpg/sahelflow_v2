/**
 * retryFetch tests — retry logic for delivery provider API calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { retryFetch } from "../retry";

describe("retryFetch", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the response on first success", async () => {
    const mockRes = new Response("{}", { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockRes);

    const res = await retryFetch("https://api.example.com/test", {});
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 502 status (up to 3 attempts)", async () => {
    const okRes = new Response("{}", { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("err", { status: 502 }))
      .mockResolvedValueOnce(new Response("err", { status: 502 }))
      .mockResolvedValueOnce(okRes);

    const promise = retryFetch("https://api.example.com/test", {});
    await vi.advanceTimersByTimeAsync(5000); // skip delays
    const res = await promise;
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("returns 502 after exhausting retries", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("err", { status: 502 }));

    const promise = retryFetch("https://api.example.com/test", {});
    await vi.advanceTimersByTimeAsync(10000);
    const res = await promise;
    expect(res.status).toBe(502);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("retries on network error (fetch throws)", async () => {
    const okRes = new Response("{}", { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(okRes);

    const promise = retryFetch("https://api.example.com/test", {});
    await vi.advanceTimersByTimeAsync(2000);
    const res = await promise;
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws the last error after exhausting retries on network errors", async () => {
    const err = new Error("persistent network error");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(err);

    // Attach the rejection handler IMMEDIATELY (before advancing timers)
    // to avoid an unhandled rejection during advanceTimersByTimeAsync.
    const expectation = expect(
      retryFetch("https://api.example.com/test", {}),
    ).rejects.toThrow("persistent network error");

    // Advance through all retry delays so the retries complete
    await vi.advanceTimersByTimeAsync(20000);
    await expectation;
  });

  it("does NOT retry on 400/404/500 (non-transient)", async () => {
    const notFoundRes = new Response("{}", { status: 404 });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(notFoundRes);

    const res = await retryFetch("https://api.example.com/test", {});
    expect(res.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no retry
  });

  it("passes options through to fetch", async () => {
    const mockRes = new Response("{}", { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockRes);

    await retryFetch("https://api.example.com/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/test",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foo: "bar" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
