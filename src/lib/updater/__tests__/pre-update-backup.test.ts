import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PRE_UPDATE_BACKUP_TIMEOUT_MS,
  resetPreUpdateBackupForTests,
  runPreUpdateBackup,
  type PreUpdateBackupOutcome,
  type PreUpdateBackupPhase,
} from "../pre-update-backup";

const OK = { ok: true, backupId: "backup-1700000000000-0123456789abcdef", durationMs: 4200 };
const DONE: PreUpdateBackupOutcome = { kind: "done", backupId: OK.backupId, durationMs: 4200 };

/** A request that answers `value` after `ms` of (fake) time. */
function slow(ms: number, value: unknown) {
  return vi.fn(
    (_signal: AbortSignal) =>
      new Promise<unknown>((resolve) => {
        setTimeout(() => resolve(value), ms);
      }),
  );
}

function watch() {
  const phases: PreUpdateBackupPhase[] = [];
  return {
    phases,
    onPhase: (phase: PreUpdateBackupPhase) => {
      phases.push(phase);
    },
  };
}

function track(promise: Promise<PreUpdateBackupOutcome>) {
  const box: { settled: boolean; outcome: PreUpdateBackupOutcome | null } = {
    settled: false,
    outcome: null,
  };
  void promise.then((outcome) => {
    box.settled = true;
    box.outcome = outcome;
  });
  return box;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetPreUpdateBackupForTests();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("runPreUpdateBackup clocks", () => {
  it("the limit is 60 seconds", () => {
    expect(PRE_UPDATE_BACKUP_TIMEOUT_MS).toBe(60_000);
  });

  it("0 s: an answer at once is done, phases running then done", async () => {
    const w = watch();
    const outcome = await runPreUpdateBackup({
      request: vi.fn(async (_s: AbortSignal) => OK),
      timeoutMs: 60_000,
      onPhase: w.onPhase,
    });
    expect(outcome).toEqual(DONE);
    expect(w.phases).toEqual(["running", "done"]);
  });

  it("59.9 s: still done", async () => {
    const box = track(runPreUpdateBackup({ request: slow(59_900, OK), timeoutMs: 60_000 }));
    await vi.advanceTimersByTimeAsync(59_900);
    expect(box.outcome).toEqual(DONE);
  });

  it("60 s: the limit wins, timed out", async () => {
    const w = watch();
    const box = track(
      runPreUpdateBackup({ request: slow(60_000, OK), timeoutMs: 60_000, onPhase: w.onPhase }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(box.outcome).toEqual({ kind: "timed-out" });
    expect(w.phases).toEqual(["running", "timed-out"]);
  });

  it("61 s: timed out at 60 s, and the late answer is ignored", async () => {
    const w = watch();
    const box = track(
      runPreUpdateBackup({ request: slow(61_000, OK), timeoutMs: 60_000, onPhase: w.onPhase }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(box.outcome).toEqual({ kind: "timed-out" });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(box.outcome).toEqual({ kind: "timed-out" });
    expect(w.phases).toEqual(["running", "timed-out"]);
  });

  it("a late failure after the limit is ignored too", async () => {
    const w = watch();
    const request = vi.fn(
      (_s: AbortSignal) =>
        new Promise<unknown>((_resolve, reject) => {
          setTimeout(() => reject(new Error("late")), 62_000);
        }),
    );
    const box = track(runPreUpdateBackup({ request, timeoutMs: 60_000, onPhase: w.onPhase }));
    await vi.advanceTimersByTimeAsync(63_000);
    expect(box.outcome).toEqual({ kind: "timed-out" });
    expect(w.phases).toEqual(["running", "timed-out"]);
  });

  it("the timer is cleared when the answer comes first", async () => {
    const box = track(runPreUpdateBackup({ request: slow(1_000, OK), timeoutMs: 60_000 }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(box.settled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a timeout aborts the request signal", async () => {
    const request = slow(90_000, OK);
    void runPreUpdateBackup({ request, timeoutMs: 60_000 });
    await vi.advanceTimersByTimeAsync(60_000);
    const signal = request.mock.calls[0]?.[0];
    expect(signal?.aborted).toBe(true);
  });

  it.each([Number.NaN, 0, -5])("a limit of %s falls back to 60 s (not at once)", async (timeoutMs) => {
    const box = track(runPreUpdateBackup({ request: slow(61_000, OK), timeoutMs }));
    await vi.advanceTimersByTimeAsync(59_900);
    expect(box.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(box.outcome).toEqual({ kind: "timed-out" });
  });
});

describe("runPreUpdateBackup answers", () => {
  it("a rejected request is a failure with a fixed code and no message", async () => {
    const w = watch();
    const outcome = await runPreUpdateBackup({
      request: vi.fn(async (_s: AbortSignal): Promise<unknown> => {
        throw new Error("secret path C:\\Users\\shop");
      }),
      timeoutMs: 60_000,
      onPhase: w.onPhase,
    });
    expect(outcome).toEqual({ kind: "failed", code: "REQUEST_FAILED" });
    expect(JSON.stringify(outcome)).not.toContain("secret");
    expect(w.phases).toEqual(["running", "failed"]);
  });

  it("a request that throws before returning a promise is a failure too", async () => {
    const outcome = await runPreUpdateBackup({
      request: () => {
        throw new Error("sync");
      },
      timeoutMs: 60_000,
    });
    expect(outcome).toEqual({ kind: "failed", code: "REQUEST_FAILED" });
  });

  it("a typed failure from the route keeps its code", async () => {
    const outcome = await runPreUpdateBackup({
      request: async () => ({ ok: false, code: "BACKUP_BUSY" }),
      timeoutMs: 60_000,
    });
    expect(outcome).toEqual({ kind: "failed", code: "BACKUP_BUSY" });
  });

  it("a code with odd characters becomes UNKNOWN", async () => {
    const outcome = await runPreUpdateBackup({
      request: async () => ({ ok: false, code: "bad code! C:\\x" }),
      timeoutMs: 60_000,
    });
    expect(outcome).toEqual({ kind: "failed", code: "UNKNOWN" });
  });

  it("a fresh backup is skipped, with its age", async () => {
    const w = watch();
    const outcome = await runPreUpdateBackup({
      request: async () => ({ skipped: "fresh", ageMinutes: 12 }),
      timeoutMs: 60_000,
      onPhase: w.onPhase,
    });
    expect(outcome).toEqual({ kind: "skipped", ageMinutes: 12 });
    expect(w.phases).toEqual(["running", "skipped"]);
  });

  it.each([null, undefined, "ok", 7, [], {}, { ok: true }, { ok: true, backupId: "" }, { skipped: "stale", ageMinutes: 1 }, { skipped: "fresh" }])(
    "an answer that makes no sense (%j) is a failure, never a pass",
    async (reply) => {
      const outcome = await runPreUpdateBackup({ request: async () => reply, timeoutMs: 60_000 });
      expect(outcome).toEqual({ kind: "failed", code: "BAD_REPLY" });
    },
  );

  it("a listener that throws cannot break the update", async () => {
    const outcome = await runPreUpdateBackup({
      request: async () => OK,
      timeoutMs: 60_000,
      onPhase: () => {
        throw new Error("render crashed");
      },
    });
    expect(outcome).toEqual(DONE);
  });
});

describe("runPreUpdateBackup double click", () => {
  it("two calls while one runs share ONE request and one answer", async () => {
    const request = slow(1_000, OK);
    const first = runPreUpdateBackup({ request, timeoutMs: 60_000 });
    const second = runPreUpdateBackup({ request, timeoutMs: 60_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(await first).toEqual(await second);

    const third = runPreUpdateBackup({ request, timeoutMs: 60_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    await third;
    expect(request).toHaveBeenCalledTimes(2);
  });
});
