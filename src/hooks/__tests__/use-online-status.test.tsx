/**
 * @vitest-environment happy-dom
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useOnlineStatus } from "@/hooks/use-online-status";

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}

afterEach(() => {
  Reflect.deleteProperty(window.navigator, "onLine");
  vi.restoreAllMocks();
});

describe("useOnlineStatus", () => {
  it("reads navigator.onLine on the first client render", () => {
    setOnLine(true);
    expect(renderHook(() => useOnlineStatus()).result.current).toBe(true);
    setOnLine(false);
    expect(renderHook(() => useOnlineStatus()).result.current).toBe(false);
  });

  it("follows the offline and online events", () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });

  it("is true on the server, so the first paint never flashes an offline banner", () => {
    setOnLine(false);
    function Probe() {
      return createElement("span", null, String(useOnlineStatus()));
    }
    expect(renderToString(createElement(Probe))).toContain("true");
  });

  it("listens only to the two events, removes both on unmount and never polls", () => {
    setOnLine(true);
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const interval = vi.spyOn(globalThis, "setInterval");
    const { unmount } = renderHook(() => useOnlineStatus());
    const added = add.mock.calls.map((call) => call[0]).filter((name) => name === "online" || name === "offline");
    expect(added.sort()).toEqual(["offline", "online"]);
    unmount();
    const removed = remove.mock.calls.map((call) => call[0]).filter((name) => name === "online" || name === "offline");
    expect(removed.sort()).toEqual(["offline", "online"]);
    expect(interval).not.toHaveBeenCalled();
  });
});
