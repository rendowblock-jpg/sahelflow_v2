/**
 * F-0023: a seller's correct PIN was reported as wrong. The server answers 401 for TWO different things
 * (wrong PIN = INVALID_CREDENTIALS, dead session = UNAUTHORIZED) and the panels mapped every 401 to
 * "Incorrect PIN". One shared client helper must tell them apart and must never send two requests at once
 * (a successful reauthentication rotates the session, so a second request with the old cookie gets 401).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reauthenticateWithPin } from "../reauthenticate-client";

const fetchMock = vi.fn();

function reply(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reauthenticateWithPin: what the server said", () => {
  it("posts the PIN as JSON to /api/auth/reauthenticate and returns ok on success", async () => {
    fetchMock.mockImplementationOnce(() => reply(200, { success: true, sessionRotated: true }));
    const result = await reauthenticateWithPin("24681357");
    expect(result).toEqual({ kind: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/reauthenticate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ pin: "24681357" });
  });

  it("401 INVALID_CREDENTIALS is a wrong PIN", async () => {
    fetchMock.mockImplementationOnce(() => reply(401, { error: "Incorrect PIN", code: "INVALID_CREDENTIALS" }));
    expect(await reauthenticateWithPin("0000")).toEqual({ kind: "incorrect" });
  });

  it("401 UNAUTHORIZED is an expired session, NOT a wrong PIN", async () => {
    fetchMock.mockImplementationOnce(() => reply(401, { error: "Unauthorized", code: "UNAUTHORIZED" }));
    expect(await reauthenticateWithPin("24681357")).toEqual({ kind: "session-expired" });
  });

  it("a 401 that does not carry the wrong-PIN code is never reported as a wrong PIN", async () => {
    fetchMock.mockImplementationOnce(() => reply(401, {}));
    expect(await reauthenticateWithPin("24681357")).toEqual({ kind: "session-expired" });
  });

  it("429 is locked and carries Retry-After in seconds when the header is there", async () => {
    fetchMock.mockImplementationOnce(() =>
      reply(429, { error: "Too many failed attempts.", code: "RATE_LIMITED" }, { "Retry-After": "90" }),
    );
    expect(await reauthenticateWithPin("0000")).toEqual({ kind: "locked", retryAfterSec: 90 });
  });

  it("429 is locked without retryAfterSec when the header is absent or unreadable", async () => {
    fetchMock.mockImplementationOnce(() => reply(429, { code: "RATE_LIMITED" }));
    expect(await reauthenticateWithPin("0000")).toEqual({ kind: "locked" });
    // A plain-object response without headers (what several render tests hand back) must not throw.
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, status: 429, json: async () => ({}) } as Response),
    );
    expect(await reauthenticateWithPin("0000")).toEqual({ kind: "locked" });
  });

  it("400 REQUEST_VALIDATION_FAILED is invalid input", async () => {
    fetchMock.mockImplementationOnce(() => reply(400, { error: "PIN is required", code: "REQUEST_VALIDATION_FAILED" }));
    expect(await reauthenticateWithPin("x")).toEqual({ kind: "invalid" });
  });

  it("503 AUTH_SECRET_UNAVAILABLE, other server errors and an unreadable body are unavailable", async () => {
    fetchMock.mockImplementationOnce(() => reply(503, { code: "AUTH_SECRET_UNAVAILABLE" }));
    expect(await reauthenticateWithPin("24681357")).toEqual({ kind: "unavailable" });
    fetchMock.mockImplementationOnce(() => reply(500, {}));
    expect(await reauthenticateWithPin("24681357")).toEqual({ kind: "unavailable" });
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response("<html>bad gateway</html>", { status: 502 })));
    expect(await reauthenticateWithPin("24681357")).toEqual({ kind: "unavailable" });
  });

  it("a network failure is unavailable", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await reauthenticateWithPin("24681357")).toEqual({ kind: "unavailable" });
  });

  it("gives up after 15 seconds with slow (the server may still finish), aborts the request and never retries by itself", async () => {
    vi.useFakeTimers();
    // A fetch that never answers and ignores the abort signal, like a stuck request on a slow machine.
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => undefined));
    const pending = reauthenticateWithPin("24681357");
    await vi.advanceTimersByTimeAsync(14_999);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    // Not "unavailable": the server can still finish and rotate the session, so the next attempt could read 401.
    expect(await pending).toEqual({ kind: "slow" });
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(init.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a fetch that rejects with an abort-like error on its own, before the 15 s, is still unavailable", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new DOMException("The operation was aborted.", "AbortError")));
    expect(await reauthenticateWithPin("24681357")).toEqual({ kind: "unavailable" });
  });
});

describe("reauthenticateWithPin: one request at a time", () => {
  it("concurrent calls share ONE request and the same answer", async () => {
    let release!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const first = reauthenticateWithPin("24681357");
    const second = reauthenticateWithPin("24681357");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(new Response(JSON.stringify({ success: true }), { status: 200 }));
    expect(await first).toEqual({ kind: "ok" });
    expect(await second).toEqual({ kind: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets the next attempt through after a slow answer (the stuck request no longer holds the slot)", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => undefined));
    const slow = reauthenticateWithPin("24681357");
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await slow).toEqual({ kind: "slow" });
    fetchMock.mockImplementationOnce(() => reply(200, { success: true }));
    expect(await reauthenticateWithPin("24681357")).toEqual({ kind: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lets the next attempt through once the first has settled, also after a failure", async () => {
    fetchMock.mockImplementationOnce(() => reply(401, { code: "INVALID_CREDENTIALS" }));
    expect(await reauthenticateWithPin("0000")).toEqual({ kind: "incorrect" });
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await reauthenticateWithPin("24681357")).toEqual({ kind: "unavailable" });
    fetchMock.mockImplementationOnce(() => reply(200, { success: true }));
    expect(await reauthenticateWithPin("24681357")).toEqual({ kind: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
