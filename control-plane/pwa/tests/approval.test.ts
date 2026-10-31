import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPROVAL_TIMEOUT_MS, delayAfter, watchApproval, type ApprovalDeps, type ApprovalEnd, type ApprovalPoll } from "../src/poll/approval";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());

function rig(script: readonly (ApprovalPoll | "throw")[], hiddenAtStart = false) {
  let hidden = hiddenAtStart; let i = 0;
  const listeners: Array<() => void> = []; const polls: number[] = []; const ends: ApprovalEnd[] = [];
  const deps: ApprovalDeps = {
    async poll() { polls.push(Date.now()); const r = script[Math.min(i, script.length - 1)] ?? "pending"; i += 1; if (r === "throw") throw new Error("boom"); return r; },
    now: () => Date.now(),
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    isHidden: () => hidden,
    onVisibilityChange(run) { listeners.push(run); return () => { listeners.splice(listeners.indexOf(run), 1); }; },
    onEnd: (e) => ends.push(e),
  };
  return { deps, polls, ends, listeners, setHidden(v: boolean) { hidden = v; for (const l of [...listeners]) l(); } };
}
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe("approval wait: the polling schedule", () => {
  it("backs off 1 s, 2 s, 4 s and then every 8 s", () => {
    expect([0, 1, 2, 3, 4, 20].map(delayAfter)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });
  it("polls at once, then at 1, 3, 7, 15, 23 s while the PC has not approved", async () => {
    const r = rig(["pending"]); watchApproval(r.deps); await tick(23_000);
    expect(r.polls).toEqual([0, 1000, 3000, 7000, 15000, 23000]);
    expect(r.ends).toEqual([]);
  });
  it("ends once when approved and never polls again", async () => {
    const r = rig(["pending", "pending", "approved"]); watchApproval(r.deps); await tick(120_000);
    expect(r.ends).toEqual(["approved"]); expect(r.polls).toEqual([0, 1000, 3000]);
  });
  it("a removed phone (401) ends the wait as revoked", async () => {
    const r = rig(["revoked"]); watchApproval(r.deps); await tick(60_000);
    expect(r.ends).toEqual(["revoked"]); expect(r.polls).toEqual([0]);
  });
  it("a network error or a throwing poll just keeps waiting", async () => {
    const r = rig(["retry", "throw", "approved"]); watchApproval(r.deps); await tick(10_000);
    expect(r.ends).toEqual(["approved"]); expect(r.polls).toEqual([0, 1000, 3000]);
  });
  it("times out calmly after 10 minutes and stops polling", async () => {
    const r = rig(["pending"]); watchApproval(r.deps); await tick(APPROVAL_TIMEOUT_MS + 9_000);
    expect(r.ends).toEqual(["timeout"]);
    const n = r.polls.length; await tick(60_000);
    expect(r.polls.length).toBe(n);
    expect(Math.max(...r.polls)).toBeLessThan(APPROVAL_TIMEOUT_MS);
  });
  it("stop() ends everything without a verdict", async () => {
    const r = rig(["pending"]); const w = watchApproval(r.deps); await tick(1500); w.stop(); const n = r.polls.length; await tick(60_000);
    expect(r.polls.length).toBe(n); expect(r.ends).toEqual([]); expect(r.listeners).toHaveLength(0);
  });
});

describe("approval wait: a hidden tab does not poll", () => {
  it("does not start while hidden, then polls at once when shown", async () => {
    const r = rig(["pending"], true); watchApproval(r.deps); await tick(30_000);
    expect(r.polls).toEqual([]);
    r.setHidden(false); await tick(0); expect(r.polls).toEqual([30_000]);
  });
  it("stops while hidden and resumes with a fresh 1 s backoff when shown", async () => {
    const r = rig(["pending"]); watchApproval(r.deps); await tick(3500);
    expect(r.polls).toEqual([0, 1000, 3000]);
    r.setHidden(true); await tick(60_000); expect(r.polls).toEqual([0, 1000, 3000]);
    r.setHidden(false); await tick(1000); expect(r.polls).toEqual([0, 1000, 3000, 63_500, 64_500]);
  });
  it("a tab that comes back after the 10 minutes finds the calm timeout, not another poll", async () => {
    const r = rig(["pending"]); watchApproval(r.deps); await tick(1500); r.setHidden(true);
    await tick(APPROVAL_TIMEOUT_MS + 60_000); const n = r.polls.length;
    r.setHidden(false); await tick(0);
    expect(r.ends).toEqual(["timeout"]); expect(r.polls.length).toBe(n);
  });
});
