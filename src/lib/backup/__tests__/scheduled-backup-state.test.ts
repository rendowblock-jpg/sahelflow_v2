import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  emptyScheduledBackupState,
  failedAttemptsInLast24h,
  forgetMissingBackups,
  parseScheduledBackupState,
  readScheduledBackupState,
  recordBackupFailure,
  recordBackupSuccess,
  scheduledBackupStatePath,
  writeScheduledBackupState,
} from "../scheduled-backup-state";
import {
  holdScheduledBackups,
  releaseScheduledBackups,
  scheduledBackupsHeld,
} from "../scheduled-backup-busy";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 30, 12);

describe("state transitions", () => {
  it("a success records the id and the time and clears the failures", () => {
    const failed = recordBackupFailure(emptyScheduledBackupState(), NOW - HOUR, "ENOSPC");
    const next = recordBackupSuccess(failed, "backup-1", NOW);
    expect(next.automaticIds).toEqual(["backup-1"]);
    expect(next.lastSuccessAtMs).toBe(NOW);
    expect(next.failureTimesMs).toEqual([]);
    expect(next.lastAttemptAtMs).toBeNull();
    expect(next.lastFailureCode).toBeNull();
  });

  it("does not record the same id twice and keeps only the newest 200", () => {
    let state = emptyScheduledBackupState();
    state = recordBackupSuccess(state, "backup-1", NOW);
    state = recordBackupSuccess(state, "backup-1", NOW);
    expect(state.automaticIds).toEqual(["backup-1"]);
    for (let i = 0; i < 250; i += 1) state = recordBackupSuccess(state, `b-${i}`, NOW);
    expect(state.automaticIds).toHaveLength(200);
    expect(state.automaticIds.at(-1)).toBe("b-249");
    expect(state.automaticIds).not.toContain("b-0");
  });

  it("a failure keeps the last-24-hours window and the safe code", () => {
    let state = emptyScheduledBackupState();
    state = recordBackupFailure(state, NOW - 30 * HOUR, "ENOSPC");
    state = recordBackupFailure(state, NOW - HOUR, "EBUSY");
    state = recordBackupFailure(state, NOW, "C:\\Users\\secret path");
    expect(state.failureTimesMs).toEqual([NOW - HOUR, NOW]);
    expect(state.lastAttemptAtMs).toBe(NOW);
    expect(state.lastFailureCode).toBe("UNKNOWN");
    expect(failedAttemptsInLast24h(state, NOW)).toBe(2);
  });

  it("counts a failure that is just under 24 h old and not one that is exactly 24 h old", () => {
    const state = { ...emptyScheduledBackupState(), failureTimesMs: [NOW - 24 * HOUR, NOW - 24 * HOUR + 1] };
    expect(failedAttemptsInLast24h(state, NOW)).toBe(1);
  });

  it("forgets ids the listing no longer has", () => {
    let state = emptyScheduledBackupState();
    for (const id of ["a", "b", "c"]) state = recordBackupSuccess(state, id, NOW);
    expect(forgetMissingBackups(state, new Set(["b"])).automaticIds).toEqual(["b"]);
  });
});

describe("parseScheduledBackupState", () => {
  it.each([null, undefined, 4, "x", [], { version: 2 }, { version: 1, automaticIds: "no" }])(
    "falls back to an empty state for %j",
    (raw) => {
      expect(parseScheduledBackupState(raw).automaticIds).toEqual([]);
      expect(parseScheduledBackupState(raw).lastSuccessAtMs).toBeNull();
    },
  );

  it("drops bad members and caps the lists", () => {
    const parsed = parseScheduledBackupState({
      version: 1,
      automaticIds: ["ok", 5, null, "ok2"],
      lastSuccessAtMs: "yesterday",
      lastAttemptAtMs: NOW,
      failureTimesMs: [NOW, "x", Number.NaN, ...Array.from({ length: 30 }, (_, i) => i)],
      lastFailureCode: "bad code!",
    });
    expect(parsed.automaticIds).toEqual(["ok", "ok2"]);
    expect(parsed.lastSuccessAtMs).toBeNull();
    expect(parsed.lastAttemptAtMs).toBe(NOW);
    expect(parsed.failureTimesMs.length).toBeLessThanOrEqual(10);
    expect(parsed.failureTimesMs.every((time) => Number.isFinite(time))).toBe(true);
    expect(parsed.lastFailureCode).toBeNull();
  });
});

describe("state file", () => {
  let dir = "";
  let saved: string | undefined;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sf-sched-"));
    saved = process.env.SF_DATA_DIR;
    process.env.SF_DATA_DIR = dir;
  });
  afterEach(async () => {
    if (saved === undefined) delete process.env.SF_DATA_DIR;
    else process.env.SF_DATA_DIR = saved;
    await rm(dir, { recursive: true, force: true });
  });

  it("lives inside the data directory", () => {
    expect(scheduledBackupStatePath().startsWith(dir)).toBe(true);
  });

  it("reads an empty state when there is no file", async () => {
    expect(await readScheduledBackupState()).toEqual(emptyScheduledBackupState());
  });

  it("round-trips and leaves no temporary file", async () => {
    const state = recordBackupSuccess(emptyScheduledBackupState(), "backup-1", NOW);
    await writeScheduledBackupState(state);
    expect(await readScheduledBackupState()).toEqual(state);
    const names = await readdir(join(scheduledBackupStatePath(), ".."));
    expect(names).toHaveLength(1);
    expect(JSON.parse(await readFile(scheduledBackupStatePath(), "utf8")).version).toBe(1);
  });

  it("reads an empty state from a damaged file instead of throwing", async () => {
    await mkdir(join(scheduledBackupStatePath(), ".."), { recursive: true });
    await writeFile(scheduledBackupStatePath(), "{ not json", "utf8");
    expect(await readScheduledBackupState()).toEqual(emptyScheduledBackupState());
  });
});

describe("scheduled backup hold", () => {
  it("holds until every reason is released", () => {
    expect(scheduledBackupsHeld()).toBe(false);
    holdScheduledBackups("restore-staged");
    holdScheduledBackups("update");
    releaseScheduledBackups("update");
    expect(scheduledBackupsHeld()).toBe(true);
    releaseScheduledBackups("restore-staged");
    expect(scheduledBackupsHeld()).toBe(false);
  });
});
