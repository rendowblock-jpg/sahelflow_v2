import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const constructed = vi.hoisted(() => [] as unknown[]);

const channels = vi.hoisted(() => [] as Array<{ onmessage?: (message: unknown) => void }>);
const closed = vi.hoisted(() => [] as number[]);

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
  Channel: class FakeChannel {
    onmessage?: (message: unknown) => void;
    constructor() {
      channels.push(this);
    }
  },
}));
vi.mock("@tauri-apps/plugin-updater", () => ({
  Update: class FakeUpdate {
    constructor(public metadata: { rid: number; version: string; date?: string; body?: string }) {
      constructed.push(metadata);
    }
    get rid() {
      return this.metadata.rid;
    }
    get version() {
      return this.metadata.version;
    }
    get date() {
      return this.metadata.date;
    }
    get body() {
      return this.metadata.body;
    }
    async close() {
      closed.push(this.metadata.rid);
    }
  },
}));

import {
  CHECK_FOR_UPDATE_COMMAND,
  DOWNLOAD_UPDATE_COMMAND,
  INSTALL_DOWNLOADED_UPDATE_COMMAND,
  checkForDesktopUpdate,
} from "../desktop-update-check";
import type { UpdateDownloadEvent, UpdateHandle } from "../update-controller";

beforeEach(() => {
  invoke.mockReset();
  constructed.length = 0;
  channels.length = 0;
  closed.length = 0;
});

describe("checkForDesktopUpdate", () => {
  it("asks the desktop shell by its exact command name, with no arguments", async () => {
    invoke.mockResolvedValue(null);
    await checkForDesktopUpdate();
    expect(CHECK_FOR_UPDATE_COMMAND).toBe("check_for_update");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("check_for_update");
  });

  it("resolves to null when SahelFlow is up to date", async () => {
    invoke.mockResolvedValue(null);
    await expect(checkForDesktopUpdate()).resolves.toBeNull();
    expect(constructed).toHaveLength(0);
  });

  it("wraps an offer in the plugin's Update, so download and install work on it", async () => {
    invoke.mockResolvedValue({
      rid: 42,
      currentVersion: "1.0.0-internal.44",
      version: "1.0.0-internal.45",
      date: "2026-10-19T09:00:00Z",
      body: "Notes",
      rawJson: { version: "1.0.0-internal.45", pub_date: "2026-10-19T09:00:00Z" },
    });
    const update = await checkForDesktopUpdate();
    expect(update).not.toBeNull();
    expect(constructed).toEqual([
      {
        rid: 42,
        currentVersion: "1.0.0-internal.44",
        version: "1.0.0-internal.45",
        date: "2026-10-19T09:00:00Z",
        body: "Notes",
        rawJson: { version: "1.0.0-internal.45", pub_date: "2026-10-19T09:00:00Z" },
      },
    ]);
  });

  it("turns a missing date, body or raw answer into the plugin's own empty values", async () => {
    invoke.mockResolvedValue({
      rid: 7,
      currentVersion: "1.0.0-internal.44",
      version: "1.0.0-internal.45",
      date: null,
      body: null,
      rawJson: null,
    });
    await checkForDesktopUpdate();
    expect(constructed).toEqual([
      {
        rid: 7,
        currentVersion: "1.0.0-internal.44",
        version: "1.0.0-internal.45",
        date: undefined,
        body: undefined,
        rawJson: {},
      },
    ]);
  });

  it.each([
    ["a number", 3],
    ["a string", "update"],
    ["an object without a resource id", { version: "1", currentVersion: "0" }],
    ["an object without a version", { rid: 1, currentVersion: "0" }],
    ["an object with a text resource id", { rid: "1", version: "1", currentVersion: "0" }],
  ])("refuses %s instead of building a broken update", async (_label, answer) => {
    invoke.mockResolvedValue(answer);
    await expect(checkForDesktopUpdate()).rejects.toThrow(/could not read/);
    expect(constructed).toHaveLength(0);
  });

  it("lets a refusal or a network failure reach the caller untouched", async () => {
    invoke.mockRejectedValue(new Error("Command check_for_update not allowed by ACL"));
    await expect(checkForDesktopUpdate()).rejects.toThrow("not allowed by ACL");
    invoke.mockRejectedValue("error sending request for url");
    await expect(checkForDesktopUpdate()).rejects.toBe("error sending request for url");
  });
});

describe("the update the shell hands back downloads and installs through the shell's own commands", () => {
  const OFFER = {
    rid: 42,
    currentVersion: "1.0.0-internal.45",
    version: "1.0.0-internal.46",
    date: "2026-10-23T21:08:00Z",
    body: "Notes",
    rawJson: {},
  };

  async function offered(): Promise<UpdateHandle> {
    invoke.mockResolvedValueOnce(OFFER);
    const update = await checkForDesktopUpdate();
    expect(update).not.toBeNull();
    return update as UpdateHandle;
  }

  it("names its two commands exactly as the desktop shell registers them", () => {
    expect(DOWNLOAD_UPDATE_COMMAND).toBe("download_update");
    expect(INSTALL_DOWNLOADED_UPDATE_COMMAND).toBe("install_downloaded_update");
  });

  it("shows the version, date and notes of the offer", async () => {
    const update = await offered();
    expect(update.version).toBe("1.0.0-internal.46");
    expect(update.date).toBe("2026-10-23T21:08:00Z");
    expect(update.body).toBe("Notes");
  });

  it("downloads through download_update with the offer's resource id and one channel", async () => {
    const update = await offered();
    invoke.mockResolvedValueOnce(99);
    await update.download(() => undefined);
    expect(invoke).toHaveBeenLastCalledWith("download_update", { rid: 42, onEvent: channels[0] });
    expect(channels).toHaveLength(1);
  });

  it("turns the shell's running totals into the Started / Progress / Finished events the controller reads", async () => {
    const update = await offered();
    const events: UpdateDownloadEvent[] = [];
    invoke.mockImplementationOnce(async () => {
      const channel = channels[0]!;
      channel.onmessage?.({ event: "Progress", data: { downloaded: 1_000, contentLength: 10_000 } });
      channel.onmessage?.({ event: "Progress", data: { downloaded: 4_000, contentLength: 10_000 } });
      // The same figure twice, and a figure that went down, add nothing.
      channel.onmessage?.({ event: "Progress", data: { downloaded: 4_000, contentLength: 10_000 } });
      channel.onmessage?.({ event: "Progress", data: { downloaded: 3_000, contentLength: 10_000 } });
      channel.onmessage?.({ event: "Progress", data: { downloaded: 10_000, contentLength: 10_000 } });
      channel.onmessage?.({ event: "Finished" });
      return 99;
    });
    await update.download((event) => events.push(event));
    expect(events).toEqual([
      { event: "Started", data: { contentLength: 10_000 } },
      { event: "Progress", data: { chunkLength: 1_000 } },
      { event: "Progress", data: { chunkLength: 3_000 } },
      { event: "Progress", data: { chunkLength: 6_000 } },
      { event: "Finished" },
    ]);
    const chunks = events.flatMap((event) => (event.event === "Progress" ? [event.data.chunkLength] : []));
    expect(chunks.reduce((sum, value) => sum + value, 0)).toBe(10_000);
  });

  it("starts without a total when the server gave none", async () => {
    const update = await offered();
    const events: UpdateDownloadEvent[] = [];
    invoke.mockImplementationOnce(async () => {
      channels[0]!.onmessage?.({ event: "Progress", data: { downloaded: 500, contentLength: null } });
      return 99;
    });
    await update.download((event) => events.push(event));
    expect(events[0]).toEqual({ event: "Started", data: { contentLength: undefined } });
  });

  it("downloads fine when nobody listens for progress", async () => {
    const update = await offered();
    invoke.mockImplementationOnce(async () => {
      channels[0]!.onmessage?.({ event: "Progress", data: { downloaded: 500, contentLength: 1_000 } });
      return 99;
    });
    await expect(update.download()).resolves.toBeUndefined();
  });

  it("installs the bytes the download kept, with the offer's resource id", async () => {
    const update = await offered();
    invoke.mockResolvedValueOnce(99);
    await update.download();
    invoke.mockResolvedValueOnce(undefined);
    await update.install();
    expect(invoke).toHaveBeenLastCalledWith("install_downloaded_update", { rid: 42, bytesRid: 99 });
  });

  it("refuses to install before anything was downloaded, and asks the shell nothing", async () => {
    const update = await offered();
    invoke.mockClear();
    await expect(update.install()).rejects.toThrow(/before it was downloaded/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps the downloaded bytes when the install fails, so Retry can install again", async () => {
    const update = await offered();
    invoke.mockResolvedValueOnce(99);
    await update.download();
    invoke.mockRejectedValueOnce(new Error("the installer did not start"));
    await expect(update.install()).rejects.toThrow("did not start");
    invoke.mockResolvedValueOnce(undefined);
    await update.install();
    expect(invoke).toHaveBeenLastCalledWith("install_downloaded_update", { rid: 42, bytesRid: 99 });
  });

  it("lets a failed download reach the controller untouched", async () => {
    const update = await offered();
    invoke.mockRejectedValueOnce("error sending request for url");
    await expect(update.download()).rejects.toBe("error sending request for url");
  });

  it("never calls the plugin's own noisy download or install commands", async () => {
    const update = await offered();
    invoke.mockResolvedValueOnce(99);
    await update.download();
    invoke.mockResolvedValueOnce(undefined);
    await update.install();
    const names = invoke.mock.calls.map((call) => call[0]);
    expect(names).toEqual(["check_for_update", "download_update", "install_downloaded_update"]);
    expect(names.some((name) => String(name).startsWith("plugin:updater"))).toBe(false);
  });

  it("frees the offer's resource when the controller lets go of it", async () => {
    const update = await offered();
    await update.close?.();
    expect(closed).toEqual([42]);
  });
});
