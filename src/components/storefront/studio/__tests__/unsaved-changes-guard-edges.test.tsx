/**
 * @vitest-environment happy-dom
 */
/** Edges of the unsaved-changes guard: https pages, every modifier, other-origin schemes, and what the click handler forwards. */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  UnsavedChangesGuard,
  resolveGuardedNavigation,
  type GuardClick,
} from "@/components/storefront/studio/unsaved-changes-guard";
import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-i18n", () => ({ useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }) }));

afterEach(() => cleanup());

const https: GuardClick = {
  dirty: true,
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  href: "/orders",
  target: null,
  download: false,
  currentUrl: "https://app.sahelflow.test/storefronts/sf1/studio",
};

describe("resolveGuardedNavigation edges", () => {
  it.each([
    ["a relative link on an https page", { href: "/orders?tab=late#top" }, "/orders?tab=late#top"],
    ["an absolute same-origin https link", { href: "https://app.sahelflow.test/orders" }, "/orders"],
    ["target _self", { target: "_self" }, "/orders"],
    ["same page, another query", { href: "/storefronts/sf1/studio?tab=x" }, "/storefronts/sf1/studio?tab=x"],
    ["same page, same query", { href: "/storefronts/sf1/studio" }, null],
    ["target _top", { target: "_top" }, null],
    ["a blob: URL of this origin", { href: "blob:https://app.sahelflow.test/1234-abcd" }, null],
    ["javascript:", { href: "javascript:void(0)" }, null],
    ["shift-click", { shiftKey: true }, null],
    ["alt-click", { altKey: true }, null],
    ["ctrl-click", { ctrlKey: true }, null],
    ["cmd-click", { metaKey: true }, null],
    ["right button", { button: 2 }, null],
    ["a download", { download: true }, null],
    ["http page, http link", { currentUrl: "http://localhost:3000/storefronts/sf1/studio" }, "/orders"],
    ["a broken current URL", { currentUrl: "not a url" }, null],
  ] as const)("%s", (_name, patch, expected) => {
    expect(resolveGuardedNavigation({ ...https, ...patch })).toBe(expected);
  });
});

describe("UnsavedChangesGuard forwards the click as it was", () => {
  function mountDirty() {
    return render(
      <div>
        <a href="/orders" data-testid="away">Orders</a>
        <a href="/orders.csv" download data-testid="download">CSV</a>
        <a href="/orders" target="_blank" rel="noreferrer" data-testid="tab">Tab</a>
        <UnsavedChangesGuard dirty />
      </div>,
    );
  }
  // The modifiers are set on the event itself (happy-dom may ignore them in the init), and the
  // dispatch runs inside act so the dialog a wrong decision would open is already on screen.
  const fire = (testId: string, init: MouseEventInit = {}) => {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries(init)) Object.defineProperty(event, key, { value, configurable: true });
    act(() => {
      screen.getByTestId(testId).dispatchEvent(event);
    });
    return event;
  };

  it.each([
    ["ctrl", { ctrlKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
    ["meta", { metaKey: true }],
    ["middle button", { button: 1 }],
  ] as const)("%s-click is left to the browser: no stop, no dialog", (_name, init) => {
    mountDirty();
    const event = fire("away", init);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("a download and a new-tab link are left alone", () => {
    mountDirty();
    expect(fire("download").defaultPrevented).toBe(false);
    expect(fire("tab").defaultPrevented).toBe(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("a click somebody else already handled is left alone", () => {
    mountDirty();
    const handled = (event: Event) => event.preventDefault();
    window.addEventListener("click", handled, true);
    try {
      fire("away");
    } finally {
      window.removeEventListener("click", handled, true);
    }
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("stops the click before the link's own handlers and asks first", async () => {
    mountDirty();
    const own = vi.fn();
    screen.getByTestId("away").addEventListener("click", own);
    const event = fire("away");
    expect(event.defaultPrevented).toBe(true);
    expect(own).not.toHaveBeenCalled();
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
  });
});
