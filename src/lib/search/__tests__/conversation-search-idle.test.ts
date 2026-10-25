import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  conversationSearchIdleState,
  createConversationSearchIdleGate,
  noteRequestEnd,
  noteRequestStart,
} from "@/lib/search/conversation-search-idle";

/**
 * PB-CONV-SEARCH-LOAD, slice 3: the idle gate. The index is built only while the app has nothing else to do:
 * never at start-up, never while a request is in flight or ended less than 3 s ago, one chunk per tick.
 */

const CONVERSATIONS = "/api/conversations";
const SEARCH = "/api/conversations/search";
const busy = () => Object.assign(new Error("database is locked"), { code: "P1008" });

function gateWith(runStep: () => Promise<{ changed: boolean }>) {
  return createConversationSearchIdleGate({ runStep, now: () => Date.now() });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("arming", () => {
  it("does nothing before the first inbox request", async () => {
    const runStep = vi.fn(async () => ({ changed: false }));
    const gate = gateWith(runStep);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(runStep).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    gate.requestStarted("/api/orders");
    gate.requestEnded();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is armed by /api/conversations or /api/conversations/search and ticks no earlier than 60 s later", async () => {
    for (const path of [CONVERSATIONS, SEARCH]) {
      const runStep = vi.fn(async () => ({ changed: false }));
      const gate = gateWith(runStep);
      gate.requestStarted(path);
      gate.requestEnded();
      await vi.advanceTimersByTimeAsync(59_999);
      expect(runStep).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(runStep).toHaveBeenCalledTimes(1);
    }
  });

  it("a second arm() does not start a second loop", async () => {
    let running = 0;
    let overlap = 0;
    const gate = gateWith(async () => {
      running += 1;
      overlap = Math.max(overlap, running);
      await new Promise((resolve) => setTimeout(resolve, 50));
      running -= 1;
      return { changed: true };
    });
    gate.requestStarted(CONVERSATIONS);
    gate.requestEnded();
    gate.arm();
    gate.requestStarted(SEARCH);
    gate.requestEnded();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000 + 5_000);
    gate.arm();
    expect(overlap).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("idle rules", () => {
  it("no tick while a request is in flight or within 3 s of the last one", async () => {
    const runStep = vi.fn(async () => ({ changed: false }));
    const gate = gateWith(runStep);
    gate.requestStarted(CONVERSATIONS);
    gate.requestEnded();
    await vi.advanceTimersByTimeAsync(59_000);
    gate.requestStarted("/api/orders"); // in flight from t=59 s
    await vi.advanceTimersByTimeAsync(140_000); // t=199 s
    expect(runStep).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    gate.requestEnded(); // t=200 s
    await vi.advanceTimersByTimeAsync(2_999);
    expect(runStep).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(runStep).toHaveBeenCalledTimes(1);
  });

  it("runs ONE chunk per tick and pauses at least 250 ms between chunks", async () => {
    const runStep = vi.fn(async () => ({ changed: true }));
    const gate = gateWith(runStep);
    gate.requestStarted(CONVERSATIONS);
    gate.requestEnded();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runStep).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(249);
    expect(runStep).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(runStep).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runStep).toHaveBeenCalledTimes(6);
  });

  it("backs off (1 s, 2 s, 4 s ...) when the database is busy, and starts over after a good chunk", async () => {
    let calls = 0;
    const gate = gateWith(async () => {
      calls += 1;
      if (calls <= 3) throw busy();
      return { changed: true };
    });
    gate.requestStarted(CONVERSATIONS);
    gate.requestEnded();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(calls).toBe(4);
    await vi.advanceTimersByTimeAsync(250);
    expect(calls).toBe(5);
  });

  it("stops when nothing is left: no timer stays, and the next inbox request starts it again after 15 s", async () => {
    const runStep = vi.fn(async () => ({ changed: false }));
    const gate = gateWith(runStep);
    gate.requestStarted(CONVERSATIONS);
    gate.requestEnded();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runStep).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(runStep).toHaveBeenCalledTimes(1);

    gate.requestStarted(SEARCH);
    gate.requestEnded();
    await vi.advanceTimersByTimeAsync(14_999);
    expect(runStep).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(runStep).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives up after 5 failures in a row that are not 'busy' and leaves no timer", async () => {
    const runStep = vi.fn(async () => {
      throw new Error("boom");
    });
    const gate = gateWith(runStep);
    gate.requestStarted(CONVERSATIONS);
    gate.requestEnded();
    await vi.advanceTimersByTimeAsync(60_000 + 10 * 60_000);
    expect(runStep).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the request hook", () => {
  it("counts requests in flight, never below zero, and never throws", () => {
    const before = conversationSearchIdleState().inFlight;
    noteRequestStart("/api/orders");
    noteRequestStart(undefined);
    expect(conversationSearchIdleState().inFlight).toBe(before + 2);
    noteRequestEnd();
    noteRequestEnd();
    expect(conversationSearchIdleState().inFlight).toBe(before);
    expect(conversationSearchIdleState().lastEndedAt).toBe(Date.now());
    noteRequestEnd();
    noteRequestEnd();
    expect(conversationSearchIdleState().inFlight).toBeGreaterThanOrEqual(0);
  });

  it("does not arm the shared gate under test (other suites call the inbox routes)", () => {
    noteRequestStart(CONVERSATIONS);
    noteRequestEnd();
    expect(vi.getTimerCount()).toBe(0);
  });
});
