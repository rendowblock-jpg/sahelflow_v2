import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const constructed = vi.hoisted(() => [] as unknown[]);

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-updater", () => ({
  Update: class FakeUpdate {
    constructor(public metadata: unknown) {
      constructed.push(metadata);
    }
  },
}));

import { CHECK_FOR_UPDATE_COMMAND, checkForDesktopUpdate } from "../desktop-update-check";

beforeEach(() => {
  invoke.mockReset();
  constructed.length = 0;
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
