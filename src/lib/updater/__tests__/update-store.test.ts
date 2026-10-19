import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  IDLE_SNAPSHOT,
  dispatchUpdate,
  getUpdateSnapshot,
  reduceUpdate,
  resetUpdateStoreForTests,
  subscribeUpdate,
  type UpdateAction,
  type UpdateSnapshot,
} from "../update-store";

const offer: UpdateAction = {
  type: "offer",
  version: "1.0.0-internal.45",
  date: "2026-10-19",
  notes: "notes",
};

function run(...actions: UpdateAction[]): UpdateSnapshot {
  return actions.reduce(reduceUpdate, IDLE_SNAPSHOT);
}

describe("update state machine", () => {
  it("walks the happy path: offer, download, ready, install", () => {
    expect(run(offer).phase).toBe("available");
    expect(run(offer, { type: "download-started" }).phase).toBe("downloading");
    expect(
      run(offer, { type: "download-started" }, { type: "download-finished" }),
    ).toMatchObject({ phase: "ready", percent: 100 });
    expect(
      run(
        offer,
        { type: "download-started" },
        { type: "download-finished" },
        { type: "install-started" },
      ),
    ).toMatchObject({ phase: "installing", percent: 100 });
  });

  it("carries the version, date and notes of what was offered", () => {
    expect(run(offer)).toMatchObject({
      version: "1.0.0-internal.45",
      date: "2026-10-19",
      notes: "notes",
      error: null,
      failedDuring: null,
    });
  });

  it("never starts a download or an install out of order", () => {
    expect(reduceUpdate(IDLE_SNAPSHOT, { type: "download-started" })).toBe(IDLE_SNAPSHOT);
    expect(reduceUpdate(IDLE_SNAPSHOT, { type: "install-started" })).toBe(IDLE_SNAPSHOT);
    const available = run(offer);
    expect(reduceUpdate(available, { type: "install-started" })).toBe(available);
    expect(reduceUpdate(available, { type: "download-finished" })).toBe(available);
  });

  it("never interrupts an update that is downloading, ready or installing", () => {
    const newer: UpdateAction = { ...offer, version: "1.0.0-internal.46" } as UpdateAction;
    const downloading = run(offer, { type: "download-started" });
    const ready = reduceUpdate(downloading, { type: "download-finished" });
    const installing = reduceUpdate(ready, { type: "install-started" });
    for (const state of [downloading, ready, installing]) {
      expect(reduceUpdate(state, newer)).toBe(state);
      expect(reduceUpdate(state, { type: "withdrawn" })).toBe(state);
    }
  });

  it("keeps the same snapshot when the same version is offered again", () => {
    const available = run(offer);
    expect(reduceUpdate(available, offer)).toBe(available);
  });

  it("replaces an offered update with a newer one", () => {
    const next = reduceUpdate(run(offer), { ...offer, version: "1.0.0-internal.46" } as UpdateAction);
    expect(next.version).toBe("1.0.0-internal.46");
    expect(next.phase).toBe("available");
  });

  it("withdraws an offer that is no longer served, but only before the download", () => {
    expect(run(offer, { type: "withdrawn" })).toBe(IDLE_SNAPSHOT);
  });

  it("progress only moves forward, stays whole and never reaches 100 early", () => {
    let state = run(offer, { type: "download-started" });
    const seen: number[] = [];
    for (const raw of [10.7, 5, 40, 40, 99.9, 100, 250, -3, Number.NaN]) {
      state = reduceUpdate(state, { type: "progress", percent: raw });
      seen.push(state.percent);
    }
    expect(seen).toEqual([10, 10, 40, 40, 99, 99, 99, 99, 99]);
    expect(reduceUpdate(state, { type: "download-finished" }).percent).toBe(100);
  });

  it("ignores progress when nothing is downloading", () => {
    const available = run(offer);
    expect(reduceUpdate(available, { type: "progress", percent: 50 })).toBe(available);
  });

  it("records which step failed and lets exactly that step be retried", () => {
    const downloadFailed = run(
      offer,
      { type: "download-started" },
      { type: "failed", stage: "download", message: "  network down  " },
    );
    expect(downloadFailed).toMatchObject({
      phase: "error",
      failedDuring: "download",
      error: "network down",
      percent: 0,
    });
    expect(reduceUpdate(downloadFailed, { type: "install-started" })).toBe(downloadFailed);
    expect(reduceUpdate(downloadFailed, { type: "download-started" })).toMatchObject({
      phase: "downloading",
      error: null,
      failedDuring: null,
    });

    const installFailed = run(
      offer,
      { type: "download-started" },
      { type: "download-finished" },
      { type: "install-started" },
      { type: "failed", stage: "install", message: "blocked" },
    );
    expect(installFailed).toMatchObject({ phase: "error", failedDuring: "install", percent: 100 });
    expect(reduceUpdate(installFailed, { type: "download-started" })).toBe(installFailed);
    expect(reduceUpdate(installFailed, { type: "install-started" }).phase).toBe("installing");
  });

  it("clips a very long error message and drops an empty one", () => {
    const long = run(
      offer,
      { type: "download-started" },
      { type: "failed", stage: "download", message: "x".repeat(5000) },
    );
    expect(long.error).toHaveLength(300);
    const empty = run(
      offer,
      { type: "download-started" },
      { type: "failed", stage: "download", message: "   " },
    );
    expect(empty.error).toBeNull();
  });

  it("ignores a failure report when nothing was in flight", () => {
    const available = run(offer);
    expect(reduceUpdate(available, { type: "failed", stage: "download", message: "late" })).toBe(
      available,
    );
  });
});

describe("update store", () => {
  beforeEach(() => resetUpdateStoreForTests());

  it("starts idle and notifies subscribers only when something changed", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUpdate(listener);
    expect(getUpdateSnapshot()).toBe(IDLE_SNAPSHOT);

    dispatchUpdate({ type: "download-started" }); // no-op while idle
    expect(listener).not.toHaveBeenCalled();

    dispatchUpdate(offer);
    expect(listener).toHaveBeenCalledTimes(1);
    dispatchUpdate(offer); // same version again: no change, no notification
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    dispatchUpdate({ type: "withdrawn" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getUpdateSnapshot().phase).toBe("idle");
  });

  it("hands React a stable snapshot between changes", () => {
    dispatchUpdate(offer);
    expect(getUpdateSnapshot()).toBe(getUpdateSnapshot());
  });
});
