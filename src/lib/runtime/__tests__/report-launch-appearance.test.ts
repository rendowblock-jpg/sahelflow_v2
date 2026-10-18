import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RUNTIME_LAUNCH_APPEARANCE_PATH } from "@/lib/runtime-auth";

import { reportLaunchAppearance } from "../report-launch-appearance";

function stubBrowser(hostname: string) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("window", { location: { hostname } });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // Let any pending report fire so a test never leaks its timer into the next.
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reportLaunchAppearance", () => {
  it("does nothing on the server", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // No `window` global here: this is the Node (server render) case.
    reportLaunchAppearance();
    vi.advanceTimersByTime(5_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing in browser development (localhost), which has no desktop shell", () => {
    const fetchMock = stubBrowser("localhost");
    reportLaunchAppearance();
    vi.advanceTimersByTime(5_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the packaged server (127.0.0.1) to record the appearance", () => {
    const fetchMock = stubBrowser("127.0.0.1");
    reportLaunchAppearance();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const [url, init] = call;
    expect(url).toBe(RUNTIME_LAUNCH_APPEARANCE_PATH);
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      keepalive: true,
    });
    // It carries no body: the values travel in the cookies.
    expect(init.body).toBeUndefined();
  });

  it("collapses a burst of changes (mode then preset then language) into one request", () => {
    const fetchMock = stubBrowser("127.0.0.1");
    reportLaunchAppearance();
    vi.advanceTimersByTime(100);
    reportLaunchAppearance();
    vi.advanceTimersByTime(100);
    reportLaunchAppearance();
    vi.advanceTimersByTime(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports again for a later, separate change", () => {
    const fetchMock = stubBrowser("127.0.0.1");
    reportLaunchAppearance();
    vi.advanceTimersByTime(1_000);
    reportLaunchAppearance();
    vi.advanceTimersByTime(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("swallows a failed request: the card simply keeps its previous look", async () => {
    const fetchMock = stubBrowser("127.0.0.1");
    fetchMock.mockRejectedValue(new Error("network down"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    reportLaunchAppearance();
    vi.advanceTimersByTime(500);
    await vi.advanceTimersByTimeAsync(0);
    process.off("unhandledRejection", unhandled);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
