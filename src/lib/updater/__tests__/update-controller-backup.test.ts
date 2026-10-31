import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../pre-update-backup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../pre-update-backup")>()),
  runPreUpdateBackup: h.run,
}));

import type { PreUpdateBackupOutcome, RunPreUpdateBackupOptions } from "../pre-update-backup";
import {
  downloadUpdate,
  installUpdate,
  offerUpdate,
  resetUpdateControllerForTests,
  type UpdateHandle,
} from "../update-controller";
import { getUpdateSnapshot } from "../update-store";

const DONE: PreUpdateBackupOutcome = { kind: "done", backupId: "backup-1", durationMs: 10 };

function backupEnds(outcome: PreUpdateBackupOutcome, order?: string[]) {
  h.run.mockImplementation(async (options: RunPreUpdateBackupOptions) => {
    order?.push("backup");
    options.onPhase?.("running", null);
    options.onPhase?.(outcome.kind, outcome);
    return outcome;
  });
}

async function readyUpdate(install: UpdateHandle["install"]) {
  const handle: UpdateHandle = {
    version: "1.0.1",
    download: vi.fn(async () => undefined),
    install,
    close: vi.fn(async () => undefined),
  };
  offerUpdate(handle);
  await downloadUpdate();
  expect(getUpdateSnapshot().phase).toBe("ready");
}

beforeEach(() => {
  vi.useFakeTimers();
  resetUpdateControllerForTests();
  h.run.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("installUpdate and the backup before it", () => {
  it("backs up first, then installs, and the chip already says 'done' when the installer starts", async () => {
    const order: string[] = [];
    let seen: unknown = null;
    backupEnds(DONE, order);
    await readyUpdate(
      vi.fn(async () => {
        order.push("install");
        seen = getUpdateSnapshot().backup;
      }),
    );
    await installUpdate();
    expect(order).toEqual(["backup", "install"]);
    expect(seen).toBe("done");
  });

  it("gives the helper a 60 second limit and a request function", async () => {
    backupEnds(DONE);
    await readyUpdate(vi.fn(async () => undefined));
    await installUpdate();
    const options = h.run.mock.calls[0]?.[0] as RunPreUpdateBackupOptions;
    expect(options.timeoutMs).toBe(60_000);
    expect(typeof options.request).toBe("function");
  });

  it("a skipped backup is shown with its age and the install goes on at once", async () => {
    backupEnds({ kind: "skipped", ageMinutes: 12 });
    const install = vi.fn(async () => undefined);
    await readyUpdate(install);
    await installUpdate();
    expect(install).toHaveBeenCalledTimes(1);
    expect(getUpdateSnapshot()).toMatchObject({ backup: "skipped", backupAgeMinutes: 12 });
  });

  it.each([
    ["failed", { kind: "failed", code: "DISK_FULL" } as PreUpdateBackupOutcome],
    ["timed-out", { kind: "timed-out" } as PreUpdateBackupOutcome],
  ])("%s never blocks the update, but the notice stays readable for 2.5 s", async (state, outcome) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    backupEnds(outcome);
    const install = vi.fn(async () => undefined);
    await readyUpdate(install);
    const pending = installUpdate();
    await vi.advanceTimersByTimeAsync(2_499);
    expect(install).not.toHaveBeenCalled();
    expect(getUpdateSnapshot().backup).toBe(state);
    await vi.advanceTimersByTimeAsync(1);
    expect(install).toHaveBeenCalledTimes(1);
    await pending;
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("pre-update backup");
  });

  it("done and skipped write nothing to the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    backupEnds(DONE);
    await readyUpdate(vi.fn(async () => undefined));
    await installUpdate();
    expect(warn).not.toHaveBeenCalled();
  });

  it("a helper that throws still lets the update install", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    h.run.mockRejectedValue(new Error("impossible"));
    const install = vi.fn(async () => undefined);
    await readyUpdate(install);
    const pending = installUpdate();
    await vi.advanceTimersByTimeAsync(2_500);
    await pending;
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("a double click runs ONE backup and ONE install", async () => {
    let release!: () => void;
    h.run.mockImplementation(
      () =>
        new Promise<PreUpdateBackupOutcome>((resolve) => {
          release = () => resolve(DONE);
        }),
    );
    const install = vi.fn(async () => undefined);
    await readyUpdate(install);
    const first = installUpdate();
    const second = installUpdate();
    release();
    await Promise.all([first, second]);
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("nothing is backed up when no update is ready", async () => {
    await installUpdate();
    expect(h.run).not.toHaveBeenCalled();
  });

  it("if the installer refuses, the chip shows the error with no stale backup text, and Retry backs up again", async () => {
    backupEnds(DONE);
    const install = vi.fn<UpdateHandle["install"]>()
      .mockRejectedValueOnce(new Error("installer refused"))
      .mockResolvedValue(undefined);
    await readyUpdate(install);
    await installUpdate();
    expect(getUpdateSnapshot()).toMatchObject({ phase: "error", failedDuring: "install", backup: null });
    await installUpdate();
    expect(h.run).toHaveBeenCalledTimes(2);
    expect(install).toHaveBeenCalledTimes(2);
  });
});
