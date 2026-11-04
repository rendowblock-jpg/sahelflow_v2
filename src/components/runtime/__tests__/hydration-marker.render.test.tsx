/**
 * @vitest-environment happy-dom
 */
/**
 * R50 hydr, item 2 (sweep class `not-hydrated`, 32 hits): the checks and the browser harness wait for
 * `html[data-sf-hydrated="true"]`, but only the dashboard shell and the sign-in pages ever set it. The public hosted
 * store pages and the 404 page hydrate for real (React props on every control, a click on FR/EN/عربية flips
 * `aria-pressed`, no page error, no failed chunk), they simply never said so. `HydrationMarker` is the marker-only
 * twin of `RuntimeUiReadyBeacon`: it sets the same attribute and does NOT call the desktop readiness endpoint.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HydrationMarker } from "@/components/runtime/hydration-marker";
import { RuntimeUiReadyBeacon } from "@/components/runtime/runtime-ui-ready-beacon";

const root = () => document.documentElement;

afterEach(() => {
  cleanup();
  delete root().dataset.sfHydrated;
  vi.unstubAllGlobals();
});

describe("HydrationMarker", () => {
  it("sets html[data-sf-hydrated=true] once it has mounted, and clears it when the page unmounts", () => {
    expect(root().dataset.sfHydrated).toBeUndefined();
    const view = render(<HydrationMarker />);
    expect(root().dataset.sfHydrated).toBe("true");
    view.unmount();
    expect(root().dataset.sfHydrated).toBeUndefined();
  });

  it("draws nothing", () => {
    const view = render(<HydrationMarker />);
    expect(view.container.innerHTML).toBe("");
  });

  it("never calls the desktop readiness endpoint (that belongs to the app shell only)", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<HydrationMarker />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a marker that the dashboard shell already set alone when it unmounts (the shell is still hydrated)", () => {
    root().dataset.sfHydrated = "true"; // set by RuntimeUiReadyBeacon, which stays mounted in the shell
    const view = render(<HydrationMarker />);
    view.unmount();
    expect(root().dataset.sfHydrated).toBe("true");
  });

  it("is the same attribute the app shell beacon writes", () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network"))));
    render(<RuntimeUiReadyBeacon />);
    expect(root().dataset.sfHydrated).toBe("true");
  });
});
