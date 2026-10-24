/**
 * @vitest-environment happy-dom
 */
// PB-WS-TOKEN-QUIET. A seller with no linked WhatsApp, or a helper that is
// restarting, is a NORMAL state. The push hook used to ask for a token at once,
// then again after 1 s, 2 s, 4 s ... on every page, with no pause for a hidden
// tab. This file mounts the REAL hook with the token call answering "no token"
// and counts what goes over the wire.
//
// Real code under test: use-whatsapp-socket.ts and ws-url.ts. Stand-ins: fetch
// (always "no token"), the clock (fake timers) and Math.random (so the jitter is
// known). NOT covered: a real WebSocket, a real sidecar, a real browser.
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWhatsAppSocket } from "@/hooks/use-whatsapp-socket";

let visibility: DocumentVisibilityState = "visible";
let fetchTimes: number[] = [];

function tokenAnswer(kind: "503" | "200-offline" | "network") {
  return async () => {
    fetchTimes.push(Date.now());
    if (kind === "network") throw new TypeError("Failed to fetch");
    if (kind === "503") {
      return new Response(
        JSON.stringify({ error: "Sidecar WebSocket grant unavailable", token: null }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ token: null, connected: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

function gaps(): number[] {
  return fetchTimes.slice(1).map((time, index) => time - fetchTimes[index]!);
}

describe("useWhatsAppSocket when the helper is off", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    fetchTimes = [];
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    vi.spyOn(document, "hidden", "get").mockImplementation(() => visibility === "hidden");
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.stubGlobal("fetch", vi.fn(tokenAnswer("503")));
  });

  afterEach(() => {
    // Without this a hook from an earlier test keeps its focus listener.
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks at most once in the first two seconds", async () => {
    renderHook(() => useWhatsAppSocket());
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchTimes.length).toBe(1);
  });

  it("waits longer after every miss, up to a cap of one minute", async () => {
    renderHook(() => useWhatsAppSocket());
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    const waits = gaps();
    expect(waits.slice(0, 6)).toEqual([2_000, 4_000, 8_000, 16_000, 32_000, 60_000]);
    expect(Math.max(...waits)).toBeLessThanOrEqual(60_000);
  });

  it("adds jitter on top of the wait, never below it", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    renderHook(() => useWhatsAppSocket());
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    const waits = gaps();
    expect(waits.length).toBeGreaterThan(3);
    waits.slice(0, 5).forEach((wait, index) => {
      const base = 2_000 * 2 ** index;
      expect(wait).toBeGreaterThanOrEqual(base);
      expect(wait).toBeLessThanOrEqual(base * 1.25);
    });
  });

  it("backs off the same way for a network error and for a 200 'not connected'", async () => {
    for (const kind of ["network", "200-offline"] as const) {
      fetchTimes = [];
      vi.stubGlobal("fetch", vi.fn(tokenAnswer(kind)));
      const view = renderHook(() => useWhatsAppSocket());
      await vi.advanceTimersByTimeAsync(31_000);
      expect(gaps().slice(0, 4)).toEqual([2_000, 4_000, 8_000, 16_000]);
      view.unmount();
    }
  });

  it("writes nothing to the console", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useWhatsAppSocket());
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetchTimes.length).toBeGreaterThan(3);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("sends no request at all while the tab is hidden", async () => {
    visibility = "hidden";
    renderHook(() => useWhatsAppSocket());
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetchTimes.length).toBe(0);
    await act(async () => {
      setVisibility("visible");
    });
    expect(fetchTimes.length).toBe(1);
  });

  it("stops a running retry loop when the tab is hidden and restarts it when it returns", async () => {
    renderHook(() => useWhatsAppSocket());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchTimes.length).toBe(1);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetchTimes.length).toBe(1);
    await act(async () => {
      setVisibility("visible");
    });
    expect(fetchTimes.length).toBe(2);
  });

  it("does not add a second request when the window gets focus right after a miss", async () => {
    renderHook(() => useWhatsAppSocket());
    await vi.advanceTimersByTimeAsync(300);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchTimes.length).toBe(1);
  });
});
