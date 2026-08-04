import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { retryFetch } from "../retry";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("courier retry policy", () => {
  it("returns the first successful response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await retryFetch("https://provider.example/status", {});

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries safe GET requests after transient gateway failures", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = retryFetch("https://provider.example/status", {});
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(promise).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries 504 and returns the final response after bounded attempts", async () => {
    fetchMock.mockResolvedValue(new Response("gateway", { status: 504 }));

    const promise = retryFetch("https://provider.example/status", {});
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toMatchObject({ status: 504 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("honors Retry-After for rate-limited safe requests", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response("limited", {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = retryFetch("https://provider.example/fees", { method: "GET" });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries safe network failures and throws the final error", async () => {
    fetchMock.mockRejectedValue(new Error("provider offline"));

    const expectation = expect(
      retryFetch("https://provider.example/status", { method: "GET" }),
    ).rejects.toThrow("provider offline");
    await vi.runAllTimersAsync();

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry resource-creating POST responses", async () => {
    fetchMock.mockResolvedValue(new Response("gateway", { status: 503 }));

    const response = await retryFetch("https://provider.example/parcels", {
      method: "POST",
      body: "parcel",
    });

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a POST after an ambiguous network error", async () => {
    fetchMock.mockRejectedValue(new Error("socket reset after write"));

    await expect(
      retryFetch("https://provider.example/parcels", {
        method: "post",
        body: "parcel",
      }),
    ).rejects.toThrow("socket reset after write");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns non-transient client errors without retrying", async () => {
    fetchMock.mockResolvedValue(new Response("invalid", { status: 422 }));

    const response = await retryFetch("https://provider.example/fees", {
      method: "GET",
    });

    expect(response.status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries idempotent PATCH mutations", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("temporary", { status: 502 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = retryFetch("https://provider.example/status/1", {
      method: "PATCH",
      body: JSON.stringify({ status: 50 }),
    });
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(promise).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears request timeout timers after every failed attempt", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    fetchMock.mockRejectedValue(new Error("offline"));

    const expectation = expect(
      retryFetch("https://provider.example/status", { method: "GET" }),
    ).rejects.toThrow("offline");
    await vi.runAllTimersAsync();

    await expectation;
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(3);
  });
});
