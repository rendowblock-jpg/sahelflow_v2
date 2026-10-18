import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  LIVE_RECOVERY_POLL_MS,
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
  const start = transport.indexOf("if (wsOpen || sending) return;");
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
    expect(transport).toContain("if (wsOpen || sending) return;");
  });
});
