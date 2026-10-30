import { describe, expect, it } from "vitest";

import {
  decideBackup,
  isoWeekKey,
  planRetention,
  type BackupDecisionInput,
  type RetentionEntry,
} from "../scheduled-backup";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);

function input(over: Partial<BackupDecisionInput> = {}): BackupDecisionInput {
  return {
    now: NOW,
    lastSuccessAt: NOW - 25 * HOUR,
    lastAttemptAt: null,
    attemptsInLast24h: 0,
    shopHasData: true,
    busy: false,
    ...over,
  };
}

describe("decideBackup", () => {
  const table: Array<[string, Partial<BackupDecisionInput>, boolean, string]> = [
    ["never backed up", { lastSuccessAt: null }, true, "due"],
    ["19 h 59 min 59 s old is fresh", { lastSuccessAt: NOW - (20 * HOUR - 1000) }, false, "fresh"],
    ["exactly 20 h is not yet older than 20 h", { lastSuccessAt: NOW - 20 * HOUR }, false, "fresh"],
    ["20 h and 1 ms is due", { lastSuccessAt: NOW - 20 * HOUR - 1 }, true, "due"],
    ["three days old is due", { lastSuccessAt: NOW - 3 * DAY }, true, "due"],
    ["just made is fresh", { lastSuccessAt: NOW }, false, "fresh"],
    ["busy wins over due", { busy: true }, false, "busy"],
    ["busy wins over no data", { busy: true, shopHasData: false }, false, "busy"],
    ["an empty shop is never backed up", { shopHasData: false }, false, "no-data"],
    ["an empty shop that never succeeded", { shopHasData: false, lastSuccessAt: null }, false, "no-data"],
    ["success in the future is unknown: run", { lastSuccessAt: NOW + 1 }, true, "clock-skew"],
    ["success ten days in the future: run", { lastSuccessAt: NOW + 10 * DAY }, true, "clock-skew"],
    ["NaN success is unknown", { lastSuccessAt: Number.NaN }, true, "due"],
    ["busy still wins over a clock-skew run", { lastSuccessAt: NOW + DAY, busy: true }, false, "busy"],
    // After a failed attempt: 30 min, then 2 h, then 4 h, never more than 3 attempts in 24 h.
    ["1 failure, 29 min 59 s ago: wait", { attemptsInLast24h: 1, lastAttemptAt: NOW - (30 * MIN - 1000) }, false, "backoff"],
    ["1 failure, exactly 30 min ago: retry", { attemptsInLast24h: 1, lastAttemptAt: NOW - 30 * MIN }, true, "due"],
    ["2 failures, 1 h 59 min ago: wait", { attemptsInLast24h: 2, lastAttemptAt: NOW - (2 * HOUR - MIN) }, false, "backoff"],
    ["2 failures, exactly 2 h ago: retry", { attemptsInLast24h: 2, lastAttemptAt: NOW - 2 * HOUR }, true, "due"],
    ["3 failures, 3 h 59 min ago: wait", { attemptsInLast24h: 3, lastAttemptAt: NOW - (4 * HOUR - MIN) }, false, "backoff"],
    ["3 failures, 4 h ago: the daily cap stops it", { attemptsInLast24h: 3, lastAttemptAt: NOW - 4 * HOUR }, false, "attempt-limit"],
    ["more than 3 attempts is still capped", { attemptsInLast24h: 9, lastAttemptAt: NOW - 20 * HOUR }, false, "attempt-limit"],
    ["failures but a fresh success: fresh", { lastSuccessAt: NOW - HOUR, attemptsInLast24h: 2, lastAttemptAt: NOW - MIN }, false, "fresh"],
    ["attempt count without a timestamp: unknown, retry", { attemptsInLast24h: 1, lastAttemptAt: null }, true, "due"],
    ["a future attempt time is ignored for backoff", { attemptsInLast24h: 1, lastAttemptAt: NOW + HOUR }, true, "due"],
    ["a future attempt time does not lift the cap", { attemptsInLast24h: 3, lastAttemptAt: NOW + HOUR }, false, "attempt-limit"],
    ["a recent timestamp with zero attempts does not delay", { attemptsInLast24h: 0, lastAttemptAt: NOW - MIN }, true, "due"],
    ["a negative count counts as zero", { attemptsInLast24h: -4, lastAttemptAt: NOW - MIN }, true, "due"],
    ["skew success plus a recent failure still backs off", { lastSuccessAt: NOW + DAY, attemptsInLast24h: 1, lastAttemptAt: NOW - MIN }, false, "backoff"],
  ];

  it.each(table)("%s", (_name, over, run, reason) => {
    expect(decideBackup(input(over))).toEqual({ run, reason });
  });

  it("does not depend on the time zone: the same instants give the same answer", () => {
    const winter = Date.UTC(2026, 0, 15, 23, 59, 0);
    const summer = Date.UTC(2026, 6, 15, 23, 59, 0);
    for (const now of [winter, summer]) {
      expect(decideBackup(input({ now, lastSuccessAt: now - 21 * HOUR })).run).toBe(true);
      expect(decideBackup(input({ now, lastSuccessAt: now - 19 * HOUR })).run).toBe(false);
    }
  });
});

describe("isoWeekKey (UTC)", () => {
  it.each([
    [Date.UTC(2020, 11, 31), "2020-W53"],
    [Date.UTC(2021, 0, 3, 23, 59, 59), "2020-W53"],
    [Date.UTC(2021, 0, 4), "2021-W01"],
    [Date.UTC(2024, 11, 30), "2025-W01"],
    [Date.UTC(2026, 9, 26), "2026-W44"],
    [Date.UTC(2026, 10, 1, 23, 0), "2026-W44"],
    [Date.UTC(2026, 10, 2), "2026-W45"],
  ])("%s -> %s", (ms, key) => {
    expect(isoWeekKey(ms)).toBe(key);
  });
});

function auto(id: string, createdAtMs: number): RetentionEntry {
  return { backupId: id, createdAtMs, automatic: true };
}
function manual(id: string, createdAtMs: number): RetentionEntry {
  return { backupId: id, createdAtMs, automatic: false };
}
const at = (month: number, day: number, hour = 3) => Date.UTC(2026, month - 1, day, hour);

describe("planRetention", () => {
  it("returns an empty plan for no backups", () => {
    expect(planRetention([], NOW)).toEqual({ keep: [], remove: [] });
  });

  it("keeps the newest 7 daily and the newest per week beyond them (4 weeks)", () => {
    const entries: RetentionEntry[] = [];
    // One automatic backup at 03:00 UTC every day from 30 Oct back to 1 Sep.
    for (let offset = 0; offset < 60; offset += 1) {
      const ms = Date.UTC(2026, 9, 30 - offset, 3);
      entries.push(auto(`a-${new Date(ms).toISOString().slice(0, 10)}`, ms));
    }
    const plan = planRetention(entries, NOW);
    const expectedKept = [
      // 7 daily (30 Oct back to 24 Oct)
      "a-2026-10-30", "a-2026-10-29", "a-2026-10-28", "a-2026-10-27",
      "a-2026-10-26", "a-2026-10-25", "a-2026-10-24",
      // newest of each of the next four ISO weeks (W43..W40)
      "a-2026-10-23", "a-2026-10-18", "a-2026-10-11", "a-2026-10-04",
    ];
    expect([...plan.keep].sort()).toEqual([...expectedKept].sort());
    expect(plan.remove).toHaveLength(60 - 11);
    expect(new Set([...plan.keep, ...plan.remove]).size).toBe(60);
  });

  it("never touches a manual backup, however old or many", () => {
    const entries = [
      ...Array.from({ length: 30 }, (_, i) => manual(`m-${i}`, NOW - (i + 1) * 9 * DAY)),
      ...Array.from({ length: 20 }, (_, i) => auto(`a-${i}`, NOW - (i + 1) * 3 * DAY)),
    ];
    const plan = planRetention(entries, NOW);
    // Manual backups are not part of the plan at all: neither kept nor removed by it.
    expect(plan.remove.some((id) => id.startsWith("m-"))).toBe(false);
    expect(plan.keep.some((id) => id.startsWith("m-"))).toBe(false);
    expect(plan.remove.length).toBeGreaterThan(0);
  });

  it("never deletes the newest two automatic backups, even when both are very old", () => {
    const plan = planRetention([auto("old-1", NOW - 90 * DAY), auto("old-2", NOW - 91 * DAY)], NOW);
    expect(plan.remove).toEqual([]);
  });

  it("deletes a third backup of the same old day but keeps the newest two", () => {
    const day = NOW - 60 * DAY;
    const plan = planRetention(
      [auto("x1", day), auto("x2", day - HOUR), auto("x3", day - 2 * HOUR)],
      NOW,
    );
    expect(plan.keep).toEqual(expect.arrayContaining(["x1", "x2"]));
    expect(plan.remove).toEqual(["x3"]);
  });

  it("never deletes a backup younger than 24 hours", () => {
    const entries = [
      auto("n1", NOW - HOUR),
      auto("n2", NOW - 5 * HOUR),
      auto("n3", NOW - 23 * HOUR - 59 * MIN),
      auto("n4", NOW - 24 * HOUR - 1),
    ];
    const plan = planRetention(entries, NOW);
    expect(plan.keep).toEqual(expect.arrayContaining(["n1", "n2", "n3"]));
    // n4 is the oldest of the same UTC day as n1..n3 and 24 h + 1 ms old: it may go.
    expect(plan.remove).toEqual(["n4"]);
  });

  it("keeps a backup dated in the future (the clock went backwards)", () => {
    const plan = planRetention([auto("f", NOW + 3 * DAY), auto("p", NOW - 40 * DAY), auto("q", NOW - 41 * DAY)], NOW);
    expect(plan.remove).not.toContain("f");
  });

  it("keeps a backup whose date cannot be read instead of guessing", () => {
    const plan = planRetention(
      [auto("bad", Number.NaN), auto("p", NOW - 40 * DAY), auto("q", NOW - 40 * DAY - HOUR), auto("r", NOW - 40 * DAY - 2 * HOUR)],
      NOW,
    );
    expect(plan.keep).toContain("bad");
    expect(plan.remove).toEqual(["r"]);
  });

  it("ties are broken by id so the plan is deterministic", () => {
    const entries = [auto("b", at(9, 1)), auto("a", at(9, 1)), auto("c", at(9, 1)), auto("d", at(9, 1))];
    const first = planRetention(entries, NOW);
    const second = planRetention([...entries].reverse(), NOW);
    expect(second).toEqual(first);
  });
});

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("planRetention properties (400 seeded random histories)", () => {
  for (let seed = 1; seed <= 400; seed += 1) {
    it(`seed ${seed}`, () => {
      const random = mulberry32(seed);
      const count = Math.floor(random() * 60);
      const entries: RetentionEntry[] = [];
      for (let i = 0; i < count; i += 1) {
        const ageMs = Math.floor((random() * 200 - 5) * DAY); // a few in the future
        const isAutomatic = random() >= 0.35;
        entries.push({
          backupId: `${isAutomatic ? "a" : "m"}-${i}`,
          createdAtMs: NOW - ageMs,
          automatic: isAutomatic,
        });
      }
      const plan = planRetention(entries, NOW);
      const byId = new Map(entries.map((entry) => [entry.backupId, entry]));
      const automatic = entries.filter((entry) => entry.automatic);

      // The plan is a partition of the automatic backups, and only of those.
      expect([...plan.keep, ...plan.remove].sort()).toEqual(automatic.map((e) => e.backupId).sort());
      for (const id of plan.remove) expect(byId.get(id)?.automatic).toBe(true);

      // The newest two automatic backups are never deleted.
      const newestTwo = [...automatic]
        .sort((x, y) => y.createdAtMs - x.createdAtMs || (x.backupId < y.backupId ? -1 : 1))
        .slice(0, 2)
        .map((entry) => entry.backupId);
      for (const id of newestTwo) expect(plan.remove).not.toContain(id);

      // Nothing younger than 24 hours is deleted.
      for (const id of plan.remove) {
        expect(NOW - (byId.get(id)?.createdAtMs ?? 0)).toBeGreaterThanOrEqual(DAY);
      }

      // Count bound: 7 daily + 4 weekly + the newest two + everything under 24 h.
      const young = automatic.filter((entry) => NOW - entry.createdAtMs < DAY).length;
      expect(plan.keep.length).toBeLessThanOrEqual(7 + 4 + 2 + young);

      // Input order does not matter, and replanning the survivors deletes nothing more.
      const shuffled = [...entries].sort(() => random() - 0.5);
      expect(planRetention(shuffled, NOW)).toEqual(plan);
      const survivors = entries.filter((entry) => !entry.automatic || plan.keep.includes(entry.backupId));
      expect(planRetention(survivors, NOW).remove).toEqual([]);
    });
  }
});
