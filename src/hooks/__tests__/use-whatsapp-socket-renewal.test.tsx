/**
 * @vitest-environment happy-dom
 */
// S09b-04. The push socket's grant lives 30 s (the sidecar closes the socket at
// that moment, sidecars/whatsapp/index.ts closeExpiredClient) and the hook
// renews 5 s early, so a VISIBLE tab asks for a ws-token about every 25 s. That
// stays (the grant is short on purpose). What must stop is a HIDDEN tab asking
// and opening sockets all day.
//
// Real code: use-whatsapp-socket.ts and ws-url.ts. Stand-ins: fetch (a grant of
// 30 s), a fake WebSocket that the "sidecar" closes at grant expiry, fake timers.
// NOT covered: a real WebSocket, a real sidecar, a real browser.
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWhatsAppSocket } from "@/hooks/use-whatsapp-socket";

const GRANT_MS = 30_000;
let visibility: DocumentVisibilityState = "visible";
let tokenRequests: number[] = [];

class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
    const expiresAt = Number(new URL(url).searchParams.get("token")?.split("-")[1]);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
    // The sidecar closes a socket whose grant has run out.
    setTimeout(() => this.close(), Math.max(0, expiresAt - Date.now()));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
}

// Inside act(), so a state change made by a socket event is rendered before we read it.
async function advance(ms: number) {
  await act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
}

function openSockets(): number {
  return FakeSocket.instances.filter((socket) => socket.readyState === 1).length;
}

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useWhatsAppSocket grant renewal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    tokenRequests = [];
    FakeSocket.instances = [];
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        tokenRequests.push(Date.now());
        const expiresAt = Date.now() + GRANT_MS;
        return new Response(
          JSON.stringify({ token: `tok-${expiresAt}`, expiresAt, wsUrl: "ws://sidecar.test/ws" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a visible tab keeps the 25 s rhythm: 13 token requests in 5 minutes, one socket open", async () => {
    renderHook(() => useWhatsAppSocket());
    await advance(5 * 60_000);
    expect(tokenRequests.length).toBe(13);
    expect(tokenRequests[1]! - tokenRequests[0]!).toBe(25_000);
    expect(openSockets()).toBe(1);
  });

  it("a tab hidden after 10 s asks for no further token and opens no further socket", async () => {
    renderHook(() => useWhatsAppSocket());
    await advance(10_000);
    setVisibility("hidden");
    await advance(30 * 60_000);
    expect(tokenRequests.length).toBe(1);
    expect(FakeSocket.instances.length).toBe(1);
    expect(openSockets()).toBe(0);
  });

  it("coming back after a long hide makes exactly one new request and opens one socket", async () => {
    const view = renderHook(() => useWhatsAppSocket());
    await advance(10_000);
    setVisibility("hidden");
    await advance(10 * 60_000);
    await act(async () => {
      setVisibility("visible");
    });
    await advance(1_000);
    expect(tokenRequests.length).toBe(2);
    expect(openSockets()).toBe(1);
    expect(view.result.current.wsOpen).toBe(true);
    // and the rhythm resumes
    await advance(25_000);
    expect(tokenRequests.length).toBe(3);
  });

  it("a quick hide-and-return after a long hide asks for no extra token (no stale deferred renewal)", async () => {
    renderHook(() => useWhatsAppSocket());
    await advance(10_000);
    setVisibility("hidden");
    await advance(25 * 60_000); // renewal fell due and was deferred; the grant ended
    await act(async () => {
      setVisibility("visible");
    });
    await advance(1_000);
    expect(tokenRequests.length).toBe(2);
    setVisibility("hidden");
    await advance(100);
    await act(async () => {
      setVisibility("visible");
    });
    await advance(100);
    expect(tokenRequests.length).toBe(2);
  });

  it("a short hide (renewal falls inside it) renews the moment the tab returns, with no gap", async () => {
    const view = renderHook(() => useWhatsAppSocket());
    await advance(20_000);
    setVisibility("hidden");
    await advance(8_000); // t=28 s: the 25 s renewal fell inside the hide
    expect(tokenRequests.length).toBe(1);
    await act(async () => {
      setVisibility("visible"); // old socket still lives until t=30 s
    });
    await advance(100);
    expect(tokenRequests.length).toBe(2);
    await advance(3_000); // t≈31 s: the old grant is over
    expect(openSockets()).toBe(1);
    expect(view.result.current.wsOpen).toBe(true);
  });
});
