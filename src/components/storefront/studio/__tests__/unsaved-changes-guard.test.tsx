/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  UnsavedChangesGuard,
  resolveGuardedNavigation,
} from "@/components/storefront/studio/unsaved-changes-guard";
import { render } from "@/test-utils/render";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

afterEach(() => {
  cleanup();
  router.push.mockReset();
});

const click = {
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
  currentUrl: "http://localhost:3000/storefronts/sf1/studio",
};

describe("resolveGuardedNavigation", () => {
  it.each([
    ["an internal link while dirty", {}, "/orders"],
    ["keeps search and hash", { href: "/orders?tab=late#top" }, "/orders?tab=late#top"],
    ["a clean draft is never stopped", { dirty: false }, null],
    ["a hash-only jump on this page", { href: "#sections" }, null],
    ["same page, other hash", { href: "/storefronts/sf1/studio#x" }, null],
    ["another origin (beforeunload owns it)", { href: "https://example.com/a" }, null],
    ["a new tab", { target: "_blank" }, null],
    ["ctrl-click", { ctrlKey: true }, null],
    ["cmd-click", { metaKey: true }, null],
    ["middle click", { button: 1 }, null],
    ["already handled by someone else", { defaultPrevented: true }, null],
    ["a download", { download: true }, null],
    ["mailto", { href: "mailto:a@b.dz" }, null],
    ["an anchor with no href", { href: null }, null],
  ] as const)("%s", (_name, patch, expected) => {
    expect(resolveGuardedNavigation({ ...click, ...patch })).toBe(expected);
  });
});

describe("UnsavedChangesGuard", () => {
  function mount(dirty: boolean) {
    return render(
      <div>
        <a href="/orders" data-testid="away">Orders</a>
        <UnsavedChangesGuard dirty={dirty} />
      </div>,
    );
  }

  it("stops an in-app link while dirty and asks first", async () => {
    mount(true);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    screen.getByTestId("away").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("Stay keeps the editor open and goes nowhere", async () => {
    mount(true);
    screen.getByTestId("away").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    fireEvent.click(await screen.findByRole("button", { name: "storefront.studioStates.unsaved.stay" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(router.push).not.toHaveBeenCalled();
  });

  it("Leave goes to the clicked destination", async () => {
    mount(true);
    screen.getByTestId("away").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    fireEvent.click(await screen.findByRole("button", { name: "storefront.studioStates.unsaved.leave" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/orders"));
  });

  it("does not interfere when nothing is unsaved", () => {
    mount(false);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    screen.getByTestId("away").dispatchEvent(event);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("asks the browser to confirm a tab close or reload only while dirty", () => {
    mount(true);
    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
    cleanup();
    mount(false);
    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
  });
});
