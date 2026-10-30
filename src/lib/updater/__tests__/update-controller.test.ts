import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests are about the download and install steps; the backup has its own file.
vi.mock("../pre-update-backup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../pre-update-backup")>()),
  runPreUpdateBackup: vi.fn(async () => ({ kind: "done", backupId: "backup-1", durationMs: 1 })),
}));

import {
  downloadUpdate,
  installUpdate,
  offerUpdate,
  resetUpdateControllerForTests,
  retryUpdate,
  withdrawUpdate,
  type UpdateDownloadEvent,
  type UpdateHandle,
} from "../update-controller";
import { getUpdateSnapshot, subscribeUpdate } from "../update-store";

function fakeHandle(overrides: Partial<UpdateHandle> = {}): UpdateHandle & {
  download: ReturnType<typeof vi.fn>;
  install: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  return {
    version: "1.0.0-internal.45",
    date: "2026-10-19",
    body: "  What changed  ",
    download: vi.fn(async (onEvent?: (event: UpdateDownloadEvent) => void) => {
      onEvent?.({ event: "Started", data: { contentLength: 1000 } });
      for (let i = 0; i < 4; i += 1) onEvent?.({ event: "Progress", data: { chunkLength: 250 } });
      onEvent?.({ event: "Finished" });
    }),
    install: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    ...overrides,
  } as never;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => resetUpdateControllerForTests());

describe("update controller", () => {
  it("an offer only shows the chip: nothing is downloaded or installed", () => {
    const handle = fakeHandle();
    offerUpdate(handle);
    expect(getUpdateSnapshot()).toMatchObject({
      phase: "available",
      version: "1.0.0-internal.45",
      notes: "What changed",
    });
    expect(handle.download).not.toHaveBeenCalled();
    expect(handle.install).not.toHaveBeenCalled();
  });

  it("downloads on request, reports honest progress, then becomes ready", async () => {
    const handle = fakeHandle();
    const percents: number[] = [];
    offerUpdate(handle);
    subscribeUpdate(() => percents.push(getUpdateSnapshot().percent));

    await downloadUpdate();

    expect(handle.download).toHaveBeenCalledTimes(1);
    // 0 = download started; the last chunk reads 99 until the download is confirmed finished.
    expect(percents).toEqual([0, 25, 50, 75, 99, 100]);
    expect(getUpdateSnapshot()).toMatchObject({ phase: "ready", percent: 100 });
    expect(handle.install).not.toHaveBeenCalled(); // never installs by itself
  });

  it("installs only when the seller restarts, and only once", async () => {
    const handle = fakeHandle();
    offerUpdate(handle);
    await downloadUpdate();

    const gate = deferred();
    handle.install.mockImplementationOnce(() => gate.promise);
    const first = installUpdate();
    const second = installUpdate(); // a double click
    expect(getUpdateSnapshot().phase).toBe("installing");
    gate.resolve();
    await Promise.all([first, second]);

    expect(handle.install).toHaveBeenCalledTimes(1);
  });

  it("refuses to install before the download finished", async () => {
    const handle = fakeHandle();
    offerUpdate(handle);
    await installUpdate();
    expect(handle.install).not.toHaveBeenCalled();
    expect(getUpdateSnapshot().phase).toBe("available");
  });

  it("refuses to download twice at the same time", async () => {
    const gate = deferred();
    const handle = fakeHandle({ download: vi.fn(() => gate.promise) as never });
    offerUpdate(handle);
    const first = downloadUpdate();
    const second = downloadUpdate();
    gate.resolve();
    await Promise.all([first, second]);
    expect(handle.download).toHaveBeenCalledTimes(1);
  });

  it("a failed download is shown, and Try again repeats that step", async () => {
    const handle = fakeHandle();
    handle.download.mockRejectedValueOnce(new Error("network down"));
    offerUpdate(handle);

    await downloadUpdate();
    expect(getUpdateSnapshot()).toMatchObject({
      phase: "error",
      failedDuring: "download",
      error: "network down",
    });

    await retryUpdate();
    expect(handle.download).toHaveBeenCalledTimes(2);
    expect(getUpdateSnapshot().phase).toBe("ready");
  });

  it("a failed install keeps the downloaded update, and Try again re-runs only the install", async () => {
    const handle = fakeHandle();
    handle.install.mockRejectedValueOnce(new Error("installer would not start"));
    offerUpdate(handle);
    await downloadUpdate();

    await installUpdate();
    expect(getUpdateSnapshot()).toMatchObject({ phase: "error", failedDuring: "install" });

    await retryUpdate();
    expect(handle.download).toHaveBeenCalledTimes(1); // not downloaded again
    expect(handle.install).toHaveBeenCalledTimes(2);
    expect(getUpdateSnapshot().phase).toBe("installing");
  });

  it("a later check never interrupts a download or a ready update, and frees its own handle", async () => {
    const gate = deferred();
    const first = fakeHandle({ download: vi.fn(() => gate.promise) as never });
    offerUpdate(first);
    const downloading = downloadUpdate();

    const second = fakeHandle({ version: "1.0.0-internal.46" });
    offerUpdate(second);
    expect(getUpdateSnapshot().version).toBe("1.0.0-internal.45");
    expect(second.close).toHaveBeenCalledTimes(1);

    gate.resolve();
    await downloading;
    const third = fakeHandle({ version: "1.0.0-internal.47" });
    offerUpdate(third);
    expect(getUpdateSnapshot()).toMatchObject({ phase: "ready", version: "1.0.0-internal.45" });
    expect(third.close).toHaveBeenCalledTimes(1);
  });

  it("replacing an offer frees the handle it replaces", () => {
    const old = fakeHandle();
    offerUpdate(old);
    offerUpdate(fakeHandle({ version: "1.0.0-internal.46" }));
    expect(old.close).toHaveBeenCalledTimes(1);
  });

  it("an update that is no longer served disappears and frees its handle", () => {
    const handle = fakeHandle();
    offerUpdate(handle);
    withdrawUpdate();
    expect(getUpdateSnapshot().phase).toBe("idle");
    expect(handle.close).toHaveBeenCalledTimes(1);
  });

  it("withdrawing never discards an update that is already downloaded", async () => {
    const handle = fakeHandle();
    offerUpdate(handle);
    await downloadUpdate();
    withdrawUpdate();
    expect(getUpdateSnapshot().phase).toBe("ready");
    expect(handle.close).not.toHaveBeenCalled();
  });

  it("stays quiet about a handle without a close method", () => {
    const handle = fakeHandle();
    delete (handle as { close?: unknown }).close;
    expect(() => {
      offerUpdate(handle);
      withdrawUpdate();
    }).not.toThrow();
  });
});
