import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decidePreUpdateBackup,
  planRetention,
  type RetentionEntry,
} from "../scheduled-backup";
import {
  UPDATE_HOLD_MAX_MS,
  holdScheduledBackups,
  releaseScheduledBackups,
  scheduledBackupsHeld,
} from "../scheduled-backup-busy";
import {
  emptyScheduledBackupState,
  forgetMissingBackups,
  parseScheduledBackupState,
  recordBackupFailure,
  recordBackupSuccess,
  recordPreUpdateBackup,
} from "../scheduled-backup-state";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);

describe("decidePreUpdateBackup (the 60 minute rule)", () => {
  it.each([
    ["no backup at all", null, true, 0],
    ["made this second", NOW, false, 0],
    ["30 minutes", NOW - 30 * MINUTE, false, 30],
    ["59 minutes", NOW - 59 * MINUTE, false, 59],
    ["59 min 59 s", NOW - (60 * MINUTE - 1000), false, 59],
    ["exactly 60 minutes", NOW - 60 * MINUTE, true, 0],
    ["61 minutes", NOW - 61 * MINUTE, true, 0],
    ["dated in the future (clock moved)", NOW + MINUTE, true, 0],
    ["not a number", Number.NaN, true, 0],
  ])("%s", (_label, newest, run, age) => {
    const decision = decidePreUpdateBackup({ now: NOW, newestBackupAtMs: newest });
    expect(decision.run).toBe(run);
    if (!decision.run) expect(decision.ageMinutes).toBe(age);
  });
});

describe("the update hold", () => {
  afterEach(() => {
    releaseScheduledBackups("update");
    releaseScheduledBackups("restore-staged");
  });

  it("the hard expiry is 5 minutes", () => {
    expect(UPDATE_HOLD_MAX_MS).toBe(5 * MINUTE);
  });

  it("an update hold ends by itself after 5 minutes (a crashed client cannot block backups)", () => {
    holdScheduledBackups("update", 1_000_000);
    expect(scheduledBackupsHeld(1_000_000)).toBe(true);
    expect(scheduledBackupsHeld(1_000_000 + 5 * MINUTE - 1)).toBe(true);
    expect(scheduledBackupsHeld(1_000_000 + 5 * MINUTE)).toBe(false);
    expect(scheduledBackupsHeld(1_000_000)).toBe(false);
  });

  it("release lifts it at once", () => {
    holdScheduledBackups("update", 1_000_000);
    releaseScheduledBackups("update");
    expect(scheduledBackupsHeld(1_000_001)).toBe(false);
  });

  it("a staged restore never expires, and an expired update hold does not lift it", () => {
    holdScheduledBackups("restore-staged", 1_000_000);
    holdScheduledBackups("update", 1_000_000);
    expect(scheduledBackupsHeld(1_000_000 + 10 * DAY)).toBe(true);
    releaseScheduledBackups("restore-staged");
    expect(scheduledBackupsHeld(1_000_000 + 10 * DAY)).toBe(false);
  });

  it("holding again starts a new 5 minutes", () => {
    holdScheduledBackups("update", 1_000_000);
    holdScheduledBackups("update", 1_000_000 + 4 * MINUTE);
    expect(scheduledBackupsHeld(1_000_000 + 8 * MINUTE)).toBe(true);
    expect(scheduledBackupsHeld(1_000_000 + 9 * MINUTE)).toBe(false);
  });
});

function entry(id: string, ageMs: number, automatic = true): RetentionEntry {
  return { backupId: id, createdAtMs: NOW - ageMs, automatic };
}

/** 7 daily + 4 weekly backups that fill the normal plan, then four old pre-update ones. */
function crowded(): RetentionEntry[] {
  const daily = [1, 2, 3, 4, 5, 6, 7].map((days) => entry(`d${days}`, days * DAY));
  const weekly = [14, 21, 28, 35].map((days) => entry(`w${days}`, days * DAY));
  return [
    ...daily,
    ...weekly,
    entry("p1", 60 * DAY),
    entry("p2", 60 * DAY + HOUR),
    entry("p3", 60 * DAY + 2 * HOUR),
    entry("p4", 60 * DAY + 3 * HOUR),
  ];
}

describe("planRetention with pre-update backups", () => {
  it("without preUpdateIds the old four go (the normal plan, unchanged)", () => {
    expect(planRetention(crowded(), NOW).remove.sort()).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("keeps the newest 2 pre-update backups on top of the normal plan", () => {
    const plan = planRetention(crowded(), NOW, ["p1", "p2", "p3", "p4"]);
    expect(plan.remove.sort()).toEqual(["p3", "p4"]);
    expect(plan.keep).toEqual(expect.arrayContaining(["p1", "p2", "d1", "w35"]));
  });

  it("newest means newest by date, not first in the list", () => {
    const plan = planRetention(crowded(), NOW, ["p4", "p3", "p2", "p1"]);
    expect(plan.remove.sort()).toEqual(["p3", "p4"]);
  });

  it("one pre-update backup is kept, ids that do not exist are ignored", () => {
    const plan = planRetention(crowded(), NOW, ["p3", "ghost"]);
    expect(plan.remove.sort()).toEqual(["p1", "p2", "p4"]);
  });

  it("a manual (not automatic) entry named in preUpdateIds is still never planned", () => {
    const entries = [...crowded(), entry("manual-old", 90 * DAY, false)];
    const plan = planRetention(entries, NOW, ["manual-old", "p1"]);
    expect(plan.keep).not.toContain("manual-old");
    expect(plan.remove).not.toContain("manual-old");
    expect(plan.keep).toContain("p1");
  });

  it("an empty list changes nothing", () => {
    expect(planRetention(crowded(), NOW, [])).toEqual(planRetention(crowded(), NOW));
  });

  it("a pre-update backup with an unreadable date is kept as before", () => {
    const entries = [...crowded(), { backupId: "pn", createdAtMs: Number.NaN, automatic: true }];
    const plan = planRetention(entries, NOW, ["pn"]);
    expect(plan.remove).not.toContain("pn");
    expect(plan.keep).toContain("pn");
  });
});

describe("scheduler state with pre-update backups", () => {
  it("an old state file without preUpdateIds reads as empty", () => {
    const parsed = parseScheduledBackupState({
      version: 1,
      automaticIds: ["a"],
      lastSuccessAtMs: 5,
      lastAttemptAtMs: null,
      failureTimesMs: [],
      lastFailureCode: null,
    });
    expect(parsed.preUpdateIds).toEqual([]);
    expect(parsed.automaticIds).toEqual(["a"]);
  });

  it("junk in preUpdateIds is dropped and the list is capped at 200", () => {
    const ids = Array.from({ length: 250 }, (_v, index) => `b${index}`);
    const parsed = parseScheduledBackupState({
      version: 1,
      automaticIds: [],
      preUpdateIds: [...ids, 7, "", null],
    });
    expect(parsed.preUpdateIds).toHaveLength(200);
    expect(parsed.preUpdateIds.at(-1)).toBe("b249");
  });

  it("recording a pre-update backup makes it automatic AND pre-update, once", () => {
    const first = recordPreUpdateBackup(emptyScheduledBackupState(), "b1", NOW);
    const again = recordPreUpdateBackup(first, "b1", NOW + 1);
    expect(again.automaticIds).toEqual(["b1"]);
    expect(again.preUpdateIds).toEqual(["b1"]);
    expect(again.lastSuccessAtMs).toBe(NOW + 1);
  });

  it("it clears earlier failures like any success", () => {
    const failed = recordBackupFailure(emptyScheduledBackupState(), NOW - HOUR, "DISK_FULL");
    const next = recordPreUpdateBackup(failed, "b2", NOW);
    expect(next.failureTimesMs).toEqual([]);
    expect(next.lastFailureCode).toBeNull();
  });

  it("a normal success leaves preUpdateIds alone", () => {
    const base = recordPreUpdateBackup(emptyScheduledBackupState(), "b1", NOW);
    expect(recordBackupSuccess(base, "b2", NOW + 1).preUpdateIds).toEqual(["b1"]);
  });

  it("forgetting a backup that is gone drops it from both lists", () => {
    let state = recordPreUpdateBackup(emptyScheduledBackupState(), "b1", NOW);
    state = recordPreUpdateBackup(state, "b2", NOW + 1);
    const next = forgetMissingBackups(state, new Set(["b2"]));
    expect(next.automaticIds).toEqual(["b2"]);
    expect(next.preUpdateIds).toEqual(["b2"]);
  });
});
