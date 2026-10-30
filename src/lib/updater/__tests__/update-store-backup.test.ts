import { describe, expect, it } from "vitest";

import {
  IDLE_SNAPSHOT,
  reduceUpdate,
  type UpdateAction,
  type UpdateSnapshot,
} from "../update-store";

function run(...actions: UpdateAction[]): UpdateSnapshot {
  return actions.reduce<UpdateSnapshot>((state, action) => reduceUpdate(state, action), IDLE_SNAPSHOT);
}

const OFFER: UpdateAction = { type: "offer", version: "1.0.1", date: null, notes: null };
const READY: UpdateAction[] = [OFFER, { type: "download-started" }, { type: "download-finished" }];
const INSTALLING: UpdateAction[] = [...READY, { type: "install-started" }];

describe("update store: the backup step of an install", () => {
  it("starts with no backup anywhere", () => {
    expect(IDLE_SNAPSHOT.backup).toBeNull();
    expect(run(OFFER).backup).toBeNull();
    expect(run(...INSTALLING).backup).toBeNull();
    expect(run(...INSTALLING).phase).toBe("installing");
  });

  it("running, then each ending", () => {
    const running = run(...INSTALLING, { type: "backup-phase", phase: "running" });
    expect(running.backup).toBe("running");
    for (const phase of ["done", "failed", "timed-out"] as const) {
      const end = reduceUpdate(running, { type: "backup-phase", phase });
      expect(end.backup).toBe(phase);
      expect(end.backupAgeMinutes).toBeNull();
      expect(end.phase).toBe("installing");
    }
  });

  it("skipped carries the age, whole minutes, never negative", () => {
    const running = run(...INSTALLING, { type: "backup-phase", phase: "running" });
    expect(reduceUpdate(running, { type: "backup-phase", phase: "skipped", ageMinutes: 12.9 })).toMatchObject({
      backup: "skipped",
      backupAgeMinutes: 12,
    });
    expect(reduceUpdate(running, { type: "backup-phase", phase: "skipped", ageMinutes: -4 }).backupAgeMinutes).toBe(0);
    expect(reduceUpdate(running, { type: "backup-phase", phase: "skipped", ageMinutes: Number.NaN }).backupAgeMinutes).toBe(0);
    expect(reduceUpdate(running, { type: "backup-phase", phase: "skipped" }).backupAgeMinutes).toBe(0);
  });

  it.each([
    ["idle", [] as UpdateAction[]],
    ["available", [OFFER]],
    ["downloading", [OFFER, { type: "download-started" } as UpdateAction]],
    ["ready (install not started)", READY],
  ])("is ignored while the update is %s", (_label, setup) => {
    const before = run(...setup);
    expect(reduceUpdate(before, { type: "backup-phase", phase: "running" })).toBe(before);
  });

  it("an ending without a start is ignored", () => {
    const installing = run(...INSTALLING);
    expect(reduceUpdate(installing, { type: "backup-phase", phase: "done" })).toBe(installing);
  });

  it("starting twice, or changing an ending, is ignored", () => {
    const running = run(...INSTALLING, { type: "backup-phase", phase: "running" });
    expect(reduceUpdate(running, { type: "backup-phase", phase: "running" })).toBe(running);
    const done = reduceUpdate(running, { type: "backup-phase", phase: "done" });
    expect(reduceUpdate(done, { type: "backup-phase", phase: "failed" })).toBe(done);
    expect(reduceUpdate(done, { type: "backup-phase", phase: "running" })).toBe(done);
  });

  it("a failed install clears it, and a retry starts clean", () => {
    const failed = run(
      ...INSTALLING,
      { type: "backup-phase", phase: "running" },
      { type: "backup-phase", phase: "done" },
      { type: "failed", stage: "install", message: "boom" },
    );
    expect(failed.phase).toBe("error");
    expect(failed.backup).toBeNull();
    const retry = reduceUpdate(failed, { type: "install-started" });
    expect(retry.phase).toBe("installing");
    expect(retry.backup).toBeNull();
    expect(retry.backupAgeMinutes).toBeNull();
  });
});
