import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createScheduledBackupWorker,
  runScheduledBackupTick,
  type ListedBackup,
  type ScheduledBackupDeps,
} from "../scheduled-backup-worker";
import {
  emptyScheduledBackupState,
  recordBackupSuccess,
  type ScheduledBackupState,
} from "../scheduled-backup-state";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 30, 12);

function harness(over: Partial<ScheduledBackupDeps> = {}) {
  let clock = NOW;
  let counter = 0;
  const listed: ListedBackup[] = [];
  const box: { state: ScheduledBackupState } = { state: emptyScheduledBackupState() };
  const deps: ScheduledBackupDeps = {
    now: () => clock,
    random: () => 0,
    isBusy: () => false,
    shopHasData: vi.fn(async () => true),
    createBackup: vi.fn(async () => {
      counter += 1;
      const backupId = `auto-${counter}`;
      listed.push({ backupId, createdAtUnixMs: clock, pinned: false, status: "verified" });
      return { backupId };
    }),
    listBackups: vi.fn(async () => listed.map((entry) => ({ ...entry }))),
    deleteBackup: vi.fn(async (backupId: string) => {
      const index = listed.findIndex((entry) => entry.backupId === backupId);
      if (index >= 0) listed.splice(index, 1);
    }),
    readState: vi.fn(async () => box.state),
    writeState: vi.fn(async (next: ScheduledBackupState) => {
      box.state = next;
    }),
    log: { info: vi.fn(), warn: vi.fn() },
    ...over,
  };
  return {
    deps,
    box,
    listed,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("runScheduledBackupTick", () => {
  it("makes a backup when none exists and records it", async () => {
    const h = harness();
    const outcome = await runScheduledBackupTick(h.deps);
    expect(outcome).toEqual({ kind: "created", backupId: "auto-1", pruned: 0 });
    expect(h.box.state.automaticIds).toEqual(["auto-1"]);
    expect(h.box.state.lastSuccessAtMs).toBe(NOW);
    expect(h.deps.log.info).toHaveBeenCalledWith(
      "backup.scheduled.created",
      expect.objectContaining({ backupId: "auto-1" }),
    );
  });

  it("does nothing while the last backup is fresh", async () => {
    const h = harness();
    await runScheduledBackupTick(h.deps);
    h.advance(19 * HOUR);
    expect(await runScheduledBackupTick(h.deps)).toEqual({ kind: "skipped", reason: "fresh" });
    expect(h.deps.createBackup).toHaveBeenCalledTimes(1);
    h.advance(2 * HOUR);
    expect((await runScheduledBackupTick(h.deps)).kind).toBe("created");
  });

  it("counts a recent manual backup as fresh", async () => {
    const h = harness();
    h.listed.push({ backupId: "manual-1", createdAtUnixMs: NOW - 2 * HOUR, pinned: false, status: "verified" });
    expect(await runScheduledBackupTick(h.deps)).toEqual({ kind: "skipped", reason: "fresh" });
    expect(h.deps.createBackup).not.toHaveBeenCalled();
  });

  it("a corrupt recent backup does not count as fresh", async () => {
    const h = harness();
    h.listed.push({ backupId: "bad", createdAtUnixMs: NOW - HOUR, pinned: false, status: "corrupt" });
    expect((await runScheduledBackupTick(h.deps)).kind).toBe("created");
  });

  it("a backup dated in the future does not make it run on every tick", async () => {
    const h = harness();
    h.listed.push({ backupId: "future", createdAtUnixMs: NOW + 10 * DAY, pinned: false, status: "verified" });
    expect((await runScheduledBackupTick(h.deps)).kind).toBe("created");
    h.advance(30 * MIN);
    expect(await runScheduledBackupTick(h.deps)).toEqual({ kind: "skipped", reason: "fresh" });
    expect(h.deps.createBackup).toHaveBeenCalledTimes(1);
  });

  it("skips while an update or restore holds it, without touching the shop", async () => {
    const h = harness({ isBusy: () => true });
    expect(await runScheduledBackupTick(h.deps)).toEqual({ kind: "skipped", reason: "busy" });
    expect(h.deps.createBackup).not.toHaveBeenCalled();
    expect(h.deps.shopHasData).not.toHaveBeenCalled();
  });

  it("skips an empty shop", async () => {
    const h = harness({ shopHasData: vi.fn(async () => false) });
    expect(await runScheduledBackupTick(h.deps)).toEqual({ kind: "skipped", reason: "no-data" });
    expect(h.deps.createBackup).not.toHaveBeenCalled();
  });

  it("backs up anyway when the data check itself fails", async () => {
    const h = harness({ shopHasData: vi.fn(async () => { throw new Error("db locked"); }) });
    expect((await runScheduledBackupTick(h.deps)).kind).toBe("created");
  });

  it("records a failure with a safe code only, then backs off 30 min, 2 h, 4 h and stops at three", async () => {
    const secret = "C:\\Users\\Aicha\\AppData\\secret.db";
    const h = harness({
      createBackup: vi.fn(async () => {
        throw Object.assign(new Error(`cannot write ${secret}`), { code: "ENOSPC" });
      }),
    });
    expect(await runScheduledBackupTick(h.deps)).toEqual({ kind: "failed", code: "ENOSPC" });
    expect(h.box.state.failureTimesMs).toEqual([NOW]);
    expect(JSON.stringify((h.deps.log.warn as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("Aicha");

    h.advance(10 * MIN);
    expect(await runScheduledBackupTick(h.deps)).toEqual({ kind: "skipped", reason: "backoff" });
    expect(h.deps.createBackup).toHaveBeenCalledTimes(1);

    h.advance(20 * MIN); // 30 min after the failure
    expect((await runScheduledBackupTick(h.deps)).kind).toBe("failed");
    h.advance(2 * HOUR - MIN);
    expect(await runScheduledBackupTick(h.deps)).toEqual({ kind: "skipped", reason: "backoff" });
    h.advance(MIN);
    expect((await runScheduledBackupTick(h.deps)).kind).toBe("failed");
    expect(h.deps.createBackup).toHaveBeenCalledTimes(3);

    h.advance(4 * HOUR);
    expect(await runScheduledBackupTick(h.deps)).toEqual({ kind: "skipped", reason: "attempt-limit" });
    expect(h.deps.createBackup).toHaveBeenCalledTimes(3);
  });

  it("a success after failures starts the schedule again", async () => {
    let fail = true;
    const h = harness();
    const original = h.deps.createBackup;
    h.deps.createBackup = vi.fn(async () => {
      if (fail) throw new Error("boom");
      return original();
    });
    await runScheduledBackupTick(h.deps);
    fail = false;
    h.advance(30 * MIN);
    expect((await runScheduledBackupTick(h.deps)).kind).toBe("created");
    expect(h.box.state.failureTimesMs).toEqual([]);
  });

  it("prunes only automatic backups, never a manual one, and forgets deleted ids", async () => {
    const h = harness();
    let state = emptyScheduledBackupState();
    // Six weeks of daily backups: the 90-day-old pinned one falls outside the four weekly slots,
    // so only its pin keeps it.
    for (let d = 2; d <= 45; d += 1) {
      const id = `old-auto-${d}`;
      h.listed.push({ backupId: id, createdAtUnixMs: NOW - d * DAY, pinned: false, status: "verified" });
      state = recordBackupSuccess(state, id, NOW - d * DAY);
    }
    for (let d = 20; d <= 40; d += 10) {
      h.listed.push({ backupId: `manual-${d}`, createdAtUnixMs: NOW - d * DAY, pinned: false, status: "verified" });
    }
    h.listed.push({ backupId: "pinned-auto", createdAtUnixMs: NOW - 90 * DAY, pinned: true, status: "verified" });
    state = recordBackupSuccess(state, "pinned-auto", NOW - 90 * DAY);
    state = { ...state, lastSuccessAtMs: NOW - 2 * DAY };
    h.box.state = state;

    const outcome = await runScheduledBackupTick(h.deps);
    expect(outcome.kind).toBe("created");
    const deleted = (h.deps.deleteBackup as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0] as string);
    expect(deleted.length).toBeGreaterThanOrEqual(4);
    expect(deleted.every((id) => id.startsWith("old-auto-"))).toBe(true);
    expect(h.listed.filter((entry) => entry.backupId.startsWith("manual-"))).toHaveLength(3);
    expect(h.listed.some((entry) => entry.backupId === "pinned-auto")).toBe(true);
    for (const id of deleted) expect(h.box.state.automaticIds).not.toContain(id);
    expect(h.box.state.automaticIds).toContain("auto-1");
  });

  it("a failed delete is logged and does not turn a good backup into a failure", async () => {
    const h = harness({ deleteBackup: vi.fn(async () => { throw new Error("locked"); }) });
    let state = emptyScheduledBackupState();
    for (let d = 2; d <= 13; d += 1) {
      h.listed.push({ backupId: `old-${d}`, createdAtUnixMs: NOW - d * DAY, pinned: false, status: "verified" });
      state = recordBackupSuccess(state, `old-${d}`, NOW - d * DAY);
    }
    h.box.state = { ...state, lastSuccessAtMs: null };
    const outcome = await runScheduledBackupTick(h.deps);
    expect(outcome.kind).toBe("created");
    expect(h.deps.log.warn).toHaveBeenCalledWith("backup.scheduled.prune_failed", expect.anything());
  });

  it("never throws, whichever dependency breaks", async () => {
    const boom = async () => {
      throw new Error("boom");
    };
    for (const key of ["readState", "writeState", "listBackups", "createBackup", "shopHasData"] as const) {
      const h = harness({ [key]: vi.fn(boom) } as Partial<ScheduledBackupDeps>);
      await expect(runScheduledBackupTick(h.deps)).resolves.toBeDefined();
    }
  });
});

describe("createScheduledBackupWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function live(over: Partial<ScheduledBackupDeps> = {}) {
    const h = harness({ now: () => Date.now(), ...over });
    return h;
  }

  it("waits five minutes after start, then checks every 30 minutes", async () => {
    const h = live();
    const worker = createScheduledBackupWorker(h.deps);
    worker.start();
    await vi.advanceTimersByTimeAsync(5 * MIN - 1);
    expect(h.deps.readState).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.deps.readState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * MIN - 1);
    expect(h.deps.readState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.deps.readState).toHaveBeenCalledTimes(2);
    await worker.stop();
  });

  it("adds jitter to every wait, never more than 10 percent", async () => {
    const h = live({ random: () => 0.999 });
    const worker = createScheduledBackupWorker(h.deps);
    worker.start();
    await vi.advanceTimersByTimeAsync(5 * MIN + 59_000);
    expect(h.deps.readState).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.deps.readState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * MIN);
    expect(h.deps.readState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3 * MIN + 1_000);
    expect(h.deps.readState).toHaveBeenCalledTimes(2);
    await worker.stop();
  });

  it("start twice runs one loop", async () => {
    const h = live();
    const worker = createScheduledBackupWorker(h.deps);
    worker.start();
    worker.start();
    expect(vi.getTimerCount()).toBe(1);
    await worker.stop();
  });

  it("stop before the first check cancels everything", async () => {
    const h = live();
    const worker = createScheduledBackupWorker(h.deps);
    worker.start();
    await worker.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(3 * HOUR);
    expect(h.deps.readState).not.toHaveBeenCalled();
  });

  it("stop waits for a backup in progress and schedules nothing after it", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = live({
      createBackup: vi.fn(async () => {
        await gate;
        return { backupId: "auto-slow" };
      }),
    });
    const worker = createScheduledBackupWorker(h.deps);
    worker.start();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(h.deps.createBackup).toHaveBeenCalledTimes(1);
    let stopped = false;
    const stopping = worker.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(stopped).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(3 * HOUR);
    expect(h.deps.createBackup).toHaveBeenCalledTimes(1);
  });

  it("keeps running after a check blows up", async () => {
    const readState = vi
      .fn<ScheduledBackupDeps["readState"]>()
      .mockRejectedValueOnce(new Error("disk gone"))
      .mockResolvedValue(emptyScheduledBackupState());
    const h = live({ readState });
    const worker = createScheduledBackupWorker(h.deps);
    worker.start();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    await vi.advanceTimersByTimeAsync(30 * MIN);
    expect(readState).toHaveBeenCalledTimes(2);
    expect(h.deps.createBackup).toHaveBeenCalledTimes(1);
    await worker.stop();
  });
});
