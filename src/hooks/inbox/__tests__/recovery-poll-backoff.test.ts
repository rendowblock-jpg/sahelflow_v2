/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useInboxTransportRuntime,
  type UseInboxTransportRuntimeParams,
} from "@/hooks/inbox/use-inbox-transport";
import {
  LIVE_RECOVERY_POLL_MS,
  OPEN_SOCKET_POLL_MS,
  RECOVERY_POLL_FULL_RATE_CYCLES,
  RECOVERY_POLL_MAX_MS,
  recoveryPollDelayMs,
  STATUS_RECOVERY_POLL_MS,
} from "@/hooks/inbox/inbox-workspace-shared";

// S09b-07: with the push channel down and WhatsApp connected, the Inbox polled
// the local server every 3 s for as long as the socket stayed closed. The poll
// now backs off, and a returning tab refreshes at once. The WebSocket path is
// not touched.

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("recoveryPollDelayMs", () => {
  it("keeps the base cadence for the first refreshes so a short blip recovers fast", () => {
    for (let cycle = 0; cycle < RECOVERY_POLL_FULL_RATE_CYCLES; cycle += 1) {
      expect(recoveryPollDelayMs(LIVE_RECOVERY_POLL_MS, cycle)).toBe(LIVE_RECOVERY_POLL_MS);
    }
  });

  it("backs off in steps and stops at the ceiling", () => {
    const base = LIVE_RECOVERY_POLL_MS;
    expect(recoveryPollDelayMs(base, 5)).toBe(base * 2);
    expect(recoveryPollDelayMs(base, 10)).toBe(base * 4);
    expect(recoveryPollDelayMs(base, 15)).toBe(RECOVERY_POLL_MAX_MS);
    expect(recoveryPollDelayMs(base, 100_000)).toBe(RECOVERY_POLL_MAX_MS);
    expect(recoveryPollDelayMs(STATUS_RECOVERY_POLL_MS, 0)).toBe(STATUS_RECOVERY_POLL_MS);
    expect(recoveryPollDelayMs(STATUS_RECOVERY_POLL_MS, 500)).toBe(RECOVERY_POLL_MAX_MS);
  });

  it("is monotonic, never below the base and never above max(base, ceiling)", () => {
    for (const base of [LIVE_RECOVERY_POLL_MS, STATUS_RECOVERY_POLL_MS, 40_000]) {
      let previous = 0;
      for (let cycle = 0; cycle < 400; cycle += 1) {
        const delay = recoveryPollDelayMs(base, cycle);
        expect(delay).toBeGreaterThanOrEqual(previous);
        expect(delay).toBeGreaterThanOrEqual(base);
        expect(delay).toBeLessThanOrEqual(Math.max(base, RECOVERY_POLL_MAX_MS));
        previous = delay;
      }
    }
  });

  it("treats a nonsense cycle count as the first cycle", () => {
    expect(recoveryPollDelayMs(LIVE_RECOVERY_POLL_MS, -3)).toBe(LIVE_RECOVERY_POLL_MS);
    expect(recoveryPollDelayMs(LIVE_RECOVERY_POLL_MS, Number.NaN)).toBe(LIVE_RECOVERY_POLL_MS);
  });

  it("cuts the steady-state request rate at least fourfold against the old fixed 3 s", () => {
    expect(recoveryPollDelayMs(LIVE_RECOVERY_POLL_MS, 1_000)).toBeGreaterThanOrEqual(
      LIVE_RECOVERY_POLL_MS * 4,
    );
  });
});

describe("the fallback poll in use-inbox-transport", () => {
  const transport = source("src/hooks/inbox/use-inbox-transport.ts");
  const start = transport.indexOf("if (sending) return;");
  const end = transport.indexOf("const connectWhatsApp");
  const effect = transport.slice(start, end);

  it("is located", () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
  });

  it("backs off through recoveryPollDelayMs instead of a fixed interval", () => {
    expect(effect).toContain("recoveryPollDelayMs(baseDelayMs, completedCycles)");
    expect(effect).toContain("window.setTimeout(");
    expect(effect).not.toContain("setInterval");
  });

  it("keeps the visible-tab guard and refreshes at once when the tab returns", () => {
    expect(effect).toContain('document.visibilityState !== "visible"');
    expect(effect).toContain('document.addEventListener("visibilitychange"');
    expect(effect).toContain('document.removeEventListener("visibilitychange"');
    expect(effect).toContain("completedCycles = 0");
  });

  it("runs one timer at a time and clears it on cleanup", () => {
    expect(effect).toContain("window.clearTimeout(timerId)");
    expect(effect).toContain("cancelled = true");
  });

  it("leaves the WebSocket path alone", () => {
    const socket = source("src/hooks/use-whatsapp-socket.ts");
    expect(socket).not.toContain("recoveryPollDelayMs");
    // The effect no longer returns early for an open socket; it polls slowly.
    expect(transport).not.toContain("if (wsOpen || sending) return;");
    expect(transport).toContain("OPEN_SOCKET_POLL_MS");
  });
});

// MSG-16 / S05a-08: while the WebSocket is open the chat list was never
// polled, so a message the push missed showed only after a reload. An open
// socket now gets one slow catch-up poll of the chat list.
describe("the catch-up poll while the WebSocket is open", () => {
  const OPEN_POLL_MS = 60_000;
  let visibility = "visible";

  function mount(overrides: Partial<UseInboxTransportRuntimeParams> = {}) {
    const loadChats = vi.fn(async () => {});
    const loadMessages = vi.fn(async () => {});
    const params: UseInboxTransportRuntimeParams = {
      refs: {
        activeChatRef: { current: { conversationId: "c1" } as never },
        sendingRef: { current: false },
      },
      status: "connected",
      user: null,
      wsOpen: true,
      reconnect: vi.fn(),
      sidecarReachable: true,
      sidecarStatus: "connected",
      effectiveStatus: "connected",
      sending: false,
      loadChats,
      loadMessages,
      t: (key) => key,
      ...overrides,
    };
    const view = renderHook((props) => useInboxTransportRuntime(props), {
      initialProps: params,
    });
    return { view, params, loadChats: params.loadChats, loadMessages: params.loadMessages };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibility as DocumentVisibilityState,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("is about a minute", () => {
    expect(OPEN_SOCKET_POLL_MS).toBe(OPEN_POLL_MS);
  });

  it("refreshes the chat list once a minute and does not back off", async () => {
    const { loadChats, loadMessages } = mount();
    await vi.advanceTimersByTimeAsync(OPEN_POLL_MS - 1);
    expect(loadChats).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(loadChats).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(OPEN_POLL_MS * 10);
    expect(loadChats).toHaveBeenCalledTimes(11);
    expect(loadMessages).not.toHaveBeenCalled();
  });

  it("does not start a second refresh while one is still running", async () => {
    const loadChats = vi.fn(() => new Promise<void>(() => {}));
    mount({ loadChats });
    await vi.advanceTimersByTimeAsync(OPEN_POLL_MS * 5);
    expect(loadChats).toHaveBeenCalledTimes(1);
  });

  it("does not poll while the tab is hidden, and refreshes when it returns", async () => {
    const { loadChats } = mount();
    visibility = "hidden";
    await vi.advanceTimersByTimeAsync(OPEN_POLL_MS * 3);
    expect(loadChats).not.toHaveBeenCalled();
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(loadChats).toHaveBeenCalledTimes(1);
  });

  it("stays quiet while a send is running", async () => {
    const { loadChats } = mount({ sending: true });
    await vi.advanceTimersByTimeAsync(OPEN_POLL_MS * 3);
    expect(loadChats).not.toHaveBeenCalled();
  });

  it("stops on unmount", async () => {
    const { view, loadChats } = mount();
    view.unmount();
    await vi.advanceTimersByTimeAsync(OPEN_POLL_MS * 3);
    expect(loadChats).not.toHaveBeenCalled();
  });

  it("moves to the faster recovery cadence when the socket closes", async () => {
    const { view, params, loadChats, loadMessages } = mount();
    view.rerender({ ...params, wsOpen: false });
    await vi.advanceTimersByTimeAsync(LIVE_RECOVERY_POLL_MS);
    expect(loadChats).toHaveBeenCalledTimes(1);
    expect(loadMessages).toHaveBeenCalledTimes(1);
  });
});
