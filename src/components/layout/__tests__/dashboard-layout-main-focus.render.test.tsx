/**
 * @vitest-environment happy-dom
 */
/**
 * axe `scrollable-region-focusable`: #main-content scrolls (overflow-y-auto)
 * and was tabindex=-1 only, so a keyboard user could not scroll a page whose
 * content holds nothing focusable. It must join the tab order only while it
 * overflows and has no focusable content, and the skip link must still move
 * focus to it. happy-dom has no layout, so the sizes are faked on the element.
 */
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({
  usePathname: () => "/orders",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));
vi.mock("@/hooks/use-ui-density", () => ({ useUiDensity: () => ({ density: "comfortable" }) }));
vi.mock("@/hooks/use-keyboard-shortcuts", () => ({
  matchPhysicalLetter: () => false,
  useKeyboardShortcuts: () => ({ cheatsheetOpen: false, setCheatsheetOpen: vi.fn() }),
}));
vi.mock("@/lib/search/universal-search-client", () => ({
  warmUniversalSearchClient: async () => undefined,
}));
vi.mock("@/components/search/command-palette-seed", () => ({ seedCommandPalette: vi.fn() }));
vi.mock("@/components/layout/sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/layout/topbar", () => ({ Topbar: () => null }));

const size = { scroll: 400, client: 800 };

/**
 * happy-dom keeps a MutationObserver's listener only through a WeakRef, so after one garbage
 * collection it stops reporting (checked with node --expose-gc: 1 callback before, 0 after). The
 * coverage run allocates enough to collect in the middle of the "grows" test, which then never saw
 * the new paragraph. This stand-in holds its callback and fires it when the test says the DOM changed.
 */
const mutationCallbacks: Array<() => void> = [];
class TestMutationObserver {
  constructor(callback: MutationCallback) {
    mutationCallbacks.push(() => callback([], this as unknown as MutationObserver));
  }
  observe(): void {}
  disconnect(): void {}
  takeRecords(): MutationRecord[] {
    return [];
  }
}

beforeEach(() => {
  size.scroll = 400;
  size.client = 800;
  mutationCallbacks.length = 0;
  vi.stubGlobal("MutationObserver", TestMutationObserver);
  const fake = (read: () => number) => ({
    configurable: true,
    get(this: HTMLElement) {
      return this.id === "main-content" ? read() : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", fake(() => size.scroll));
  Object.defineProperty(HTMLElement.prototype, "clientHeight", fake(() => size.client));
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
});

function main(): HTMLElement {
  const element = document.getElementById("main-content");
  if (!element) throw new Error("#main-content is missing");
  return element;
}

describe("#main-content as a scrollable region", () => {
  it("a page that fits is not an extra tab stop", async () => {
    render(
      <DashboardLayout>
        <p>short page</p>
      </DashboardLayout>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(main().getAttribute("tabindex")).toBe("-1");
  });

  it("a page that scrolls and holds nothing focusable becomes a tab stop", async () => {
    size.scroll = 2000;
    render(
      <DashboardLayout>
        <p>long page of text</p>
      </DashboardLayout>,
    );
    await waitFor(() => expect(main().getAttribute("tabindex")).toBe("0"));
  });

  it("a page that scrolls but holds a focusable control stays out of the tab order", async () => {
    size.scroll = 2000;
    render(
      <DashboardLayout>
        <button type="button">Save</button>
      </DashboardLayout>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(main().getAttribute("tabindex")).toBe("-1");
  });

  it("follows the content when it grows after the first paint", async () => {
    render(
      <DashboardLayout>
        <p>starts short</p>
      </DashboardLayout>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(main().getAttribute("tabindex")).toBe("-1");
    size.scroll = 2000;
    await act(async () => {
      main().appendChild(document.createElement("p"));
      mutationCallbacks.forEach((fire) => fire());
    });
    await waitFor(() => expect(main().getAttribute("tabindex")).toBe("0"));
  });

  it("the skip link still targets #main-content and focus lands there in both states", async () => {
    size.scroll = 2000;
    render(
      <DashboardLayout>
        <p>long page of text</p>
      </DashboardLayout>,
    );
    const skip = screen.getByText("common.skipToContent").closest("a");
    expect(skip?.getAttribute("href")).toBe("#main-content");
    main().focus();
    expect(document.activeElement).toBe(main());
    await waitFor(() => expect(main().getAttribute("tabindex")).toBe("0"));
    (document.activeElement as HTMLElement).blur();
    main().focus();
    expect(document.activeElement).toBe(main());
  });
});
