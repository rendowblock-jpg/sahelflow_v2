import { beforeEach, describe, expect, it, vi } from "vitest";

// F-0009: on Windows the notification plugin has no `register_listener` command (it is a mobile command), so
// `onAction` rejects on every page load with "Command plugin:notification|registerListener not allowed by ACL".
// Nobody caught it: the rejection surfaced as an unhandled error on 264 of 276 lab page visits.

const state = vi.hoisted(() => ({ tauri: true }));
const plugin = vi.hoisted(() => ({
  onAction: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ isTauriEnv: () => state.tauri }));
vi.mock("@tauri-apps/plugin-notification", () => ({
  onAction: plugin.onAction,
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

import { listenForDesktopNotificationActions } from "../native-client";

describe("listenForDesktopNotificationActions", () => {
  beforeEach(() => {
    state.tauri = true;
  });

  it("returns a callable that does nothing when the plugin cannot register a listener on this platform", async () => {
    plugin.onAction.mockRejectedValue(
      new Error("Command plugin:notification|registerListener not allowed by ACL"),
    );

    const stop = await listenForDesktopNotificationActions(() => undefined);

    expect(typeof stop).toBe("function");
    expect(() => stop()).not.toThrow();
  });

  it("still forwards a clicked notification's safe link when the listener registers", async () => {
    const unregister = vi.fn();
    let deliver: (notification: { extra?: { link?: unknown } }) => void = () => undefined;
    plugin.onAction.mockImplementation(async (handler: typeof deliver) => {
      deliver = handler;
      return { unregister };
    });
    const opened: string[] = [];

    const stop = await listenForDesktopNotificationActions((link) => opened.push(link));
    deliver({ extra: { link: "/orders" } });
    deliver({ extra: { link: "https://example.com/phish" } });
    deliver({ extra: {} });
    stop();

    expect(opened).toEqual(["/orders"]);
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it("does not touch the plugin outside the desktop shell", async () => {
    state.tauri = false;

    const stop = await listenForDesktopNotificationActions(() => undefined);

    expect(plugin.onAction).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });
});
